import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { searchStartLocation } from "../api/locationApi";
import koalaPeeking from "../assets/images/koala-peeking.webp";
import TimeWheel from "../components/common/TimeWheel";
import PromptHelpDialog from "../components/home/PromptHelpDialog";
import AccountModal from "../components/home/AccountModal";
import {
  addAppointmentTime,
  needsAppointmentTimeClarification,
  suggestedAppointmentHours,
} from "../utils/timeIntent";
import {
  deleteSavedCourse,
  clearInteractionHistory,
  getExcludedPlaces,
  getExploredRegions,
  getFavoritePlaces,
  getGamificationProfile,
  getMe,
  getPersonalizationProfile,
  getPreferences,
  getSavedCourses,
  login,
  recordInteraction,
  removeFavoritePlace,
  restoreExcludedPlace,
  signup,
  updateGamificationTitle,
  updatePreferences,
} from "../api/accountApi";

const COURSE_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const COURSE_MINUTES = [0, 10, 20, 30, 40, 50];
const EMPTY_PREFERENCES = { transport_mode: null, space_preference: null, activity_preferences: {} };

function HomePage({
  isOpen,
  onRecommend,
  onOpenSavedCourse,
  error,
  account,
  onAccountChange,
  accountRequestId = 0,
  onAccountClose,
}) {
  const [message, setMessage] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState("login");
  const [accountSection, setAccountSection] = useState("taste");
  const [accountError, setAccountError] = useState("");
  const [clearingLearning, setClearingLearning] = useState(false);
  const [promptHelpOpen, setPromptHelpOpen] = useState(false);
  const [savedCourses, setSavedCourses] = useState([]);
  const [favoritePlaces, setFavoritePlaces] = useState([]);
  const [excludedPlaces, setExcludedPlaces] = useState([]);
  const [exploredRegions, setExploredRegions] = useState([]);
  const [gamificationError, setGamificationError] = useState("");
  const [savedCourseNotice, setSavedCourseNotice] = useState("");
  const [pendingQuickCourse, setPendingQuickCourse] = useState(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [courseHours, setCourseHours] = useState(3);
  const [courseMinutes, setCourseMinutes] = useState(0);
  const [quickCourseError, setQuickCourseError] = useState("");
  const [startLocationQuery, setStartLocationQuery] = useState("");
  const [manualLocation, setManualLocation] = useState(null);
  const [locationSearchError, setLocationSearchError] = useState("");
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [pendingAdventureMode, setPendingAdventureMode] = useState(null);
  const [appointmentPromptOpen, setAppointmentPromptOpen] = useState(false);
  const [pendingAppointmentMessage, setPendingAppointmentMessage] = useState("");
  const quickCourseRequestRef = useRef(false);
  const messageInputRef = useRef(null);

  // 진입 버튼의 의미와 모달 첫 화면을 일치시킨다. 이전 회원가입 상태는 재사용하지 않는다.
  const openAccount = () => {
    setAccountMode("login");
    setAccountSection("taste");
    setAccountError("");
    setAccountOpen(true);
  };
  const closeAccount = () => {
    setAccountOpen(false);
    setAccountMode("login");
    setAccountError("");
    onAccountClose?.();
  };

  const usePromptExample = (example) => {
    setMessage(example);
    setPromptHelpOpen(false);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(example.length, example.length);
    });
  };
  const {
    location,
    displayLocation,
    address,
    addressStatus,
    status,
    requestLocation,
    clearLocation,
  } = useCurrentLocation();
  const activeLocation = manualLocation ?? (location
    ? {
        ...location,
        name: address?.display_name ?? null,
        source: "gps",
      }
    : null);
  const activeLocationName = manualLocation?.name ?? "현재 위치";
  const canChooseManualStart = !manualLocation && [
    "idle",
    "denied",
    "unavailable",
    "unsupported",
    "low_accuracy",
  ].includes(status);

  const handleSearchStartLocation = async (event) => {
    event.preventDefault();
    const query = startLocationQuery.trim();
    if (query.length < 2 || searchingLocation) return;
    setSearchingLocation(true);
    setLocationSearchError("");
    try {
      const result = await searchStartLocation(query);
      // 직접 출발지를 고르면 진행 중 GPS watcher를 중단해 늦게 도착한 좌표가
      // 사용자의 선택을 덮어쓰거나 자동 추천이 두 번 실행되지 않게 한다.
      clearLocation();
      const selectedLocation = { ...result, source: "manual" };
      setManualLocation(selectedLocation);
      setStartLocationQuery(result.name);
      setLocationSearchError("");
      setQuickCourseError("");
      if (pendingQuickCourse) {
        const prompt = pendingQuickCourse.prompt.replace(/^현재 위치에서/, `${result.name}에서`);
        void submitQuickCourse({ ...pendingQuickCourse, prompt }, selectedLocation);
      }
    } catch (searchError) {
      setLocationSearchError(searchError.message);
    } finally {
      setSearchingLocation(false);
    }
  };

  const clearManualLocation = () => {
    setManualLocation(null);
    setStartLocationQuery("");
    setLocationSearchError("");
  };

  const autoCourse = useMemo(() => {
    const preferences = account?.preferences?.activity_preferences ?? {};
    const favorite = Object.entries(preferences).sort(
      ([, left], [, right]) => Number(right) - Number(left),
    )[0]?.[0];
    const favoriteLabel = {
      food: "맛집",
      cafe: "카페",
      walk: "산책",
      culture: "문화",
      entertainment: "놀거리",
      shopping: "쇼핑",
      drink: "술집",
    }[favorite];
    return {
      id: "auto",
      prompt: favoriteLabel
        ? `현재 위치에서 ${favoriteLabel} 취향도 반영하고, 지금 운영 중인 장소를 이용해 서로 다른 분위기의 3시간 코스 후보를 추천해줘.`
        : "현재 위치에서 지금 운영 중인 장소를 이용해 서로 다른 분위기의 3시간 코스 후보를 추천해줘.",
    };
  }, [account?.preferences?.activity_preferences]);

  useEffect(() => {
    if (accountRequestId > 0) openAccount();
  }, [accountRequestId]);

  useEffect(() => {
    if (!account?.token) {
      setSavedCourses([]);
      setFavoritePlaces([]);
      setExcludedPlaces([]);
      setExploredRegions([]);
      return;
    }
    Promise.allSettled([
      getSavedCourses(account.token),
      getFavoritePlaces(account.token),
      getExcludedPlaces(account.token),
      getExploredRegions(account.token),
      getGamificationProfile(account.token),
    ])
      .then(([courses, favorites, excluded, regions, gamification]) => {
        if (courses.status === "fulfilled") setSavedCourses(courses.value);
        if (favorites.status === "fulfilled") setFavoritePlaces(favorites.value);
        if (excluded.status === "fulfilled") setExcludedPlaces(excluded.value);
        if (regions.status === "fulfilled") setExploredRegions(regions.value);
        if (gamification.status === "fulfilled" && (
          account.gamification?.total_xp !== gamification.value.total_xp
          || account.gamification?.equipped_title?.id !== gamification.value.equipped_title?.id
          || JSON.stringify(account.gamification?.achievements ?? []) !== JSON.stringify(gamification.value.achievements ?? [])
        )) {
          onAccountChange({ ...account, gamification: gamification.value });
        }
        const coreFailure = [courses, favorites, excluded, regions].find((result) => result.status === "rejected");
        if (coreFailure) setAccountError(coreFailure.reason?.message ?? "계정 정보를 불러오지 못했어요.");
      })
      .catch((requestError) => setAccountError(requestError.message));
  }, [account?.token]);

  useEffect(() => {
    const refreshGamification = (event) => onAccountChange({ ...account, gamification: event.detail });
    window.addEventListener("koala-gamification-updated", refreshGamification);
    return () => window.removeEventListener("koala-gamification-updated", refreshGamification);
  }, [account, onAccountChange]);

  const equipTitle = async (titleId) => {
    setGamificationError("");
    try {
      const gamification = await updateGamificationTitle(account.token, titleId);
      onAccountChange({ ...account, gamification });
    } catch (error) {
      setGamificationError(error.message || "칭호를 바꾸지 못했어요.");
    }
  };

  useEffect(() => {
    const refreshExploredRegions = (event) => setExploredRegions(event.detail ?? []);
    window.addEventListener("koala-explored-regions-updated", refreshExploredRegions);
    return () => window.removeEventListener("koala-explored-regions-updated", refreshExploredRegions);
  }, []);

  const removeSavedCourse = async (courseId) => {
    try {
      await deleteSavedCourse(account.token, courseId);
      setSavedCourses((current) =>
        current.filter((course) => course.id !== courseId),
      );
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  };

  const openSavedCourse = (course) => {
    if (onOpenSavedCourse?.(course)) {
      void recordInteraction(account?.token, {
        event_type: "course_open",
        context_data: { area_name: course.area_name ?? null, course_id: course.id },
      }).catch(() => {});
      setAccountOpen(false);
      setSavedCourseNotice("");
      return;
    }
    setSavedCourseNotice(
      "이전 저장 형식이라 지도 복원이 어려워요. 새로 저장한 코스부터 다시 열 수 있어요.",
    );
  };

  const removeFavorite = async (placeKey) => {
    try {
      await removeFavoritePlace(account.token, placeKey);
      setFavoritePlaces((current) =>
        current.filter((place) => place.place_key !== placeKey),
      );
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  };

  const restorePlace = async (placeKey) => {
    try {
      await restoreExcludedPlace(account.token, placeKey);
      setExcludedPlaces((current) =>
        current.filter((place) => place.place_key !== placeKey),
      );
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  };

  useEffect(() => {
    if (!timePickerOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setTimePickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [timePickerOpen]);

  const submitQuickCourse = async (course, nextLocation) => {
    try {
      setQuickCourseError("");
      await onRecommend({
        message: course.prompt,
        location: nextLocation,
        preferences: account?.preferences,
        autoCourse: course.id === "auto",
        fastAutoCourse: Boolean(course.fast),
        autoCourseDurationMinutes: course.durationMinutes,
        adventureMode: course.adventureMode ?? null,
      });
    } finally {
      quickCourseRequestRef.current = false;
      setPendingQuickCourse(null);
    }
  };

  const startQuickCourse = (course) => {
    if (quickCourseRequestRef.current) return;
    setQuickCourseError("");
    quickCourseRequestRef.current = true;
    setPendingQuickCourse(course);
    if (!activeLocation) {
      requestLocation(
        (nextLocation) => {
          void submitQuickCourse(course, nextLocation);
        },
        (locationError) => {
          quickCourseRequestRef.current = false;
          setPendingQuickCourse(null);
          setQuickCourseError(
            locationError?.code === locationError?.PERMISSION_DENIED
              ? "위치 권한이 없어도 괜찮아요. 아래에서 역이나 동네를 검색해 출발지를 선택해 주세요."
              : locationError?.code === "LOW_ACCURACY"
                ? "GPS 신호가 약해 정확한 위치를 확인하지 못했어요. 실외에서 다시 시도하거나 원하는 지역을 직접 입력해 주세요."
              : "현재 위치를 확인하지 못했어요. 아래에서 역이나 동네를 검색해 출발지를 선택해 주세요.",
          );
        },
      );
      return;
    }
    const prompt = course.prompt.replace(/^현재 위치에서/, `${activeLocationName}에서`);
    void submitQuickCourse({ ...course, prompt }, activeLocation);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (quickCourseRequestRef.current) return;
    if (!message.trim()) return;
    if (needsAppointmentTimeClarification(message)) {
      setPendingAppointmentMessage(message.trim());
      setAppointmentPromptOpen(true);
      return;
    }
    onRecommend({ message, location: activeLocation, preferences: account?.preferences });
  };

  const submitAppointmentTime = (hour) => {
    const clarifiedMessage = addAppointmentTime(pendingAppointmentMessage, hour);
    setMessage(clarifiedMessage);
    setAppointmentPromptOpen(false);
    onRecommend({
      message: clarifiedMessage,
      location: activeLocation,
      preferences: account?.preferences,
    });
  };

  const confirmAutoCourseTime = () => {
    const durationMinutes = Math.max(30, courseHours * 60 + courseMinutes);
    const durationText =
      courseHours > 0
        ? `${courseHours}시간${courseMinutes ? ` ${courseMinutes}분` : ""}`
        : `${courseMinutes}분`;
    // 자동 추천은 텍스트 입력과 독립된 흐름이다. 홈의 문장을 섞지 않고
    // 시간 선택값과 계정 선호만 구조화된 조건으로 전달한다.
    const adventurePrompt = {
      "blind-course": "목적지를 미리 공개하지 않는 블라인드 코스",
      course: "뜻밖의 랜덤 코스",
    }[pendingAdventureMode];
    const prompt = adventurePrompt
      ? `${activeLocationName}에서 ${durationText} 동안 즐길 수 있는 ${adventurePrompt}를 추천해줘.`
      : `${activeLocationName}에서 지금 운영 중인 장소를 이용해 ${durationText} 동안 즐길 수 있는 서로 다른 분위기의 코스 후보를 추천해줘.`;
    setTimePickerOpen(false);
    startQuickCourse({
      ...autoCourse,
      id: pendingAdventureMode ? `adventure-${pendingAdventureMode}` : "auto",
      prompt,
      fast: true,
      durationMinutes,
      adventureMode: pendingAdventureMode,
    });
    setPendingAdventureMode(null);
  };

  const handleAccount = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAccountError("");
    try {
      const wasSignup = accountMode === "signup";
      if (wasSignup) {
        await signup({
          email: form.get("email"),
          password: form.get("password"),
          nickname: form.get("nickname"),
          email_verification_code: form.get("email_verification_code"),
        });
      }
      const session = await login({
        email: form.get("email"),
        password: form.get("password"),
      });
      localStorage.setItem("koala-token", session.access_token);
      // 사용자 인증을 먼저 확정한다. 취향·개인화 API 장애가 로그인 자체를
      // 실패로 보이게 하지 않도록 부가 데이터는 실패 시 기본값으로 둔다.
      const user = await getMe(session.access_token);
      onAccountChange({ token: session.access_token, user, preferences: EMPTY_PREFERENCES, personalization: null, gamification: null });
      const [preferencesResult, personalizationResult, gamificationResult] = await Promise.allSettled([
        getPreferences(session.access_token),
        getPersonalizationProfile(session.access_token),
        getGamificationProfile(session.access_token),
      ]);
      onAccountChange({
        token: session.access_token,
        user,
        preferences: preferencesResult.status === "fulfilled" ? preferencesResult.value : EMPTY_PREFERENCES,
        personalization: personalizationResult.status === "fulfilled" ? personalizationResult.value : null,
        gamification: gamificationResult.status === "fulfilled" ? gamificationResult.value : null,
      });
      setAccountSection("taste");
      setAccountOpen(wasSignup);
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const preferences = await updatePreferences(account.token, {
        transport_mode: form.get("transport_mode") || null,
        space_preference: form.get("space_preference") || null,
        activity_preferences: Object.fromEntries(
          ["food", "cafe", "walk", "culture", "entertainment", "shopping", "drink"]
            .map((code) => [code, Number(form.get(`activity_${code}`) || 0)])
            .filter(([, level]) => level > 0),
        ),
      });
      onAccountChange({ ...account, preferences });
      setAccountOpen(false);
    } catch (requestError) {
      setAccountError(requestError.message);
    }
  };

  const clearLearning = async () => {
    if (!account?.token || clearingLearning) return;
    setClearingLearning(true);
    setAccountError("");
    try {
      await clearInteractionHistory(account.token);
      onAccountChange({
        ...account,
        personalization: {
          activity_preferences: {},
          context_activity_preferences: {},
          interaction_count: 0,
        },
      });
    } catch (requestError) {
      setAccountError(requestError.message);
    } finally {
      setClearingLearning(false);
    }
  };

  const locationText = manualLocation
    ? "직접 선택한 출발지를 사용 중이에요"
    : status === "success" || displayLocation
      ? "현재 위치를 사용하고 있어요"
      : status === "loading"
        ? "현재 위치를 확인하는 중이에요"
        : status === "low_accuracy"
          ? "현재 위치를 확인하는 중이에요"
        : status === "denied"
          ? "지역을 입력하거나 위치 권한을 허용해 주세요"
          : status === "unavailable"
            ? "위치를 확인하지 못했어요. 다시 눌러주세요"
            : status === "unsupported"
              ? "이 기기에서는 위치를 지원하지 않아요"
              : "출발 위치를 먼저 정해 주세요";
  const selectedDurationMinutes = courseHours * 60 + courseMinutes;

  return (
    <main
      className={
        isOpen
          ? "home-page home-page--sheet is-open"
          : "home-page home-page--sheet"
      }
    >
      <img
        className="home-peeking-koala"
        src={koalaPeeking}
        alt=""
        decoding="async"
      />
      <header className="home-header">
        <p className="home-brand">코알라</p>
        <button
          className="account-button"
          type="button"
          onClick={openAccount}
          disabled={account?.restoring}
        >
          {account?.user ? <><span className="account-button-name">{account.user.nickname}</span>{account.gamification?.equipped_title?.name && <small className="account-button-title">{account.gamification.equipped_title.name}</small>}</> : account?.restoring ? "로그인 확인 중" : "로그인"}
        </button>
      </header>
      <section className="home-intro">
        <p className="home-eyebrow">오늘의 빈 시간을 채워볼까요?</p>
        <h1>
          오늘의 빈 시간을
          <br />
          채워볼까요?
        </h1>
        <p className="home-intro-copy">
          현재 위치와 남은 시간, 하고 싶은 일을 적으면 주변 지역과 실제 이동
          경로까지 추천해드려요.
        </p>
      </section>
      <section className="start-location-panel" aria-label="출발 위치">
        <button
          className={`location-card location-card--${manualLocation ? "success" : status}`}
          type="button"
          onClick={() =>
            manualLocation
              ? clearManualLocation()
              : status === "success"
                ? clearLocation()
                : requestLocation()
          }
        >
          <span className="location-icon">⌖</span>
          <span>
            <strong>{locationText}</strong>
            <small>
              {manualLocation
                ? [manualLocation.name, manualLocation.address].filter(Boolean).join(" · ")
                  : status === "success"
                  ? address?.road_address ||
                    address?.jibun_address ||
                    address?.display_name ||
                    (addressStatus === "unavailable"
                      ? "주소를 확인하지 못했어요 · 좌표는 적용됐어요"
                      : "도로명 주소를 확인하고 있어요")
                  : status === "denied" || status === "unavailable" || status === "unsupported"
                    ? "아래에서 역이나 동네를 검색해 출발지를 정할 수 있어요"
                  : status === "loading" || status === "low_accuracy"
                    ? displayLocation && addressStatus === "success"
                      ? address?.road_address || address?.jibun_address || address?.display_name
                      : displayLocation
                        ? "현재 위치를 사용하고 있어요"
                        : "현재 위치를 불러오고 있어요"
                      : status === "idle"
                        ? "아래에서 출발지를 검색하거나 현재 위치를 눌러 확인하세요"
                        : "아래에서 다른 역이나 동네로 바꿀 수 있어요"}
            </small>
          </span>
          <span
            className="location-action"
            aria-label={
              manualLocation
                ? "직접 선택한 출발지 사용 해제"
                : status === "success"
                  ? "한 번 더 누르면 현재 위치 사용 해제"
                  : undefined
            }
          >
            {manualLocation
              ? "✓"
              : status === "loading" || status === "low_accuracy"
                ? "…"
                : status === "success"
                  ? "✓"
                  : "›"}
          </span>
        </button>
        {canChooseManualStart && <form className="start-location-search" onSubmit={handleSearchStartLocation}>
        <label className="sr-only" htmlFor="start-location-query">출발 지역 직접 입력</label>
        <input
          id="start-location-query"
          value={startLocationQuery}
          onChange={(event) => {
            setStartLocationQuery(event.target.value);
            if (manualLocation) setManualLocation(null);
            setLocationSearchError("");
          }}
          placeholder="출발 지역을 입력해 주세요 (예: 홍대입구역)"
          autoComplete="off"
        />
        <button type="submit" disabled={searchingLocation || startLocationQuery.trim().length < 2}>
          {searchingLocation ? "찾는 중" : "출발지 설정"}
        </button>
        {locationSearchError && <p role="alert">{locationSearchError}</p>}
        {manualLocation && (
          <button className="start-location-use-gps" type="button" onClick={() => { clearManualLocation(); requestLocation(); }}>
            현재 위치 다시 찾기
          </button>
        )}
        </form>}
      </section>
      <form className="recommendation-form" onSubmit={handleSubmit}>
        <div className="recommendation-label-row">
          <label htmlFor="recommendation-message">
            어떤 시간을 보내고 싶으세요?
          </label>
          <button
            className="prompt-help-trigger"
            type="button"
            aria-label="자연어 질문 작성 도움말 열기"
            aria-expanded={promptHelpOpen}
            onClick={() => setPromptHelpOpen(true)}
          >
            <span>입력 도움말</span>
            <b aria-hidden="true">?</b>
          </button>
        </div>
        <p className="recommendation-hint">
          현재 위치·남은 시간·하고 싶은 일을 편하게 적어주세요.
        </p>
        <div className="message-compose">
          <textarea
            ref={messageInputRef}
            id="recommendation-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            spellCheck={false}
            placeholder={"예) 지금 신림역이고 카페에서 쉬다가 산책하고 싶어."}
          />
          {(quickCourseError || error) && (
            <p className="recommendation-error" role="alert">
              {quickCourseError || error}
            </p>
          )}
          <button
            className="koala-auto-button"
            type="button"
            onClick={() => setTimePickerOpen(true)}
            disabled={pendingQuickCourse !== null}
          >
            <span className="koala-auto-icon" aria-hidden="true">✨</span>
            <span className="koala-auto-copy">
              <b>
                {pendingQuickCourse
                  ? "코알라가 코스를 찾고 있어요"
                  : "자동 코스 추천"}
              </b>
              <small>하고 싶은 일이 없어도 시간만 정하면 코알라가 짜드려요</small>
            </span>
            <em className="koala-auto-chevron" aria-hidden="true">
              {pendingQuickCourse ? "…" : "›"}
            </em>
          </button>
          <section className="home-adventure-store" aria-label="색다른 추천">
            <div className="home-adventure-head">
              <span><b>색다른 추천</b><small>미스터리 가이드와 랜덤 코스를 골라보세요</small></span>
              <em>옆으로 보기 →</em>
            </div>
            <div className="home-adventure-cards home-adventure-cards--two">
              {[
                ["blind-course", "🎁", "미스터리 가이드", "목적지는 도착하면 공개"],
                ["course", "🎲", "랜덤 코스", "완성된 코스를 바로 받기"],
              ].map(([mode, icon, title, copy]) => (
                <button key={mode} type="button" onClick={() => { setPendingAdventureMode(mode); setTimePickerOpen(true); }}>
                  <i>{icon}</i><b>{title}</b><small>{copy}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
        <button
          className="recommendation-cta"
          type="submit"
          disabled={!message.trim() || pendingQuickCourse !== null}
        >
          추천받기 <span>→</span>
        </button>
      </form>
      {account?.user && savedCourses[0] && (
        <button
          className="home-recent-course"
          type="button"
          onClick={() => openSavedCourse(savedCourses[0])}
        >
          <span>
            <small>최근 코스 이어보기</small>
            <strong>{savedCourses[0].title}</strong>
          </span>
          <b>열기 →</b>
        </button>
      )}
      {timePickerOpen && (
        <div
          className="time-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTimePickerOpen(false);
          }}
        >
          <section
            className="time-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="time-picker-title"
          >
            <div className="time-picker-head">
              <span aria-hidden="true">🐨</span>
              <div>
                <small>{pendingAdventureMode ? "코알라 모험 모드" : "코알라 자동 코스"}</small>
                <h2 id="time-picker-title">얼마나 여유가 있나요?</h2>
                <p>이 시간 안에서 이동과 방문을 모두 맞춰드려요.</p>
              </div>
            </div>
            <div className="auto-time-wheel-picker">
              <TimeWheel
                label="시간"
                values={COURSE_HOURS}
                value={courseHours}
                onChange={setCourseHours}
                suffix="시간"
              />
              <strong>:</strong>
              <TimeWheel
                label="분"
                values={COURSE_MINUTES}
                value={courseMinutes}
                onChange={setCourseMinutes}
                suffix="분"
              />
            </div>
            <div className="time-picker-summary">
              <span>선택한 시간</span>
              <b>
                {selectedDurationMinutes >= 30
                  ? `${selectedDurationMinutes}분`
                  : "최소 30분"}
              </b>
              <small>실제 코스는 약 10%의 이동 여유를 남겨요</small>
            </div>
            <div className="time-picker-actions">
              <button type="button" onClick={() => setTimePickerOpen(false)}>
                취소
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={selectedDurationMinutes < 30}
                onClick={confirmAutoCourseTime}
              >
                이 시간으로 추천받기
              </button>
            </div>
          </section>
        </div>
      )}
      {appointmentPromptOpen && (
        <div
          className="time-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setAppointmentPromptOpen(false);
          }}
        >
          <section
            className="time-picker-dialog appointment-time-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-time-title"
          >
            <div className="time-picker-head">
              <span aria-hidden="true">🕒</span>
              <div>
                <small>다음 일정 시간 확인</small>
                <h2 id="appointment-time-title">약속이 몇 시인가요?</h2>
                <p>도착 시간에 늦지 않는 코스를 계산할게요.</p>
              </div>
            </div>
            <div className="appointment-time-options">
              {suggestedAppointmentHours(pendingAppointmentMessage).map(
                (hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => submitAppointmentTime(hour)}
                  >
                    {hour < 12 ? "오전" : "오후"} {hour > 12 ? hour - 12 : hour}시
                  </button>
                ),
              )}
            </div>
            <button
              className="appointment-time-cancel"
              type="button"
              onClick={() => setAppointmentPromptOpen(false)}
            >
              문장 다시 입력하기
            </button>
          </section>
        </div>
      )}
      <AccountModal
        account={accountOpen ? account : null}
        accountMode={accountMode}
        accountSection={accountSection}
        gamificationError={gamificationError}
        exploredRegions={exploredRegions}
        accountError={accountError}
        clearingLearning={clearingLearning}
        favoritePlaces={favoritePlaces}
        excludedPlaces={excludedPlaces}
        savedCourses={savedCourses}
        savedCourseNotice={savedCourseNotice}
        onClose={closeAccount}
        onLogin={handleAccount}
        onSwitchMode={() => {
          setAccountError("");
          setAccountMode(accountMode === "login" ? "signup" : "login");
        }}
        onSavePreferences={savePreferences}
        onClearLearning={clearLearning}
        onSectionChange={setAccountSection}
        onEquipTitle={equipTitle}
        onUseFavorite={(place) => {
          setMessage(`${place.place_name}을 포함해서 지금 갈 코스를 추천해줘.`);
          setAccountOpen(false);
        }}
        onRemoveFavorite={removeFavorite}
        onRestorePlace={restorePlace}
        onOpenSavedCourse={openSavedCourse}
        onRemoveSavedCourse={removeSavedCourse}
        onLogout={() => {
          localStorage.removeItem("koala-token");
          onAccountChange({ token: null, user: null, preferences: null, personalization: null, gamification: null });
          setAccountOpen(false);
        }}
      />      <PromptHelpDialog
        open={promptHelpOpen}
        onClose={() => setPromptHelpOpen(false)}
        onSelectExample={usePromptExample}
      />
    </main>
  );
}

export default HomePage;
