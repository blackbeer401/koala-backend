import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeRecommendation } from "../utils/normalizeRecommendation";
import { transportOptions } from "../config/recommendationDisplay";
import { readSession, writeSession } from "../utils/sessionStore";
import {
  hasOrderedActivitySequence,
  inferActivitySequence,
  orderPlacesByActivitySequence,
  resolveActivitySequence,
} from "../utils/activitySequence";
import { resolveCourseArea } from "../utils/courseArea";
import { distanceMetersBetween, normalizePlace, placeIdentity } from "../utils/recommendationPlaces";
import KakaoCourseMap from "../components/recommendation/KakaoCourseMap";
import RegionRecommendationList from "../components/recommendation/RegionRecommendationList";
import AutoCoursePicker from "../components/recommendation/AutoCoursePicker";
import TimeBudgetSummary from "../components/recommendation/TimeBudgetSummary";
import CourseGuidancePanel from "../components/recommendation/CourseGuidancePanel";
import PlaceCatalogList from "../components/recommendation/PlaceCatalogList";
import RecommendationDialogs from "../components/recommendation/RecommendationDialogs";
import RecommendationTopbar from "../components/recommendation/RecommendationTopbar";
import CalculatedCoursePanel from "../components/recommendation/CalculatedCoursePanel";
import {
  requestCourse,
} from "../api/placesApi";
import {
  getExcludedPlaces,
  getFavoritePlaces,
  awardGamificationEvent,
  recordInteraction,
  recordExploredRegions,
  saveCourse,
} from "../api/accountApi";
import { districtForPlace } from "../utils/seoulDistricts";
import { audit } from "../utils/auditTrace";
import { useCourseTimeBudget } from "../hooks/useCourseTimeBudget";
import { useAreaRoutes } from "../hooks/useAreaRoutes";
import { useCourseGuidance } from "../hooks/useCourseGuidance";
import { useAutoCourseOptions } from "../hooks/useAutoCourseOptions";
import { useRecommendationPanelInteractions } from "../hooks/useRecommendationPanelInteractions";
import { useRecommendationPlaces } from "../hooks/useRecommendationPlaces";
import { usePlaceInteractions } from "../hooks/usePlaceInteractions";
import { usePlaceSelection } from "../hooks/usePlaceSelection";
import { useCourseCalculation } from "../hooks/useCourseCalculation";
import { useCourseQuestProgress } from "../hooks/useCourseQuestProgress";
import { useCoursePlaceViewModel } from "../hooks/useCoursePlaceViewModel";
import { useAutoCourseSelection } from "../hooks/useAutoCourseSelection";
import { explicitActivityDurationMinutes } from "../utils/timeIntent";
import { useGamificationRewards } from "../hooks/useGamificationRewards";

function RecommendationPage({ response, onBack, account, onOpenAccount, onAccountChange }) {
  const result = useMemo(() => normalizeRecommendation(response), [response]);
  const userMessage = response?._client_user_message ?? "";
  const requestedActivitySequence = useMemo(
    () =>
      resolveActivitySequence(
        userMessage,
        result.recommendationContext?.activity_sequence,
      ),
    [userMessage, result.recommendationContext?.activity_sequence],
  );
  const mentionedActivities = useMemo(
    () => inferActivitySequence(userMessage),
    [userMessage],
  );
  const restoredSavedCourse = response?._client_saved_course ?? null;
  const restoredCourse = restoredSavedCourse?.course_data ?? null;
  const rankingAreas = useMemo(
    () => [
      ...(result.targetArea ? [result.targetArea] : []),
      ...result.otherAreas,
      ...result.extendedAreas,
    ],
    [result],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pinnedCourseArea, setPinnedCourseArea] = useState(null);
  const [placeMode, setPlaceMode] = useState(
    response?._client_mode === "auto-course" || Boolean(restoredCourse),
  );
  const [autoCourseMode, setAutoCourseMode] = useState(
    response?._client_mode === "auto-course",
  );
  const [selectedAutoCourseId, setSelectedAutoCourseId] = useState(null);
  const [hoveredCoursePlaces, setHoveredCoursePlaces] = useState([]);
  const [selectedPlaces, setSelectedPlaces] = useState(
    () => restoredCourse?.selected_places ?? [],
  );
  const [calculated, setCalculated] = useState(Boolean(restoredCourse?.course));
  const [excludedPlaceKeys, setExcludedPlaceKeys] = useState(() => new Set());
  const [favoritePlaceKeys, setFavoritePlaceKeys] = useState(() => new Set());
  const [photoPreview, setPhotoPreview] = useState(null);
  const [adventureExperience, setAdventureExperience] = useState(null);
  const [mysteryRevealed, setMysteryRevealed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!account?.token) {
      setExcludedPlaceKeys(new Set());
      setFavoritePlaceKeys(new Set());
      return undefined;
    }
    Promise.all([
      getExcludedPlaces(account.token),
      getFavoritePlaces(account.token),
    ])
      .then(([excluded, favorites]) => {
        if (!cancelled) {
          setExcludedPlaceKeys(
            new Set((excluded ?? []).map((item) => item.place_key)),
          );
          setFavoritePlaceKeys(
            new Set((favorites ?? []).map((item) => item.place_key)),
          );
        }
      })
      .catch(() => {
        /* 저장 기능 장애가 핵심 추천을 막지 않게 한다. */
      });
    return () => {
      cancelled = true;
    };
  }, [account?.token]);
  const [calculationStatus, setCalculationStatus] = useState(
    restoredCourse?.course ? "ready" : "idle",
  );
  const [calculationError, setCalculationError] = useState("");
  const [courseResult, setCourseResult] = useState(() =>
    restoredCourse?.course
      ? { validation: null, course: restoredCourse.course }
      : null,
  );
  const [courseConfirmed, setCourseConfirmed] = useState(
    Boolean(restoredCourse?.course),
  );
  const [proactivePromptMode, setProactivePromptMode] = useState(null);
  const [proactiveDismissed, setProactiveDismissed] = useState(false);
  const [liveProactiveShown, setLiveProactiveShown] = useState(false);
  const [replacementPreviewOpen, setReplacementPreviewOpen] = useState(false);
  const [guidanceStarted, setGuidanceStarted] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [transportMode, setTransportMode] = useState(() => {
    const initialMode =
      restoredCourse?.transport_mode ??
      result.recommendationContext?.transport_mode ??
      account?.preferences?.transport_mode;
    return ["public_transit", "car", "walk"].includes(initialMode)
      ? initialMode
      : "public_transit";
  });
  const [transportMenuOpen, setTransportMenuOpen] = useState(false);
  const mapTopbarRef = useRef(null);
  const [preferredPlaceId, setPreferredPlaceId] = useState(null);
  const [serverSaveStatus, setServerSaveStatus] = useState("idle");
  const historyKey = `koala-history-${JSON.stringify(response.map_context)}`;
  const [courseHistory, setCourseHistory] = useState(() =>
    readSession(historyKey, []),
  );
  useEffect(() => {
    writeSession(historyKey, courseHistory);
  }, [historyKey, courseHistory]);
  const [focusedStopIndex, setFocusedStopIndex] = useState(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // 모바일 지역 목록은 기본 높이 아래로도 내려 지도를 더 넓게 볼 수 있다.
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const {
    sidebarWidth,
    didDrag,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handleSheetPointerDown,
    handleSheetPointerMove,
    handleSheetPointerUp,
    handleSheetPointerCancel,
  } = useRecommendationPanelInteractions({
    sheetExpanded,
    sheetMinimized,
    placeMode,
    setSheetExpanded,
    setSheetMinimized,
  });
  const calculationRequest = useRef(0);
  useEffect(
    () => () => {
      calculationRequest.current += 1;
    },
    [],
  );

  const useAdventurePlaces = async (adventurePlaces, options = {}) => {
    setPinnedCourseArea(null);
    const normalized = adventurePlaces.map((place, index) =>
      normalizePlace(place, `adventure-${index}`),
    );
    setPlaces((current) => [
      ...normalized,
      ...current.filter(
        (place) => !normalized.some((item) => item.id === place.id),
      ),
    ]);
    setSelectedPlaces(
      normalized.map((place, index) => ({
        ...place,
        preferredFirst: index === 0,
      })),
    );
    setPreferredPlaceId(normalized[0]?.id ?? null);
    setAutoCourseMode(false);
    setPlaceMode(true);
    setCalculated(false);
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setMysteryRevealed(false);
    setAdventureExperience({
      mode: options.mode ?? null,
      quest: options.quest ?? null,
    });
    setSheetExpanded(true);
    if (!options.autoConfirm || !normalized.length) return;
    const requestId = ++calculationRequest.current;
    setCalculationStatus("loading");
    setCalculationError("");
    try {
      const course = await requestCourse({
        startLocation,
        selectedPlaces: normalized,
        availableTimeMinutes,
        departureDatetime: result.recommendationContext?.departure_datetime,
        endLocation:
          result.mapContext?.end ?? result.recommendationContext?.end_location,
        transportMode,
        optimizeOrder: false,
        fresh: true,
      });
      if (requestId !== calculationRequest.current) return;
      if (course.status !== "FEASIBLE") {
        setCalculationStatus("warning");
        setCalculationError("실제 이동시간을 포함하면 시간이 부족해요. 자동으로 다른 코스를 찾는 중이에요.");
        setPlaceMode(false);
        return;
      }
      setCourseResult({ validation: null, course });
      setCourseHistory((current) => [
        {
          id: `${Date.now()}-${options.mode ?? "adventure"}`,
          areaName: selectedArea?.name,
          selectedPlaces: [...normalized],
          validation: null,
          course,
        },
        ...current,
      ].slice(0, 3));
      setCalculated(true);
      setCourseConfirmed(true);
      setGuidanceStarted(Boolean(options.startGuidance));
      setSheetExpanded(Boolean(options.startGuidance));
      setCalculationStatus("ready");
    } catch (error) {
      if (requestId !== calculationRequest.current) return;
      setCalculationStatus("error");
      setCalculationError(error.message ?? "코스를 완성하지 못했어요.");
      setPlaceMode(false);
    }
  };
  const useAdventureArea = (adventureArea) => {
    setPinnedCourseArea(null);
    const index = rankingAreas.findIndex(
      (area) => area.name === adventureArea?.AREA_NM,
    );
    if (index >= 0) setSelectedIndex(index);
    setSelectedPlaces([]);
    setPreferredPlaceId(null);
    setAutoCourseMode(false);
    setPlaceMode(true);
    setCalculated(false);
    setCourseResult(null);
    setSheetExpanded(true);
  };
  useEffect(() => {
    if (!transportMenuOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!mapTopbarRef.current?.contains(event.target))
        setTransportMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setTransportMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [transportMenuOpen]);
  // 사용자가 문장에 활동 지역을 명시했다면 그 지역을 코스 중심으로 쓴다.
  // 명시 지역이 없을 때만 현재 위치 주변 자동 코스를 만든다.
  const selectedArea = resolveCourseArea({
    pinnedArea: pinnedCourseArea,
    autoCourseMode,
    targetArea: result.targetArea,
    currentArea: result.currentArea,
    rankingAreas,
    selectedIndex,
  });
  const {
    places,
    setPlaces,
    placeSourceFilter,
    setPlaceSourceFilter,
    hasMorePlaces,
    placeStatus,
    placeError,
    moreLoadError,
    setPlaceError,
    placeScrollRef,
    handleLoadMore,
  } = useRecommendationPlaces({
    placeMode,
    autoCourseMode,
    selectedArea,
    recommendationContext: result.recommendationContext,
    excludedPlaceKeys,
  });
  const {
    placeFeedback,
    handleExcludePlace,
    toggleFavoritePlace,
    sendPlaceFeedback,
  } = usePlaceInteractions({
    account,
    areaName: selectedArea?.name,
    favoritePlaceKeys,
    setFavoritePlaceKeys,
    setExcludedPlaceKeys,
    setPlaces,
    setSelectedPlaces,
    setCalculated,
    setCourseResult,
    setPlaceError,
    onOpenAccount,
    onAccountChange,
  });
  const selectedTransport =
    transportOptions.find((option) => option.id === transportMode) ??
    transportOptions[0];
  const startLocation = useMemo(
    () =>
      result.mapContext?.start ?? {
        latitude: null,
        longitude: null,
      },
    [result.mapContext?.start],
  );
  const {
    timeBudgetPromptOpen,
    setTimeBudgetPromptOpen,
    timeBudgetDraft,
    setTimeBudgetPart,
    applyManualTimeBudget,
    travelEstimate,
    availableTimeMinutes,
    displayedTravel,
    displayedStay,
    displayedTotal,
    hasActualTime,
    calculationIsEstimated,
    timeGaugeOver,
    timeCalculationLabel,
  } = useCourseTimeBudget({
    selectedPlaces,
    startLocation,
    endLocation: result.mapContext?.end,
    transportMode,
    mapAvailableTime: result.mapContext?.available_time_minutes,
    contextAvailableTime: result.recommendationContext?.available_time_minutes,
    autoCourseDuration: response?._client_mode === "auto-course"
      ? response._client_selected_duration_minutes
      : explicitActivityDurationMinutes(userMessage),
    selectedArea,
    courseResult,
    setSelectedPlaces,
    setPreferredPlaceId,
    setCalculated,
    setCourseResult,
    setCalculationError,
    setPlaceMode,
    setSheetExpanded,
  });
  const {
    routeErrors,
    routeCacheKey,
    selectedAreaRoute,
    isWalkingRouteLoading,
    displayArea,
    prepareAreaRoute,
  } = useAreaRoutes({ selectedArea, rankingAreas, startLocation, transportMode });
  const savedCoursesForArea = courseHistory.filter(
    (item) => item.areaName === selectedArea?.name,
  );
  useEffect(() => {
    if (placeMode) {
      setSheetMinimized(false);
      setSheetExpanded(true);
    }
  }, [placeMode]);
  useEffect(() => {
    // 1순위는 서버가 미리 준비해 준 Tmap 보행 경로를 즉시 사용한다.
    // 다른 지역은 기존 지도 경로를 먼저 그리고, 보행 보강본만 뒤에서 받아 캐시한다.
    if (!routeCacheKey) return;
    prepareAreaRoute(selectedArea);
  }, [routeCacheKey, selectedArea, prepareAreaRoute]);

  useEffect(() => {
    // 세 후보 모두 이동수단 표시를 완성한다. 이전 서버 응답과의 호환을 위해
    // 상세 이동수단이 없는 후보만 짧은 간격으로 미리 계산한다.
    const pendingAreas = rankingAreas.filter(
      (area) => !area.hasPreparedMapRoute,
    );
    const timers = pendingAreas.map((area, index) =>
      window.setTimeout(() => prepareAreaRoute(area), 250 + index * 180),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [rankingAreas, prepareAreaRoute]);

  const { togglePlace, promotePlace } = usePlaceSelection({
    account,
    selectedArea,
    selectedPlaces,
    preferredPlaceId,
    setSelectedPlaces,
    setPreferredPlaceId,
    setFocusedStopIndex,
    setCalculated,
    setCalculationError,
    setCalculationStatus,
    setCourseResult,
    setCourseConfirmed,
    setGuidanceStarted,
    setGuideStep,
    setProactiveDismissed,
    setLiveProactiveShown,
    calculationRequest,
  });
  useEffect(() => {
    audit("frontend_display", {
      frontend_display: {
        start: startLocation,
        end: result.mapContext?.end,
        transport_mode: transportMode,
        available_time_minutes: availableTimeMinutes,
        total_required_minutes: displayedTotal,
        total_travel_time_minutes: displayedTravel,
        total_stay_time_minutes: displayedStay,
        actual: hasActualTime,
        selected_place_ids: selectedPlaces.map((place) => place.id),
      },
    });
  }, [
    startLocation,
    result.mapContext?.end,
    transportMode,
    availableTimeMinutes,
    displayedTotal,
    displayedTravel,
    displayedStay,
    hasActualTime,
    selectedPlaces,
  ]);

  const { handleCalculate, finishCalculatedCourse } = useCourseCalculation({
    selectedPlaces,
    transportMode,
    availableTimeMinutes,
    startLocation,
    recommendationContext: result.recommendationContext,
    mapContext: result.mapContext,
    requestedActivitySequence,
    selectedArea,
    calculationRequest,
    setCalculationStatus,
    setCalculationError,
    setCourseResult,
    setCourseHistory,
    setCalculated,
    setCourseConfirmed,
    setGuidanceStarted,
    setGuideStep,
    setFocusedStopIndex,
    setSheetExpanded,
    setPinnedCourseArea,
    setSelectedPlaces,
    setAutoCourseMode,
  });

  const {
    visiblePlaces,
    replacementTarget,
    replacementPlace,
    filteredPlaces,
    hasEventPlaces,
  } = useCoursePlaceViewModel({
    courseResult,
    selectedPlaces,
    calculated,
    focusedStopIndex,
    places,
    placeSourceFilter,
  });
  const {
    questProgress,
    questPlans,
    updateQuestProgress,
    mysteryMode,
    mysteryName,
    mapVisiblePlaces,
  } = useCourseQuestProgress({
    visiblePlaces,
    adventureExperience,
    courseConfirmed,
    mysteryRevealed,
    guideStep,
    userKey: account?.user?.id ?? "guest",
  });
  const proactiveOffer = useMemo(() => {
    if (result.proactiveSuggestion?.place) {
      return {
        place: normalizePlace(result.proactiveSuggestion.place, "proactive"),
        reason: result.proactiveSuggestion.reason,
        message: result.proactiveSuggestion.message,
        travelMinutes: Number(
          result.proactiveSuggestion.travel?.duration_min ?? 0,
        ),
        visitableMinutes: Number(
          result.proactiveSuggestion.visitable_minutes ?? 0,
        ),
      };
    }
    // 확정·안내 중 개입은 백엔드가 영업시간과 다음 일정까지 검증한 제안만 쓴다.
    return null;
  }, [result.proactiveSuggestion]);
  const proactiveExtraMinutes = proactiveOffer?.place
    ? Math.max(
        20,
        Math.min(
          proactiveOffer.visitableMinutes ||
            proactiveOffer.place.stayMinutes ||
            30,
          45,
        ),
      ) + Math.max(0, proactiveOffer.travelMinutes || 0)
    : Infinity;
  const proactiveFitsCourse = Boolean(
    proactiveOffer?.place &&
    !selectedPlaces.some(
      (place) => placeIdentity(place) === placeIdentity(proactiveOffer.place),
    ) &&
    Number(courseResult?.course?.remaining_time_minutes ?? 0) >=
      proactiveExtraMinutes,
  );
  const {
    autoCourseCalculating,
    setAutoCourseCalculating,
    autoCourseNotice,
    setAutoCourseNotice,
    verifiedAutoCourses,
    setVerifiedAutoCourses,
  } = useAutoCourseOptions({
    autoCourseMode,
    placeStatus,
    places,
    recommendationContext: result.recommendationContext,
    mapContext: result.mapContext,
    account,
    requestedActivitySequence,
    startLocation,
    availableTimeMinutes,
    transportMode,
  });
  const { chooseAutoCourse } = useAutoCourseSelection({
    autoCourseCalculating,
    availableTimeMinutes,
    calculationRequest,
    requestedActivitySequence,
    startLocation,
    recommendationContext: result.recommendationContext,
    mapContext: result.mapContext,
    transportMode,
    setSelectedPlaces,
    setPreferredPlaceId,
    setSelectedAutoCourseId,
    setAutoCourseNotice,
    setAutoCourseCalculating,
    setCalculationError,
    finishCalculatedCourse,
  });
  const acceptProactiveSuggestion = () => {
    if (!proactiveOffer?.place) return;
    const proactivePlace = { ...proactiveOffer.place, preferredFirst: false };
    const nextPlaces = [
      ...selectedPlaces.filter(
        (place) => placeIdentity(place) !== placeIdentity(proactivePlace),
      ),
      proactivePlace,
    ];
    setPlaces((current) => [
      proactivePlace,
      ...current.filter(
        (place) => placeIdentity(place) !== placeIdentity(proactivePlace),
      ),
    ]);
    setSelectedPlaces(nextPlaces);
    setProactivePromptMode(null);
    setProactiveDismissed(true);
    setAutoCourseMode(false);
    setCalculated(false);
    setCourseResult(null);
    setSheetExpanded(true);
    void handleCalculate(nextPlaces);
  };
  const returnToAutoCourses = () => {
    calculationRequest.current += 1;
    // 자동 코스 카드 화면에는 직전에 선택한 코스의 마커를 남기지 않는다.
    setSelectedPlaces([]);
    setPreferredPlaceId(null);
    setFocusedStopIndex(null);
    setGuideStep(0);
    setCalculated(false);
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setCalculationStatus("idle");
    setCalculationError("");
    setAutoCourseCalculating(false);
    setVerifiedAutoCourses([]);
    setSelectedAutoCourseId(null);
    setPinnedCourseArea(null);
    setAutoCourseMode(true);
    setReplacementPreviewOpen(false);
    setSheetExpanded(true);
  };
  const canReturnToAutoCourses =
    response?._client_mode === "auto-course" &&
    (calculated || Boolean(selectedAutoCourseId));
  const handleResultsBack = () => {
    if (!placeMode) {
      onBack();
      return;
    }
    if (canReturnToAutoCourses) {
      returnToAutoCourses();
      return;
    }
    returnToRegions();
  };
  const handleTransportChange = (option) => {
    setTransportMenuOpen(false);
    if (transportMode === option.id) return;
    setTransportMode(option.id);
    setCalculated(false);
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setCalculationStatus("idle");
    setCalculationError("");
    if (selectedPlaces.length && availableTimeMinutes) {
      void handleCalculate(selectedPlaces, option.id);
    }
  };
  const confirmReplacement = () => {
    if (!replacementTarget || !replacementPlace) return;
    const nextPlaces = selectedPlaces.map((place) =>
      place.id === replacementTarget.id
        ? { ...replacementPlace, preferredFirst: place.preferredFirst }
        : place,
    );
    setReplacementPreviewOpen(false);
    setSelectedPlaces(nextPlaces);
    setPreferredPlaceId(
      nextPlaces.find((place) => place.preferredFirst)?.id ??
        nextPlaces[0]?.id ??
        null,
    );
    void handleCalculate(nextPlaces);
  };
  const {
    guideStopCount,
    guideIsComplete,
    guidePlace,
    guidePreviousPlace,
    guideTravel,
    guideBoarding,
    guideInstruction,
    guideOriginLabel,
    mapFocusIndex,
    liveLocation,
    liveLocationStatus,
    deviceHeading,
    guideRoute,
    guideRouteStatus,
    arrivalSeconds,
    arrivalDwellSeconds,
    guideOrigin,
  } = useCourseGuidance({
    visiblePlaces,
    endLocation: result.mapContext?.end,
    startLocation,
    courseResult,
    transportMode,
    courseConfirmed,
    guidanceStarted,
    guideStep,
    focusedStopIndex,
    setGuideStep,
  });
  const arrivalQuest = guidePreviousPlace
    ? questPlans.find((quest) => quest.placeIndex === guideStep - 1) ?? null
    : null;
  const {
    courseId: gamificationCourseId,
    setCourseId: setGamificationCourseId,
    courseReady: gamificationCourseReady,
    setCourseReady: setGamificationCourseReady,
    notice: gamificationNotice,
    setNotice: setGamificationNotice,
    questResults: questRewardResults,
    showNotice: showGamificationNotice,
    showRewardNotice,
  } = useGamificationRewards({
    initialCourseId: restoredCourse?.gamification_course_id,
    account,
    onAccountChange,
    guideIsComplete,
    courseConfirmed,
    questPlans,
    questProgress,
  });

  const handleQuestProgressChange = (questId, nextStatus) => {
    updateQuestProgress(questId, nextStatus);
  };
  const returnToRegions = () => {
    calculationRequest.current += 1;
    setPlaceMode(false);
    setCalculated(false);
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setFocusedStopIndex(null);
    setCalculationStatus("idle");
    setCalculationError("");
    setPinnedCourseArea(null);
  };
  const resetCourseSelection = () => {
    calculationRequest.current += 1;
    setCalculated(false);
    setCourseResult(null);
    setCourseConfirmed(false);
    setGuidanceStarted(false);
    setGuideStep(0);
    setFocusedStopIndex(null);
    setCalculationStatus("idle");
    setCalculationError("");
    setProactivePromptMode(null);
    setProactiveDismissed(false);
    setLiveProactiveShown(false);
  };
  const confirmCourse = async (options = {}) => {
    if (calculationStatus === "loading") return;
    if (
      options?.skipProactive !== true &&
      proactiveFitsCourse &&
      !proactiveDismissed
    ) {
      setProactivePromptMode("confirm");
      return;
    }
    if (!availableTimeMinutes) {
      setCalculationStatus("error");
      setCalculationError(
        "사용 가능한 시간이 없어요. 이전 화면에서 종료 시각이나 여유 시간을 다시 입력해 주세요.",
      );
      return;
    }
    setCalculationStatus("loading");
    setCalculationError("");
    try {
      const activitySequence = requestedActivitySequence;
      const preserveActivityOrder = hasOrderedActivitySequence(activitySequence);
      const orderedPlacesToConfirm = preserveActivityOrder
        ? orderPlacesByActivitySequence(selectedPlaces, activitySequence)
        : [...selectedPlaces];
      // 확정 지도는 이전 화면의 캐시가 아니라 최신 혼합 이동 정책으로 다시
      // 계산한 코스를 사용한다. 백엔드의 구간 캐시는 재사용돼 응답은 빠르다.
      const course = await requestCourse({
        startLocation,
        selectedPlaces: orderedPlacesToConfirm,
        availableTimeMinutes,
        departureDatetime: result.recommendationContext?.departure_datetime,
        endLocation:
          result.mapContext?.end ?? result.recommendationContext?.end_location,
        transportMode,
        optimizeOrder: !preserveActivityOrder,
        fresh: true,
      });
      if (course.status !== "FEASIBLE") {
        setCourseResult((current) => ({ ...current, course }));
        setCalculationStatus("warning");
        setCalculationError(
          "최신 경로로 다시 계산하니 예정 시간보다 여유가 부족해요.",
        );
        return;
      }
      const courseId = globalThis.crypto?.randomUUID?.() ?? `course-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setGamificationCourseId(courseId);
      setGamificationCourseReady(false);
      setGamificationNotice("");
      setCourseResult((current) => ({ ...current, course }));
      setSelectedPlaces(orderedPlacesToConfirm);
      setFocusedStopIndex(null);
      setCourseConfirmed(true);
      setGuidanceStarted(false);
      setGuideStep(0);
      setSheetExpanded(false);
      setCalculationStatus("ready");
      if (account?.token) {
        // 실제 서울 코스에 포함된 구만 탐험 기록에 누적한다.
        const districts = new Map();
        for (const place of orderedPlacesToConfirm) {
          const district = districtForPlace(place);
          if (!district) continue;
          const entry = districts.get(district.code) ?? { district_code: district.code, place_names: [] };
          if (place.name && !entry.place_names.includes(place.name)) entry.place_names.push(place.name);
          districts.set(district.code, entry);
        }
        void awardGamificationEvent(account.token, {
          event_type: "course_confirm",
          course_id: courseId,
          districts: [...districts.values()],
        }).then((reward) => {
          setGamificationCourseReady(true);
          if (reward?.profile) onAccountChange?.({ ...account, gamification: reward.profile });
          showRewardNotice(reward, "코스를 확정했어요");
        }).catch(() => {
          // 경험치 API가 잠시 실패해도 기존 서울 지역 기록은 남긴다.
          if (districts.size) void recordExploredRegions(account.token, { course_id: courseId, districts: [...districts.values()] }).catch(() => {});
          showGamificationNotice("코스는 확정됐어요. 여행 경험치 동기화는 잠시 뒤 다시 확인해 주세요.");
        });
        // 확정은 개인화에서 가장 신뢰할 수 있는 행동이므로 코스의 각 활동을 기록한다.
        orderedPlacesToConfirm.forEach((place) => {
          void recordInteraction(account.token, {
            event_type: "course_confirm",
            place_key: placeIdentity(place),
            place_name: place.name,
            category: place.category,
            context_data: {
              area_name: selectedArea?.name ?? null,
              transport_mode: transportMode,
            },
          }).catch(() => {});
        });
        setServerSaveStatus("saving");
        try {
          await saveCourse(account.token, {
            title: `${selectedArea?.name ?? "추천 지역"} 코스`,
            area_name: selectedArea?.name ?? null,
            course_data: {
              selected_places: orderedPlacesToConfirm,
              course,
              transport_mode: transportMode,
              recommendation_response: response,
              gamification_course_id: courseId,
            },
          });
          setServerSaveStatus("saved");
        } catch {
          setServerSaveStatus("error");
        }
      }
    } catch (error) {
      setCalculationStatus("error");
      setCalculationError(
        error.message ?? "확정 경로를 다시 계산하지 못했어요.",
      );
    }
  };
  const dismissProactivePrompt = () => {
    const wasConfirmation = proactivePromptMode === "confirm";
    setProactivePromptMode(null);
    setProactiveDismissed(true);
    if (wasConfirmation) void confirmCourse({ skipProactive: true });
  };
  useEffect(() => {
    if (
      !guidanceStarted ||
      !liveLocation ||
      !proactiveOffer?.place ||
      proactiveDismissed ||
      liveProactiveShown
    )
      return;
    const distance = distanceMetersBetween(liveLocation, proactiveOffer.place);
    const hasTime =
      Number(courseResult?.course?.remaining_time_minutes ?? 0) >=
      proactiveExtraMinutes;
    if (distance <= 500 && hasTime) {
      setLiveProactiveShown(true);
      setProactivePromptMode("live");
    }
  }, [
    guidanceStarted,
    liveLocation,
    proactiveOffer,
    proactiveDismissed,
    liveProactiveShown,
    courseResult?.course?.remaining_time_minutes,
    proactiveExtraMinutes,
  ]);
  const startGuidance = async () => {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch {
        /* 방향 권한 없이도 위치 안내는 계속한다. */
      }
    }
    setGuideStep(0);
    setGuidanceStarted(true);
  };

  return (
    <main
      className="results-page"
      style={{ "--results-sidebar-width": `${sidebarWidth}px` }}
    >
      <KakaoCourseMap
        mapContext={result.mapContext}
        startLocationLabel={result.origin?.label ?? "현재 위치"}
        selectedArea={selectedArea}
        areaRoute={selectedAreaRoute}
        walkingRouteLoading={isWalkingRouteLoading}
        selectedPlaces={mapVisiblePlaces}
        previewPlaces={hoveredCoursePlaces}
        focusedStopIndex={mapFocusIndex}
        course={calculated ? courseResult?.course : null}
        courseConfirmed={courseConfirmed}
        liveLocation={liveLocation}
        guideRoute={guideRoute}
        guidanceActive={guidanceStarted}
        guidanceStartLocation={guideOrigin}
        guidanceStartLabel={guideOriginLabel}
        deviceHeading={deviceHeading}
        sheetExpanded={sheetExpanded}
      />
      <button
        className="results-divider"
        type="button"
        aria-label="추천 목록과 지도 너비 조절"
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
      >
        <i />
      </button>
      <aside className={`results-sidebar${placeMode ? " is-place-mode" : ""}`}>
        {gamificationNotice && !guideIsComplete && (
          <div className="gamification-toast" role="status" aria-live="polite">
            <span aria-hidden="true">✦</span><b>{gamificationNotice}</b>
            <button type="button" aria-label="보상 알림 닫기" onClick={() => setGamificationNotice("")}>×</button>
          </div>
        )}
        {routeCacheKey && routeErrors[routeCacheKey] && (
          <p className="place-status is-error">
            상세 경로를 확인하지 못해 예상 이동시간을 표시하고 있어요. 잠시 후
            다시 시도해 주세요.
          </p>
        )}
        <RecommendationTopbar
          account={account}
          placeMode={placeMode}
          selectedArea={selectedArea}
          canReturnToAutoCourses={canReturnToAutoCourses}
          onResultsBack={handleResultsBack}
          onHome={onBack}
          onOpenAccount={onOpenAccount}
          guidanceStarted={guidanceStarted}
          selectedTransport={selectedTransport}
          transportOptions={transportOptions}
          transportMode={transportMode}
          transportMenuOpen={transportMenuOpen}
          onToggleTransportMenu={() => setTransportMenuOpen((open) => !open)}
          onSelectTransport={handleTransportChange}
          topbarRef={mapTopbarRef}
        />        {rankingAreas.length > 0 && (
          <section
            className={`map-ranking-sheet${placeMode ? " is-place-mode" : " is-region-mode"}${sheetExpanded ? " is-expanded" : ""}${sheetMinimized && !placeMode ? " is-minimized" : ""}${calculated && !sheetExpanded ? " is-course-collapsed" : ""}${guideIsComplete ? " is-guide-complete" : ""}`}
          >
            <button
              className="sheet-handle"
              type="button"
              aria-label={
                sheetMinimized
                  ? "추천 지역 목록 기본 크기로 올리기"
                  : sheetExpanded
                    ? "추천 지역 목록 내리기"
                    : "추천 지역 목록 펼치기"
              }
              aria-expanded={sheetExpanded}
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              onPointerCancel={handleSheetPointerCancel}
              onClick={() => {
                if (didDrag.current) {
                  didDrag.current = false;
                  return;
                }
                if (sheetMinimized) {
                  setSheetMinimized(false);
                  return;
                }
                setSheetExpanded(!sheetExpanded);
              }}
            >
              <i />
            </button>
            {placeMode ? (
              <>
                <div className="place-picker-head">
                  <div>
                    <h2>
                      {guideIsComplete
                        ? "코스 안내가 끝났어요"
                        : guidanceStarted
                          ? "코스 안내 중이에요"
                          : courseConfirmed
                            ? adventureExperience?.mode === "course"
                              ? "랜덤 코스를 완성했어요"
                              : mysteryMode
                                ? "미스터리 안내를 시작해요"
                                : "코스가 확정됐어요"
                            : calculated
                              ? "코스가 완성됐어요"
                              : autoCourseCalculating
                                ? "가능한 코스를 확인하고 있어요"
                                : autoCourseMode
                                  ? "코알라가 코스를 준비했어요"
                                  : `${selectedArea?.name ?? "추천 지역"}에서 어디를 가볼까요?`}
                    </h2>
                    <p>
                      {guideIsComplete
                        ? "코스 안내를 마쳤어요"
                          : guidanceStarted
                            ? mysteryMode
                              ? "다음 행동만 따라가면 목적지에서 장소가 공개돼요"
                              : "도착하면 다음 장소를 안내해 드려요"
                          : courseConfirmed
                            ? "전체 동선을 마지막으로 확인해 보세요"
                            : calculated
                              ? "지도에서 전체 동선을 확인해 보세요"
                              : autoCourseCalculating
                                ? "보여드리기 전에 실제 이동시간까지 계산해요"
                                : autoCourseMode
                                  ? "화면에 보이는 장소 그대로 코스가 확정돼요"
                                  : ""}
                    </p>
                  </div>
                  <span>
                    {guidanceStarted
                      ? `${Math.min(guideStep + 1, guideStopCount)}/${guideStopCount}`
                      : autoCourseCalculating
                        ? "검증 중"
                        : autoCourseMode
                          ? `${verifiedAutoCourses.length}코스`
                          : `${selectedPlaces.length}곳`}
                  </span>
                </div>
                {calculated && courseConfirmed && guidanceStarted ? (
                  <CourseGuidancePanel
                    guideIsComplete={guideIsComplete}
                    visiblePlaces={visiblePlaces}
                    courseResult={courseResult}
                    account={account}
                    serverSaveStatus={serverSaveStatus}
                    gamificationNotice={gamificationNotice}
                    onBack={onBack}
                    setGuidanceStarted={setGuidanceStarted}
                    setGuideStep={setGuideStep}
                    setSheetExpanded={setSheetExpanded}
                    guideRouteStatus={guideRouteStatus}
                    arrivalSeconds={arrivalSeconds}
                    arrivalDwellSeconds={arrivalDwellSeconds}
                    liveLocationStatus={liveLocationStatus}
                    guideStep={guideStep}
                    guideStopCount={guideStopCount}
                    guidePlace={guidePlace}
                    mysteryMode={mysteryMode}
                    mysteryRevealed={mysteryRevealed}
                    mysteryName={mysteryName}
                    guideTravel={guideTravel}
                    sheetExpanded={sheetExpanded}
                    guideInstruction={guideInstruction}
                    guideBoarding={guideBoarding}
                    guidePreviousPlace={guidePreviousPlace}
                    arrivalQuest={arrivalQuest}
                    arrivalQuestStatus={arrivalQuest ? questProgress[arrivalQuest.id] : null}
                    arrivalQuestReward={arrivalQuest ? questRewardResults[arrivalQuest.id] : null}
                    onQuestProgressChange={handleQuestProgressChange}
                    hasEndDestination={Boolean(result.mapContext?.end)}
                    setMysteryRevealed={setMysteryRevealed}
                    resetCourseSelection={resetCourseSelection}
                    placeFeedback={placeFeedback}
                    onFeedback={sendPlaceFeedback}
                    onExclude={handleExcludePlace}
                  />
                ) : calculated ? (
                  <CalculatedCoursePanel
                    courseResult={courseResult}
                    courseConfirmed={courseConfirmed}
                    places={visiblePlaces}
                    mysteryName={mysteryName}
                    sheetExpanded={sheetExpanded}
                    onToggleRoute={(event) => {
                      event.stopPropagation();
                      setFocusedStopIndex(null);
                      setSheetExpanded((expanded) => !expanded);
                    }}
                    focusedStopIndex={focusedStopIndex}
                    onFocusStop={setFocusedStopIndex}
                    adventureMode={adventureExperience?.mode}
                    questPlans={questPlans}
                    onResetSelection={resetCourseSelection}
                    isAutoCourse={response?._client_mode === "auto-course"}
                    onReturnToAutoCourses={returnToAutoCourses}
                    onReturnToRegions={returnToRegions}
                    hasEndDestination={Boolean(result.mapContext?.end)}
                    calculationError={calculationError}
                    autoCourseNotice={autoCourseNotice}
                    replacementPlace={replacementPlace}
                    replacementTarget={replacementTarget}
                    replacementPreviewOpen={replacementPreviewOpen}
                    onSelectReplacementTarget={(_, index) => {
                      setFocusedStopIndex(index);
                      setReplacementPreviewOpen(false);
                    }}
                    onToggleReplacementPreview={() => setReplacementPreviewOpen((open) => !open)}
                    onConfirmReplacement={confirmReplacement}
                    calculationStatus={calculationStatus}
                    onConfirmCourse={confirmCourse}
                    onStartGuidance={startGuidance}
                    account={account}
                    serverSaveStatus={serverSaveStatus}
                  />                ) : autoCourseMode ? (
                  <AutoCoursePicker
                    placeStatus={placeStatus}
                    placeError={placeError}
                    autoCourseCalculating={autoCourseCalculating}
                    verifiedAutoCourses={verifiedAutoCourses}
                    selectedAutoCourseId={selectedAutoCourseId}
                    setHoveredCoursePlaces={setHoveredCoursePlaces}
                    chooseAutoCourse={chooseAutoCourse}
                    autoCourseNotice={autoCourseNotice}
                    calculationError={calculationError}
                    setAutoCourseMode={setAutoCourseMode}
                  />
                ) : (
                  <>
                    {placeStatus === "loading" && (
                      <p className="place-status">
                        주변 실제 장소를 찾고 있어요…
                      </p>
                    )}
                    {placeStatus === "error" && (
                      <p className="place-status is-error">
                        {placeError || "장소를 불러오지 못했어요."}
                      </p>
                    )}
                    {placeStatus === "ready" && !places.length && (
                      <p className="place-status">추천할 장소가 아직 없어요.</p>
                    )}
                    <TimeBudgetSummary
                      selectedPlaces={selectedPlaces}
                      availableTimeMinutes={availableTimeMinutes}
                      timeCalculationLabel={timeCalculationLabel}
                      timeGaugeOver={timeGaugeOver}
                      displayedTotal={displayedTotal}
                      displayedTravel={displayedTravel}
                      hasActualTime={hasActualTime}
                      travelEstimate={travelEstimate}
                    />
                    {selectedPlaces.length > 0 && (
                      <div
                        className={`place-picker-summary${calculationStatus === "warning" ? " is-warning" : ""}`}
                      >
                        <b>
                          {calculationIsEstimated
                            ? "일부 예상"
                            : hasActualTime
                              ? "실제 계산"
                              : "사전 계산"}{" "}
                          {displayedTotal == null ? "확인 중" : `${displayedTotal}분`}
                        </b>
                        <span>
                          {displayedTotal == null
                            ? travelEstimate.status === "loading"
                              ? "실제 이동 경로를 확인하고 있어요"
                              : "이동시간을 확인할 수 없어요"
                            : `이동 ${displayedTravel}분 · 체류 ${displayedStay}분${calculationIsEstimated ? " · 실패 구간은 예상시간 적용" : ""}`}
                        </span>
                      </div>
                    )}
                    {savedCoursesForArea.length > 0 && (
                      <button
                        className="saved-course-button"
                        type="button"
                        onClick={() => {
                          const saved = savedCoursesForArea[0];
                          setSelectedPlaces(saved.selectedPlaces);
                          setCourseResult({
                            validation: saved.validation,
                            course: saved.course,
                          });
                          setCalculated(true);
                          setCalculationStatus("ready");
                        }}
                      >
                        최근 계산한 코스 다시 보기
                      </button>
                    )}
                    {hasEventPlaces && (
                      <div
                        className="place-source-filters"
                        aria-label="추천 장소 종류"
                      >
                        <button
                          type="button"
                          className={
                            placeSourceFilter === "all" ? "is-active" : ""
                          }
                          onClick={() => setPlaceSourceFilter("all")}
                        >
                          전체
                        </button>
                        <button
                          type="button"
                          className={
                            placeSourceFilter === "general" ? "is-active" : ""
                          }
                          onClick={() => setPlaceSourceFilter("general")}
                        >
                          일반 장소
                        </button>
                        <button
                          type="button"
                          className={
                            placeSourceFilter === "events" ? "is-active" : ""
                          }
                          onClick={() => setPlaceSourceFilter("events")}
                        >
                          팝업·행사
                        </button>
                      </div>
                    )}
                    <PlaceCatalogList
                      places={filteredPlaces}
                      allPlaces={places}
                      selectedPlaces={selectedPlaces}
                      favoritePlaceKeys={favoritePlaceKeys}
                      account={account}
                      requestedActivitySequence={requestedActivitySequence}
                      mentionedActivities={mentionedActivities}
                      preferredPlaceId={preferredPlaceId}
                      placeStatus={placeStatus}
                      moreLoadError={moreLoadError}
                      hasMorePlaces={hasMorePlaces}
                      scrollRef={placeScrollRef}
                      onLoadMore={handleLoadMore}
                      onToggle={togglePlace}
                      onOpenPhoto={setPhotoPreview}
                      onToggleFavorite={toggleFavoritePlace}
                      onMakePreferred={promotePlace}
                    />                    {calculationStatus === "warning" && (
                      <div className="place-warning is-warning">
                        선택한 장소를 모두 방문하면 시간이 부족해요. 장소를 하나
                        이상 빼고 다시 코스를 짜주세요.
                      </div>
                    )}
                    {calculationError && (
                      <p className="place-status is-error">
                        {calculationError}
                      </p>
                    )}
                    {response?._client_mode === "auto-course" && (
                      <button
                        className="auto-course-return"
                        type="button"
                        onClick={returnToAutoCourses}
                      >
                        자동 코스 3가지 보기
                      </button>
                    )}
                    <button
                      className={`place-calc-button${selectedPlaces.length && availableTimeMinutes && calculationStatus !== "loading" ? " is-active" : ""}`}
                      type="button"
                      disabled={
                        !selectedPlaces.length ||
                        !availableTimeMinutes ||
                        calculationStatus === "loading"
                      }
                      onClick={() => handleCalculate()}
                    >
                      {calculationStatus === "loading"
                        ? "코스 계산 중…"
                        : calculationStatus === "warning"
                          ? "장소를 조정해 주세요"
                          : "선택한 장소로 코스 짜기"}{" "}
                      <span>→</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <RegionRecommendationList
                  targetArea={result.targetArea}
                  selectedArea={selectedArea}
                  areas={rankingAreas}
                  recommendationContext={result.recommendationContext}
                  origin={result.origin}
                  initialAdventureMode={["blind-course", "course"].includes(response?._client_adventure_mode) ? response._client_adventure_mode : null}
                  selectedIndex={selectedIndex}
                  displayArea={displayArea}
                  onPreviewArea={prepareAreaRoute}
                  onUseAdventurePlaces={useAdventurePlaces}
                  onUseAdventureArea={useAdventureArea}
                  onSelectArea={(area, index) => {
                    prepareAreaRoute(area);
                    setPinnedCourseArea(null);
                    setSelectedIndex(index);
                    setSelectedPlaces([]);
                    setPreferredPlaceId(null);
                    setCalculated(false);
                    setCourseResult(null);
                    if (availableTimeMinutes == null) {
                      setTimeBudgetPromptOpen(true);
                      return;
                    }
                    setPlaceMode(true);
                  }}
                />              </>
            )}
          </section>
        )}
        {guideIsComplete && !sheetExpanded && (
          <button
            className="guide-complete-floating-cta"
            type="button"
            onClick={onBack}
          >
            <span aria-hidden="true">✨</span>
            <b>새 코스 추천받기</b>
            <i aria-hidden="true">→</i>
          </button>
        )}
      </aside>
      <RecommendationDialogs
        timeBudgetOpen={timeBudgetPromptOpen}
        timeBudgetDraft={timeBudgetDraft}
        onTimeBudgetPartChange={setTimeBudgetPart}
        onApplyTimeBudget={applyManualTimeBudget}
        onCloseTimeBudget={() => setTimeBudgetPromptOpen(false)}
        proactiveMode={proactivePromptMode}
        proactiveOffer={proactiveOffer}
        proactiveExtraMinutes={proactiveExtraMinutes}
        onAcceptProactive={acceptProactiveSuggestion}
        onDismissProactive={dismissProactivePrompt}
        photoPreview={photoPreview}
        onClosePhotoPreview={() => setPhotoPreview(null)}
      />    </main>
  );
}

export default RecommendationPage;
