const QUESTS_BY_CATEGORY = {
  food: [
    { title: "처음 보는 메뉴 한 가지 찾아보기", detail: "메뉴판에서 낯선 메뉴를 골라 한입 맛보고, 마음에 든 점을 하나 떠올려요.", minutes: 5, difficulty: "가벼움" },
    { title: "오늘의 대표 메뉴 맛보기", detail: "이곳을 대표하는 메뉴를 천천히 먹고 가장 마음에 든 맛을 찾아요.", minutes: 10, difficulty: "가벼움" },
    { title: "맛의 포인트 한 가지 발견하기", detail: "음식의 향·식감·양념 중 평소보다 더 눈여겨볼 점을 하나 골라봐요.", minutes: 5, difficulty: "가벼움" },
  ],
  cafe: [
    { title: "오늘 기분에 맞는 음료 고르기", detail: "늘 마시던 메뉴 대신 지금 기분에 어울리는 음료나 디저트를 골라봐요.", minutes: 5, difficulty: "가벼움" },
    { title: "마음에 드는 자리 찾아보기", detail: "매장 안에서 가장 편안해 보이는 자리를 골라 잠깐 쉬어가요.", minutes: 5, difficulty: "가벼움" },
    { title: "음료의 새로운 맛 찾기", detail: "첫 모금 뒤에 느껴지는 향이나 맛을 하나 골라 기억해 둬요.", minutes: 5, difficulty: "가벼움" },
  ],
  walk: [
    { title: "주변에서 좋아하는 색 찾기", detail: "주변을 천천히 보며 오늘 가장 눈에 들어온 색이나 풍경을 찾아요.", minutes: 7, difficulty: "가벼움" },
    { title: "처음 보는 골목 한 구간 걷기", detail: "안전한 길을 골라 평소 지나치던 골목을 5분 정도 둘러봐요.", minutes: 7, difficulty: "보통" },
    { title: "기억하고 싶은 장면 남기기", detail: "사진을 찍거나 눈에 담아두고 싶은 풍경을 하나 찾아봐요.", minutes: 5, difficulty: "가벼움" },
  ],
  culture: [
    { title: "작품 하나를 조금 더 바라보기", detail: "가장 마음에 드는 작품 앞에서 1분 머물며 눈에 들어온 점을 찾아요.", minutes: 5, difficulty: "가벼움" },
    { title: "마음에 남는 전시 포인트 찾기", detail: "색·소리·이야기 중 오늘 기억하고 싶은 요소 하나를 골라봐요.", minutes: 5, difficulty: "가벼움" },
    { title: "작품에 나만의 제목 붙이기", detail: "작품 하나를 고르고 떠오르는 짧은 제목을 마음속으로 붙여봐요.", minutes: 3, difficulty: "가벼움" },
  ],
  entertainment: [
    { title: "새로운 활동 10분 체험하기", detail: "평소 선택하지 않던 게임이나 체험을 부담 없는 범위에서 해봐요.", minutes: 10, difficulty: "보통" },
    { title: "처음 보는 콘텐츠 골라보기", detail: "처음 눈에 들어온 체험 하나를 살펴보고 끌리면 짧게 즐겨봐요.", minutes: 10, difficulty: "보통" },
    { title: "오늘의 작은 기록 세우기", detail: "점수나 기록이 있는 활동이라면 나만의 소소한 목표를 정해봐요.", minutes: 10, difficulty: "도전" },
  ],
  shopping: [
    { title: "새로운 브랜드 한 곳 둘러보기", detail: "평소 보지 않던 코너나 브랜드를 하나 골라 천천히 구경해요.", minutes: 7, difficulty: "가벼움" },
    { title: "예산 안에서 마음에 드는 것 찾기", detail: "구매할 필요는 없어요. 정한 예산 안에서 마음에 든 물건을 찾아봐요.", minutes: 7, difficulty: "가벼움" },
    { title: "선물하고 싶은 물건 찾아보기", detail: "누군가에게 잘 어울릴 것 같은 물건을 하나 골라 이유를 생각해봐요.", minutes: 5, difficulty: "가벼움" },
  ],
  drink: [
    { title: "안주 한 가지 천천히 맛보기", detail: "처음 보는 안주나 익숙한 메뉴 하나를 천천히 즐겨봐요.", minutes: 10, difficulty: "가벼움" },
    { title: "오늘 분위기에 맞는 메뉴 고르기", detail: "무리하지 않고 지금 기분에 어울리는 메뉴 하나를 골라봐요.", minutes: 5, difficulty: "가벼움" },
    { title: "가장 마음에 든 맛 기억하기", detail: "오늘 먹은 것 중 가장 좋았던 맛이나 식감을 하나 떠올려봐요.", minutes: 5, difficulty: "가벼움" },
  ],
};

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function currentLocalDayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function questForPlace(place, dayKey = currentLocalDayKey(), variation = 0) {
  const quests = QUESTS_BY_CATEGORY[place?.category] ?? [
    { title: "이곳에서 새로운 점 하나 발견하기", detail: "장소를 둘러보고 평소와 다른 점이나 마음에 드는 점을 하나 찾아요.", minutes: 5, difficulty: "가벼움" },
  ];
  const placeKey = `${place?.name ?? "장소"}:${place?.latitude ?? ""}:${place?.longitude ?? ""}`;
  const dayNumber = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
  const dailyOffset = Number.isFinite(dayNumber) ? dayNumber : stableHash(dayKey);
  return quests[(stableHash(placeKey) + dailyOffset + variation) % quests.length];
}

function hashKey(value) {
  return stableHash(String(value ?? "guest")).toString(36);
}

export function getDailyQuestStorageKeys(userKey = "guest", dayKey = currentLocalDayKey()) {
  const owner = hashKey(userKey);
  // v2 assigns optional missions to a confirmed route stop, unlike the old
  // standalone quest-mode plan. Keep legacy plans from appearing on new flows.
  return {
    plan: `koala-daily-quest-plan:v2:${owner}:${dayKey}`,
    progress: `koala-daily-quest-progress:v2:${owner}:${dayKey}`,
    dayKey,
  };
}

/** Identify the confirmed route so an untouched daily plan can follow a changed course. */
export function getCourseQuestSignature(places) {
  const courseKey = (places ?? [])
    .map((place) => `${place?.name ?? ""}:${place?.category ?? ""}:${place?.latitude ?? ""}:${place?.longitude ?? ""}`)
    .join("|");
  return stableHash(courseKey).toString(36);
}

/** Build one or two daily missions from the stops in the confirmed course. */
export function createDailyCourseQuestPlan(places, dayKey, userKey = "guest") {
  if (!places?.length) return [];

  // Stable per user and day: it feels random, but refreshes never reshuffle it.
  const seed = stableHash(`${userKey}:${dayKey}`);
  const courseSignature = getCourseQuestSignature(places);
  const mainIndex = seed % places.length;
  const mainPlace = places[mainIndex];
  const plan = [
    { slot: "main", place: mainPlace, placeIndex: mainIndex, rewardXp: 10 },
  ];

  if (places.length > 1) {
    const otherIndexes = places
      .map((place, index) => ({ place, index }))
      .filter(({ index }) => index !== mainIndex);
    const differentActivity = otherIndexes.filter(
      ({ place }) => place.category !== mainPlace.category,
    );
    const bonusChoices = differentActivity.length ? differentActivity : otherIndexes;
    const bonus = bonusChoices[seed % bonusChoices.length];
    plan.push({ slot: "bonus", place: bonus.place, placeIndex: bonus.index, rewardXp: 5 });
  }

  return plan.map(({ slot, place, placeIndex, rewardXp }) => ({
    ...questForPlace(place, `${dayKey}:${slot}`, seed + placeIndex),
    id: `daily-${dayKey}-${slot}`,
    slot,
    placeIndex,
    placeName: place.name,
    category: place.category,
    courseSignature,
    rewardXp,
  }));
}

export function readDailyQuestPlan(key, storage = globalThis.localStorage) {
  if (!key || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDailyQuestPlan(key, plan, storage = globalThis.localStorage) {
  if (!key || !storage || !Array.isArray(plan) || !plan.length) return false;
  try {
    storage.setItem(key, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function getQuestProgressKey(places, dayKey = currentLocalDayKey()) {
  if (!places?.length) return null;
  const courseKey = places
    .map((place) => `${place?.name ?? ""}:${place?.latitude ?? ""}:${place?.longitude ?? ""}`)
    .sort()
    .join("|");
  return `koala-quest-progress:${dayKey}:${stableHash(courseKey).toString(36)}`;
}

export function readQuestProgress(key, storage = globalThis.localStorage) {
  if (!key || !storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "{}");
    return Object.fromEntries(
      Object.entries(parsed).filter(([, status]) => status === "done" || status === "skipped"),
    );
  } catch {
    return {};
  }
}

export function writeQuestProgress(key, progress, storage = globalThis.localStorage) {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
