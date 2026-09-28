import { useMemo } from "react";
import { nextRouteInstruction, transitBoardingDetails } from "../utils/courseNavigation";
import { useCourseGuidanceTracking } from "./useCourseGuidanceTracking";

/** 현재 안내 단계의 목적지·이동 수단·경로 표시와 GPS 추적을 조합한다. */
export function useCourseGuidance({
  visiblePlaces,
  endLocation,
  startLocation,
  courseResult,
  transportMode,
  courseConfirmed,
  guidanceStarted,
  guideStep,
  focusedStopIndex,
  setGuideStep,
}) {
  const guideStopCount = visiblePlaces.length + (endLocation ? 1 : 0);
  const guideIsComplete = guidanceStarted && guideStep >= guideStopCount;
  const guidePlace = guideStep < visiblePlaces.length
    ? visiblePlaces[guideStep]
    : null;
  const guideDestination = useMemo(
    () =>
      guidePlace ??
      (guideStep === visiblePlaces.length && endLocation
        ? { id: "next-schedule", name: "다음 일정", ...endLocation }
        : null),
    [guidePlace, guideStep, visiblePlaces.length, endLocation],
  );
  const guidePreviousPlace = guideStep > 0 ? visiblePlaces[guideStep - 1] : null;
  const guideFallbackOrigin = guidePreviousPlace ?? startLocation;
  const guideTravel = courseResult?.course?.legs?.[guideStep]?.travel;
  const guideTransportMode = guideTravel?.mode === "walk"
    ? "walk"
    : guideTravel?.mode === "car"
      ? "car"
      : guideTravel?.mode === "transit"
        ? "public_transit"
        : transportMode;
  const tracking = useCourseGuidanceTracking({
    guidanceStarted,
    guideDestination,
    fallbackOrigin: guideFallbackOrigin,
    guideTransportMode,
    guideStopCount,
    setGuideStep,
  });
  const guideBoarding = transitBoardingDetails(guideTravel);
  const guideInstruction = nextRouteInstruction(
    tracking.guideRoute,
    guideTravel,
    guideBoarding,
  );
  const guideOriginLabel = guidePreviousPlace
    ? `${guideStep}번 출발`
    : "현재 위치";
  const mapFocusIndex = courseConfirmed && guidanceStarted
    ? guideStep < visiblePlaces.length ? guideStep : null
    : focusedStopIndex;

  return {
    guideStopCount,
    guideIsComplete,
    guidePlace,
    guidePreviousPlace,
    guideTravel,
    guideBoarding,
    guideInstruction,
    guideOriginLabel,
    mapFocusIndex,
    ...tracking,
  };
}
