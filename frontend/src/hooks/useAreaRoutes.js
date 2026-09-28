import { useCallback, useEffect, useRef, useState } from "react";
import { requestRoutePreview } from "../api/placesApi";

/** 지역 카드의 출발지 경로와 이동시간 캐시를 관리한다. */
export function useAreaRoutes({ selectedArea, rankingAreas, startLocation, transportMode }) {
  const [routeCache, setRouteCache] = useState({});
  const [routeLoading, setRouteLoading] = useState({});
  const [routeErrors, setRouteErrors] = useState({});
  const requestingRouteKeys = useRef(new Set());
  const routeCacheKey = selectedArea?.latitude != null && selectedArea?.longitude != null
    ? `${transportMode}:${Number(selectedArea.latitude).toFixed(5)},${Number(selectedArea.longitude).toFixed(5)}`
    : null;

  const prepareAreaRoute = useCallback((area) => {
    if (!area || area.latitude == null || area.longitude == null) return;
    const areaKey = `${transportMode}:${Number(area.latitude).toFixed(5)},${Number(area.longitude).toFixed(5)}`;
    if (routeCache[areaKey] || requestingRouteKeys.current.has(areaKey)) return;
    requestingRouteKeys.current.add(areaKey);
    setRouteLoading((current) => ({ ...current, [areaKey]: true }));
    requestRoutePreview({
      startLatitude: startLocation.latitude,
      startLongitude: startLocation.longitude,
      endLatitude: area.latitude,
      endLongitude: area.longitude,
      transportMode,
    })
      .then((route) => {
        // 경로 미리보기는 보조 기능이므로 API에 경로가 없을 때 기존 지역 정보는 그대로 둔다.
        if (!route) return;
        setRouteCache((current) => ({ ...current, [areaKey]: route }));
        setRouteErrors((current) => {
          const next = { ...current };
          delete next[areaKey];
          return next;
        });
      })
      .catch((error) => setRouteErrors((current) => ({
        ...current,
        [areaKey]: error?.message ?? "상세 경로를 확인하지 못했어요.",
      })))
      .finally(() => {
        requestingRouteKeys.current.delete(areaKey);
        setRouteLoading((current) => ({ ...current, [areaKey]: false }));
      });
  }, [routeCache, startLocation.latitude, startLocation.longitude, transportMode]);

  useEffect(() => {
    if (routeCacheKey) prepareAreaRoute(selectedArea);
  }, [routeCacheKey, selectedArea, prepareAreaRoute]);

  useEffect(() => {
    // 카드에 표시할 경로가 없는 추천 지역만 짧은 간격으로 미리 준비한다.
    const pendingAreas = rankingAreas.filter((area) => !area.hasPreparedMapRoute);
    const timers = pendingAreas.map((area, index) =>
      window.setTimeout(() => prepareAreaRoute(area), 250 + index * 180),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [rankingAreas, prepareAreaRoute]);

  const selectedAreaRoute = (routeCacheKey && routeCache[routeCacheKey]) ?? selectedArea?.startRoute ?? null;
  const isWalkingRouteLoading = Boolean(routeCacheKey && routeLoading[routeCacheKey] && !routeCache[routeCacheKey]);
  const displayArea = (area) => {
    const key = area?.latitude != null && area?.longitude != null
      ? `${transportMode}:${Number(area.latitude).toFixed(5)},${Number(area.longitude).toFixed(5)}`
      : null;
    const route = key ? routeCache[key] : null;
    if (!route?.duration_min) return area;
    const modeLabel = route.mode === "walk" ? "도보" : route.mode === "car" ? "자동차" : "대중교통";
    return { ...area, fromStartMinutes: route.duration_min, fromStartTransport: modeLabel, arrivalTime: null };
  };

  return { routeCache, routeErrors, routeCacheKey, selectedAreaRoute, isWalkingRouteLoading, displayArea, prepareAreaRoute };
}
