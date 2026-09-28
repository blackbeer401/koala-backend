import { useCallback, useEffect, useRef, useState } from "react";
import { awardGamificationEvent } from "../api/accountApi";

/** 코스·미션 보상 요청, 중복 방지, 사용자 알림을 한곳에서 관리한다. */
export function useGamificationRewards({
  initialCourseId,
  account,
  onAccountChange,
  guideIsComplete,
  courseConfirmed,
  questPlans,
  questProgress,
}) {
  const [courseId, setCourseId] = useState(initialCourseId ?? null);
  const [courseReady, setCourseReady] = useState(Boolean(initialCourseId));
  const [notice, setNotice] = useState("");
  const [questResults, setQuestResults] = useState({});
  const noticeTimerRef = useRef(null);
  const completionRewardedRef = useRef(new Set());
  const questRewardedRef = useRef(new Set());

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 5200);
  }, []);

  const showRewardNotice = useCallback((reward, fallbackMessage) => {
    if (!reward) return;
    const messages = [];
    if (reward.rank_up) messages.push(`등급 상승! ${reward.profile?.rank_name ?? "여행 등급"}`);
    const titles = reward.newly_unlocked_achievements?.map((item) => item.title_name).filter(Boolean) ?? [];
    if (titles.length) {
      const visibleTitles = titles.slice(0, 2).map((title) => `「${title}」`).join(" · ");
      messages.push(`업적 달성 · 칭호 획득 ${visibleTitles}${titles.length > 2 ? ` 외 ${titles.length - 2}개` : ""}`);
    }
    const districts = reward.newly_unlocked_districts?.map((item) => item.district_name).filter(Boolean) ?? [];
    if (districts.length) messages.push(`${districts.join("·")} 지역 해제`);
    if (!messages.length && reward.xp_awarded > 0) messages.push(fallbackMessage);
    if (!messages.length) return;
    if (reward.xp_awarded > 0) messages.push(`+${reward.xp_awarded} XP`);
    showNotice(messages.join(" · "));
  }, [showNotice]);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  useEffect(() => {
    if (!guideIsComplete || !account?.token || !courseReady || !courseId) return;
    const rewardKey = `${courseId}:complete`;
    if (completionRewardedRef.current.has(rewardKey)) return;
    completionRewardedRef.current.add(rewardKey);
    void awardGamificationEvent(account.token, {
      event_type: "course_complete",
      course_id: courseId,
    }).then((reward) => {
      if (reward?.profile) onAccountChange?.({ ...account, gamification: reward.profile });
      showRewardNotice(reward, "코스 안내 완료");
    }).catch(() => {
      completionRewardedRef.current.delete(rewardKey);
      showNotice("코스 안내는 마쳤어요. 완료 보상은 서버 연결 후 반영돼요.");
    });
  }, [guideIsComplete, account, onAccountChange, courseReady, courseId, showNotice, showRewardNotice]);

  useEffect(() => {
    if (!courseConfirmed || !courseReady || !account?.token || !courseId) return;
    questPlans.forEach((quest) => {
      if (questProgress[quest.id] !== "done") return;
      const rewardKey = `${courseId}:quest:${quest.id}`;
      if (questRewardedRef.current.has(rewardKey)) return;
      questRewardedRef.current.add(rewardKey);
      setQuestResults((current) => ({ ...current, [quest.id]: "pending" }));
      void awardGamificationEvent(account.token, {
        event_type: "quest_complete",
        course_id: courseId,
        quest_id: quest.id,
      }).then((reward) => {
        const result = reward?.already_completed ? "claimed" : reward?.xp_awarded ?? 0;
        setQuestResults((current) => ({ ...current, [quest.id]: result }));
        if (reward?.profile) onAccountChange?.({ ...account, gamification: reward.profile });
        showRewardNotice(reward, "오늘의 퀘스트 완료");
      }).catch(() => {
        setQuestResults((current) => ({ ...current, [quest.id]: "error" }));
        questRewardedRef.current.delete(rewardKey);
      });
    });
  }, [courseConfirmed, courseReady, account, onAccountChange, courseId, questProgress, questPlans, showRewardNotice]);

  return {
    courseId,
    setCourseId,
    courseReady,
    setCourseReady,
    notice,
    setNotice,
    questResults,
    showNotice,
    showRewardNotice,
  };
}
