import { useEffect, useMemo, useRef, useState } from "react";
import { requestCourse } from "../api/placesApi";
import { readSession, writeSession } from "../utils/sessionStore";
import { orderPlacesByActivitySequence } from "../utils/activitySequence";
import { buildAutoCourseCandidates, placeIdentity } from "../utils/recommendationPlaces";

/** 자동 코스 후보를 구성하고 실제 이동시간을 기준으로 사전 검증한다. */
export function useAutoCourseOptions({
  autoCourseMode,
  placeStatus,
  places,
  recommendationContext,
  mapContext,
  account,
  requestedActivitySequence,
  startLocation,
  availableTimeMinutes,
  transportMode,
}) {
  const [autoCourseCalculating, setAutoCourseCalculating] = useState(false);
  const [autoCourseNotice, setAutoCourseNotice] = useState("");
  const [verifiedAutoCourses, setVerifiedAutoCourses] = useState([]);
  const [autoCourseVariation] = useState(() => {
    if (!autoCourseMode) return 0;
    try {
      const key = "koala-auto-course-variation";
      const next = (Number(window.sessionStorage.getItem(key)) || 0) + 1;
      window.sessionStorage.setItem(key, String(next));
      return next;
    } catch {
      return Date.now() % 11;
    }
  });
  const [recentAutoPlaceIds] = useState(() => readSession("koala-auto-course-place-history", []));
  const verificationRef = useRef(0);

  const targetPlaceCount = Math.min(6, Math.max(2, Math.floor((availableTimeMinutes * 0.9) / 65)));
  const nearbyPlaces = useMemo(() => places.filter((place) =>
    !Number.isFinite(place.distanceMeters) || place.distanceMeters <= 2000,
  ), [places]);
  const candidates = useMemo(() => buildAutoCourseCandidates(
    nearbyPlaces,
    recommendationContext?.activities ?? Object.entries(account?.preferences?.activity_preferences ?? {})
      .filter(([, level]) => Number(level) >= 4)
      .map(([code]) => code),
    Boolean(account?.user && Object.values(account?.preferences?.activity_preferences ?? {})
      .some((level) => Number(level) >= 4)),
    targetPlaceCount,
    autoCourseVariation,
    recentAutoPlaceIds,
  ), [
    nearbyPlaces,
    recommendationContext?.activities,
    account?.user,
    account?.preferences?.activity_preferences,
    targetPlaceCount,
    autoCourseVariation,
    recentAutoPlaceIds,
  ]);

  useEffect(() => {
    if (!autoCourseMode || placeStatus !== "ready" || !candidates.length) return undefined;
    const verificationId = ++verificationRef.current;
    let cancelled = false;
    setAutoCourseCalculating(true);
    setVerifiedAutoCourses([]);
    setAutoCourseNotice("");

    // 후보를 보여주기 전에 각 코스의 실제 이동시간이 여유 시간에 맞는지 확인한다.
    Promise.allSettled(candidates.slice(0, 3).map(async (candidate) => {
      const orderedPlaces = orderPlacesByActivitySequence(candidate.places, requestedActivitySequence);
      const course = await requestCourse({
        startLocation,
        selectedPlaces: orderedPlaces,
        availableTimeMinutes,
        departureDatetime: recommendationContext?.departure_datetime,
        endLocation: mapContext?.end ?? recommendationContext?.end_location,
        transportMode,
        optimizeOrder: false,
      });
      if (course.status !== "FEASIBLE") return null;
      return {
        ...candidate,
        places: orderedPlaces,
        course,
        verificationStatus: "verified",
        estimatedStayMinutes: course.total_stay_time_minutes,
        estimatedTravelMinutes: course.total_travel_time_minutes,
      };
    }))
      .then((outcomes) => {
        if (cancelled || verificationId !== verificationRef.current) return;
        const verified = outcomes
          .filter((outcome) => outcome.status === "fulfilled" && outcome.value)
          .map((outcome) => outcome.value);
        if (verified.length) {
          const shownIds = verified.flatMap((candidate) => candidate.places.map(placeIdentity));
          writeSession("koala-auto-course-place-history", [...recentAutoPlaceIds, ...shownIds].slice(-30));
        }
        setVerifiedAutoCourses(verified);
        setAutoCourseNotice(verified.length
          ? verified.length < 3 ? `현재 조건에서 실제 시간 안에 맞는 코스 ${verified.length}개를 준비했어요.` : ""
          : "현재 시간과 주변 장소 조건을 모두 맞추는 코스를 찾지 못했어요. 장소를 직접 골라주세요.");
      })
      .finally(() => {
        if (!cancelled && verificationId === verificationRef.current) setAutoCourseCalculating(false);
      });
    return () => {
      cancelled = true;
      verificationRef.current += 1;
    };
  }, [
    autoCourseMode,
    placeStatus,
    candidates,
    startLocation,
    availableTimeMinutes,
    recommendationContext?.departure_datetime,
    requestedActivitySequence,
    mapContext?.end,
    recommendationContext?.end_location,
    transportMode,
    recentAutoPlaceIds,
  ]);

  return {
    autoCourseCalculating,
    setAutoCourseCalculating,
    autoCourseNotice,
    setAutoCourseNotice,
    verifiedAutoCourses,
    setVerifiedAutoCourses,
    candidates,
    autoCourseVariation,
    recentAutoPlaceIds,
  };
}
