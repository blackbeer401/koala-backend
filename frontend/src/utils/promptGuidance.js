export const PROMPT_EXAMPLES = [
  {
    id: "time-and-activity",
    label: "시간과 하고 싶은 일",
    text: "홍대역에서 2시간 비어. 카페에 갔다가 산책하고 싶어.",
  },
  {
    id: "ordered-activities",
    label: "활동 순서 정하기",
    text: "성수역 근처에서 전시를 보고 밥 먹고 싶어.",
  },
  {
    id: "next-appointment",
    label: "다음 약속 전까지",
    text: "신림역에서 7시까지 약속 장소로 가야 해. 그 전에 카페에 들르고 싶어.",
  },
];

// 홈에서 실제로 선택할 수 있는 추천 진입 방식만 안내한다.
export const RECOMMENDATION_GUIDES = [
  {
    id: "free-request",
    icon: "✎",
    title: "원하는 대로 적기",
    summary: "지역·시간·활동을 한 문장으로",
    description:
      "장소 후보를 확인하고 직접 골라 실제 이동시간을 계산해 코스를 만들어요. 활동을 순서대로 쓰면 순서도 반영해요.",
  },
  {
    id: "auto-course",
    icon: "✨",
    title: "자동 코스 추천",
    summary: "무엇을 할지 정하지 못했을 때",
    description:
      "시간을 선택하면 현재 위치와 취향을 반영한 코스 후보를 보여줘요. 마음에 드는 후보를 골라 실제 이동 경로를 확인해요.",
  },
  {
    id: "blind-course",
    icon: "🎁",
    title: "미스터리 가이드",
    summary: "목적지를 모른 채 안내받고 싶을 때",
    description:
      "목적지를 감춘 채 길 안내를 시작해요. 대중교통·도보 구간을 따라 한 구간씩 이동하고, 도착하면 장소와 그곳에서 해볼 작은 미션을 확인해요.",
  },
  {
    id: "random-course",
    icon: "🎲",
    title: "랜덤 코스",
    summary: "코알라가 코스를 골라주길 원할 때",
    description:
      "현재 위치와 남은 시간에 맞춰 두 장소를 골라요. 실제 이동·체류 시간을 확인한 코스로 바로 이어져요.",
  },
];

export const COURSE_QUEST_GUIDE = {
  title: "오늘의 선택 미션",
  description:
    "별도 추천 메뉴가 아니라 코스를 확정한 뒤 방문 장소에 맞춰 제안돼요. 도착 후 직접 완료를 체크하고, 부담되면 건너뛸 수 있어요. 로그인하면 완료 보상이 여행 기록에 반영돼요.",
};
