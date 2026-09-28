import { useEffect, useMemo, useState } from "react";
import {
  createDailyCourseQuestPlan,
  getDailyQuestStorageKeys,
  readDailyQuestPlan,
  readQuestProgress,
  writeDailyQuestPlan,
  writeQuestProgress,
} from "../utils/questMissions";

/** 확정 코스에 맞는 오늘의 선택 미션과 비밀 코스 표시를 관리한다. */
export function useCourseQuestProgress({
  visiblePlaces,
  adventureExperience,
  courseConfirmed,
  mysteryRevealed,
  guideStep,
  userKey = "guest",
}) {
  const [dayKey, setDayKey] = useState(() => getDailyQuestStorageKeys(userKey).dayKey);
  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(
      () => setDayKey(getDailyQuestStorageKeys(userKey).dayKey),
      Math.max(1000, nextDay.getTime() - now.getTime() + 50),
    );
    return () => window.clearTimeout(timer);
  }, [userKey, dayKey]);
  const storageKeys = useMemo(
    () => getDailyQuestStorageKeys(userKey, dayKey),
    [userKey, dayKey],
  );
  const [planState, setPlanState] = useState(() => ({
    key: storageKeys.plan,
    plans: readDailyQuestPlan(storageKeys.plan) ?? [],
  }));
  const [progressState, setProgressState] = useState(() => ({
    key: storageKeys.progress,
    value: readQuestProgress(storageKeys.progress),
  }));
  const questPlans = planState.key === storageKeys.plan ? planState.plans : [];
  const questProgress = progressState.key === storageKeys.progress ? progressState.value : {};
  useEffect(() => {
    if (planState.key !== storageKeys.plan) {
      const savedPlan = readDailyQuestPlan(storageKeys.plan);
      if (savedPlan) {
        setPlanState({ key: storageKeys.plan, plans: savedPlan });
      } else if (courseConfirmed && visiblePlaces.length) {
        const plans = createDailyCourseQuestPlan(visiblePlaces, storageKeys.dayKey, userKey);
        writeDailyQuestPlan(storageKeys.plan, plans);
        setPlanState({
          key: storageKeys.plan,
          plans,
        });
      }
      return;
    }

    if (!planState.plans.length && courseConfirmed && visiblePlaces.length) {
      const plans = createDailyCourseQuestPlan(visiblePlaces, storageKeys.dayKey, userKey);
      writeDailyQuestPlan(storageKeys.plan, plans);
      setPlanState({
        key: storageKeys.plan,
        plans,
      });
    }
  }, [planState, courseConfirmed, storageKeys, userKey, visiblePlaces]);

  useEffect(() => {
    if (progressState.key !== storageKeys.progress) {
      setProgressState({
        key: storageKeys.progress,
        value: readQuestProgress(storageKeys.progress),
      });
    }
  }, [progressState.key, storageKeys.progress]);

  useEffect(() => {
    if (progressState.key === storageKeys.progress) {
      writeQuestProgress(storageKeys.progress, progressState.value);
    }
  }, [progressState, storageKeys.progress]);

  const questDoneCount = questPlans.filter((quest) => questProgress[quest.id] === "done").length;
  const questSkippedCount = questPlans.filter((quest) => questProgress[quest.id] === "skipped").length;
  const questEstimatedMinutes = questPlans.reduce((sum, quest) => sum + quest.minutes, 0);
  const mysteryMode = adventureExperience?.mode === "blind-course";

  const updateQuestProgress = (questId, status) => {
    setProgressState((state) => {
      const current = state.key === storageKeys.progress ? state.value : {};
      const next = { ...current };
      if (status) next[questId] = status;
      else delete next[questId];
      return { key: storageKeys.progress, value: next };
    });
  };

  const mysteryName = (place, index) =>
    mysteryMode && !mysteryRevealed && index >= guideStep
      ? `비밀 장소 ${index + 1}`
      : place.name;
  const mapVisiblePlaces = visiblePlaces.map((place, index) => ({
    ...place,
    name: mysteryName(place, index),
  }));

  return {
    questProgress,
    questPlans,
    questDoneCount,
    questSkippedCount,
    questEstimatedMinutes,
    updateQuestProgress,
    mysteryMode,
    mysteryName,
    mapVisiblePlaces,
  };
}
