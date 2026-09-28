import { useEffect, useRef, useState } from "react";
import { requestRoutePreview } from "../api/placesApi";
import { bearingBetween, distanceMetersBetween } from "../utils/recommendationPlaces";
import { distanceToRouteMeters } from "../utils/courseNavigation";

const ARRIVAL_RADIUS_METERS = 30;
const ARRIVAL_DWELL_SECONDS = 60;
const MAX_ACCEPTED_GPS_ACCURACY_METERS = 80;
const MAX_ARRIVAL_GPS_ACCURACY_METERS = 35;

/** GPS·방향 센서·도착 판정·안내 경로 재탐색을 관리한다. */
export function useCourseGuidanceTracking({
  guidanceStarted,
  guideDestination,
  fallbackOrigin,
  guideTransportMode,
  guideStopCount,
  setGuideStep,
}) {
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState("idle");
  const [deviceHeading, setDeviceHeading] = useState(null);
  const [guideRoute, setGuideRoute] = useState(null);
  const [guideRouteStatus, setGuideRouteStatus] = useState("idle");
  const [arrivalSeconds, setArrivalSeconds] = useState(0);
  const lastLiveLocation = useRef(null);
  const lastGuideRouteRequest = useRef(null);
  const routeDeviationRef = useRef({ count: 0, lastRerouteAt: 0 });
  const arrivalRef = useRef({ targetId: null, enteredAt: null, lastLocationAt: null });
  const lastHeadingRef = useRef({ value: null, updatedAt: 0 });
  const guideOrigin = liveLocation ?? fallbackOrigin;

  useEffect(() => {
    if (!guidanceStarted) {
      lastLiveLocation.current = null;
      setLiveLocation(null);
      setLiveLocationStatus("idle");
      arrivalRef.current = { targetId: null, enteredAt: null, lastLocationAt: null };
      setArrivalSeconds(0);
      return undefined;
    }
    if (!navigator.geolocation) {
      setLiveLocationStatus("unavailable");
      return undefined;
    }

    let watchId = null;
    const stopWatch = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    const startWatch = () => {
      stopWatch();
      setLiveLocationStatus("requesting");
      watchId = navigator.geolocation.watchPosition((position) => {
        // 오차가 큰 위치는 지도·도착 판정·경로 재탐색에 반영하지 않는다.
        if (Number.isFinite(position.coords.accuracy) && position.coords.accuracy > MAX_ACCEPTED_GPS_ACCURACY_METERS) {
          setLiveLocationStatus("low_accuracy");
          return;
        }
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          updatedAt: Date.now(),
        };
        const previous = lastLiveLocation.current;
        const elapsed = Date.now() - (previous?.updatedAt ?? 0);
        if (!previous || distanceMetersBetween(previous, nextLocation) >= 10 || elapsed >= 5000) {
          const movedDistance = previous ? distanceMetersBetween(previous, nextLocation) : 0;
          const gpsHeading = Number.isFinite(position.coords.heading) && position.coords.heading >= 0
            ? position.coords.heading
            : movedDistance >= 4 ? bearingBetween(previous, nextLocation) : null;
          if (Number.isFinite(gpsHeading)) {
            setDeviceHeading(Math.round(gpsHeading));
            document.documentElement.style.setProperty("--device-heading", `${Math.round(gpsHeading)}deg`);
          }
          lastLiveLocation.current = { ...nextLocation, updatedAt: Date.now() };
          setLiveLocation(nextLocation);
        }
        setLiveLocationStatus("ready");
      }, (error) => {
        setLiveLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") startWatch();
      else stopWatch();
    };
    startWatch();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", startWatch);
    return () => {
      stopWatch();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", startWatch);
    };
  }, [guidanceStarted]);

  useEffect(() => {
    if (!guidanceStarted) {
      setDeviceHeading(null);
      return undefined;
    }
    const handleOrientation = (event) => {
      const heading = Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : Number.isFinite(event.alpha) ? (360 - event.alpha) % 360 : null;
      if (heading === null) return;
      const now = Date.now();
      const previous = lastHeadingRef.current;
      const delta = previous.value === null ? 360 : Math.abs(((heading - previous.value + 540) % 360) - 180);
      if (delta >= 5 && now - previous.updatedAt >= 250) {
        lastHeadingRef.current = { value: heading, updatedAt: now };
        document.documentElement.style.setProperty("--device-heading", `${Math.round(heading)}deg`);
        setDeviceHeading(Math.round(heading));
      }
    };
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [guidanceStarted]);

  useEffect(() => {
    if (!guidanceStarted || !guideDestination || !liveLocation) return;
    const distance = distanceMetersBetween(liveLocation, guideDestination);
    const current = arrivalRef.current;
    const accuracyOk = !Number.isFinite(liveLocation.accuracy) || liveLocation.accuracy <= MAX_ARRIVAL_GPS_ACCURACY_METERS;
    if (distance <= ARRIVAL_RADIUS_METERS && accuracyOk) {
      if (current.targetId !== guideDestination.id || !current.enteredAt) {
        arrivalRef.current = { targetId: guideDestination.id, enteredAt: Date.now(), lastLocationAt: liveLocation.updatedAt };
        setArrivalSeconds(0);
      } else {
        arrivalRef.current = { ...current, lastLocationAt: liveLocation.updatedAt };
      }
    } else if (current.targetId === guideDestination.id) {
      arrivalRef.current = { targetId: guideDestination.id, enteredAt: null, lastLocationAt: liveLocation.updatedAt };
      setArrivalSeconds(0);
    }
  }, [guidanceStarted, guideDestination, liveLocation]);

  useEffect(() => {
    if (!guidanceStarted || !guideDestination) return undefined;
    const timer = window.setInterval(() => {
      const current = arrivalRef.current;
      if (current.targetId !== guideDestination.id || !current.enteredAt) return;
      if (!current.lastLocationAt || Date.now() - current.lastLocationAt > 20000) {
        setArrivalSeconds(0);
        return;
      }
      const elapsedSeconds = Math.floor((Date.now() - current.enteredAt) / 1000);
      setArrivalSeconds(Math.min(ARRIVAL_DWELL_SECONDS, elapsedSeconds));
      if (elapsedSeconds >= ARRIVAL_DWELL_SECONDS) {
        arrivalRef.current = { targetId: null, enteredAt: null, lastLocationAt: null };
        setArrivalSeconds(0);
        setGuideStep((currentStep) => Math.min(currentStep + 1, guideStopCount));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guidanceStarted, guideDestination, guideStopCount, setGuideStep]);

  useEffect(() => {
    if (!guidanceStarted || !guideDestination || !guideOrigin) {
      if (!guidanceStarted) setGuideRoute(null);
      return undefined;
    }
    const previous = lastGuideRouteRequest.current;
    const targetChanged = previous?.targetId !== guideDestination.id || previous?.transportMode !== guideTransportMode;
    const deviationThreshold = guideTransportMode === "walk" ? 45 : 90;
    const deviation = guideRoute ? distanceToRouteMeters(guideOrigin, guideRoute) : Infinity;
    if (!targetChanged && guideRoute && deviation > deviationThreshold) routeDeviationRef.current.count += 1;
    else if (!targetChanged) routeDeviationRef.current.count = 0;
    const now = Date.now();
    const shouldReroute = routeDeviationRef.current.count >= 2 && now - routeDeviationRef.current.lastRerouteAt >= 20000;
    if (!targetChanged && guideRoute && !shouldReroute) return undefined;
    let cancelled = false;
    lastGuideRouteRequest.current = { ...guideOrigin, targetId: guideDestination.id, transportMode: guideTransportMode };
    if (targetChanged) {
      setGuideRoute(null);
      routeDeviationRef.current = { count: 0, lastRerouteAt: 0 };
    } else {
      routeDeviationRef.current = { count: 0, lastRerouteAt: now };
    }
    setGuideRouteStatus(shouldReroute ? "rerouting" : "loading");
    requestRoutePreview({
      startLatitude: guideOrigin.latitude,
      startLongitude: guideOrigin.longitude,
      endLatitude: guideDestination.latitude,
      endLongitude: guideDestination.longitude,
      transportMode: guideTransportMode,
    })
      .then((route) => {
        if (!cancelled) {
          setGuideRoute(route);
          setGuideRouteStatus("ready");
        }
      })
      .catch(() => { if (!cancelled) setGuideRouteStatus("error"); });
    return () => { cancelled = true; };
  }, [guidanceStarted, guideDestination, guideOrigin, guideTransportMode, guideRoute]);

  return {
    liveLocation,
    liveLocationStatus,
    deviceHeading,
    guideRoute,
    guideRouteStatus,
    arrivalSeconds,
    arrivalDwellSeconds: ARRIVAL_DWELL_SECONDS,
    guideOrigin,
  };
}
