// Recommendation-domain helpers: normalize records and select varied candidates.
import { eventUrgency, formatEventPeriod, placeSourceKind } from "./recommendationPresentation";
import { categoryFallbackImages, categoryIcons, categoryLabels, stayMinutesByCategory } from "../config/recommendationDisplay";
import placeCulture from "../assets/images/place-culture.png";
import placePopup from "../assets/images/place-popup.png";

export const ACTIVITY_CATEGORY_LABELS = {
  food: ["식당", "맛집"], cafe: ["카페", "커피"], walk: ["산책", "걷기"],
  culture: ["문화", "전시", "공연"], entertainment: ["즐길거리", "놀거리", "게임"],
  shopping: ["쇼핑", "시장"], drink: ["술집", "주점"],
};

export function placeIdentity(place) {
  const sourceId = place.source_id ?? place.sourceId;
  if (sourceId) return `${place.source ?? "place"}:${sourceId}`;
  const name = String(place.name ?? "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const latitude = Number(place.latitude).toFixed(4);
  const longitude = Number(place.longitude).toFixed(4);
  return `${name}:${latitude}:${longitude}`;
}

export function buildAutoCourseCandidates(
  places,
  preferredActivities = [],
  hasPersonalPreferences = false,
  requestedPlaceCount = 3,
  variationIndex = 0,
  recentPlaceIds = [],
) {
  const unique = [
    ...new Map(places.map((place) => [placeIdentity(place), place])).values(),
  ];
  const count = Math.min(Math.max(2, requestedPlaceCount), unique.length);
  if (count < 2) return [];
  const recentSet = new Set(recentPlaceIds);
  const recentRank = (place) => (recentSet.has(placeIdentity(place)) ? 1 : 0);
  const categoryRank = (place, order) => {
    const index = order.indexOf(place.category);
    return index < 0 ? order.length : index;
  };
  let foodFirst = [...unique].sort(
    (left, right) =>
      categoryRank(left, [
        "food",
        "cafe",
        "walk",
        "culture",
        "entertainment",
        "shopping",
        "drink",
      ]) -
        categoryRank(right, [
          "food",
          "cafe",
          "walk",
          "culture",
          "entertainment",
          "shopping",
          "drink",
      ]) ||
      recentRank(left) - recentRank(right) ||
      left.distanceMeters - right.distanceMeters,
  );
  let cultureFirst = [...unique].sort((left, right) => {
    const leftEvent = left.sourceKind === "general" ? 0 : 1;
    const rightEvent = right.sourceKind === "general" ? 0 : 1;
    return (
      rightEvent - leftEvent ||
      categoryRank(left, [
        "culture",
        "entertainment",
        "walk",
        "cafe",
        "food",
        "shopping",
        "drink",
      ]) -
        categoryRank(right, [
          "culture",
          "entertainment",
          "walk",
          "cafe",
          "food",
          "shopping",
          "drink",
        ]) ||
      recentRank(left) - recentRank(right) ||
      left.distanceMeters - right.distanceMeters
    );
  });
  let balanced = [...unique].sort((left, right) => {
    const leftPreferred = preferredActivities.includes(left.category) ? 1 : 0;
    const rightPreferred = preferredActivities.includes(right.category) ? 1 : 0;
    return (
      rightPreferred - leftPreferred ||
      categoryRank(left, [
        "food",
        "culture",
        "cafe",
        "walk",
        "entertainment",
        "shopping",
        "drink",
      ]) -
        categoryRank(right, [
          "food",
          "culture",
          "cafe",
          "walk",
          "entertainment",
          "shopping",
          "drink",
        ]) ||
      recentRank(left) - recentRank(right) ||
      left.distanceMeters - right.distanceMeters
    );
  });
  // 점수가 높은 후보군은 유지하되 재추천할 때마다 그 안의 시작점을 바꾼다.
  // 완전 무작위로 먼 장소가 올라오는 문제 없이 같은 코스만 반복되는 현상을 줄인다.
  const rotateTopPool = (ordered, offset) => {
    const poolSize = Math.min(ordered.length, Math.max(4, count + 2));
    if (poolSize < 2) return ordered;
    const pool = ordered.slice(0, poolSize);
    const shift = Math.abs(Number(offset) || 0) % poolSize;
    return [
      ...pool.slice(shift),
      ...pool.slice(0, shift),
      ...ordered.slice(poolSize),
    ];
  };
  foodFirst = rotateTopPool(foodFirst, variationIndex);
  cultureFirst = rotateTopPool(cultureFirst, variationIndex * 2 + 1);
  balanced = rotateTopPool(balanced, variationIndex * 3 + 2);
  const selectVaried = (ordered, offset = 0, desiredCount = count) => {
    const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
    const selected = [];
    const selectedCategories = new Set();
    for (const place of rotated) {
      if (!selectedCategories.has(place.category)) {
        selected.push(place);
        selectedCategories.add(place.category);
      }
      if (selected.length === desiredCount) break;
    }
    for (const place of rotated) {
      if (selected.length === desiredCount) break;
      if (!selected.includes(place)) selected.push(place);
    }
    return selected;
  };
  const alternateCount =
    unique.length <= count + 1 ? Math.max(2, count - 1) : count;
  const hasLimitedEvent = cultureFirst.some(
    (place) => place.sourceKind !== "general",
  );
  const usedAcrossCourses = new Set();
  const selectLowOverlapByCategory = (ordered, categories, desiredCount) => {
    const selected = [];
    for (const category of categories) {
      const place = ordered.find(
        (item) =>
          item.category === category &&
          !usedAcrossCourses.has(placeIdentity(item)) &&
          !selected.includes(item),
      );
      if (place) selected.push(place);
      if (selected.length === desiredCount) break;
    }
    for (const place of ordered) {
      if (selected.length === desiredCount) break;
      if (
        !usedAcrossCourses.has(placeIdentity(place)) &&
        !selected.includes(place)
      )
        selected.push(place);
    }
    for (const place of ordered) {
      if (selected.length === desiredCount) break;
      if (!selected.includes(place)) selected.push(place);
    }
    selected.forEach((place) => usedAcrossCourses.add(placeIdentity(place)));
    return selected;
  };
  const candidates = [
    // 식사 코스는 "밥만 여러 곳"이 아니라 식사 뒤 카페로 이어지는 흐름을 우선한다.
    {
      id: "food",
      icon: "🍽",
      title: "배가 고프다면",
      description: "식사 뒤 카페에서 쉬는 자연스러운 동선이에요",
      places: selectLowOverlapByCategory(
        foodFirst,
        ["food", "cafe", "walk", "culture", "drink"],
        count,
      ),
    },
    // 문화·균형 코스에도 서로 다른 카페를 우선 배치한다. 사용자는 밥을 먹은 뒤
    // 쉬거나, 전시 뒤 커피를 마시는 선택지를 한 번에 비교할 수 있다.
    {
      id: "culture",
      icon: "🎟",
      title: hasLimitedEvent ? "지금만 볼 수 있다면" : "문화로 채우고 싶다면",
      description: hasLimitedEvent
        ? "팝업을 보고 다른 카페에서 쉬어가요"
        : "전시를 보고 카페에서 쉬어가요",
      places: selectLowOverlapByCategory(
        cultureFirst,
        ["culture", "cafe", "entertainment", "walk", "food"],
        alternateCount,
      ),
    },
    {
      id: "balance",
      icon: hasPersonalPreferences ? "💙" : "✨",
      title: "먹고 보고 쉬기",
      description: hasPersonalPreferences
        ? "저장한 취향과 서로 다른 카페를 함께 담았어요"
        : "식사·문화와 카페를 고르게 담았어요",
      places: selectLowOverlapByCategory(
        balanced,
        ["cafe", "food", "culture", "walk", "entertainment"],
        count,
      ),
    },
  ];
  const used = new Set();
  return candidates.map((candidate, index) => {
    let selected = candidate.places;
    let signature = selected.map(placeIdentity).join("|");
    if (used.has(signature)) {
      selected = selectVaried(
        candidate.id === "culture" ? cultureFirst : unique,
        Math.min(index, unique.length - 1),
        candidate.places.length,
      );
      signature = selected.map(placeIdentity).join("|");
    }
    used.add(signature);
    return { ...candidate, places: selected };
  });
}

export function normalizePlace(place, index) {
  const category = place.category ?? "culture";
  const sourceKind = placeSourceKind(place.source);
  const eventStart =
    place.start_at ??
    place.start_date ??
    place.event_start_date ??
    place.eventStartDate;
  const eventEnd =
    place.end_at ??
    place.end_date ??
    place.event_end_date ??
    place.eventEndDate;
  const actualImageUrl = place.image_url ?? place.imageUrl ?? null;
  const fallbackImageUrl =
    sourceKind === "popup"
      ? placePopup
      : (categoryFallbackImages[category] ?? placeCulture);
  return {
    ...place,
    id: `${place.source ?? "place"}-${place.source_id ?? index}-${place.name}`,
    name: place.name ?? "추천 장소",
    category,
    categoryLabel: categoryLabels[category] ?? place.category_detail ?? "장소",
    categoryIcon: categoryIcons[category] ?? "📍",
    stayMinutes:
      place.stay_duration_minutes ??
      place.specified_duration_minutes ??
      stayMinutesByCategory[category] ??
      45,
    specifiedDurationMinutes: place.specified_duration_minutes ?? null,
    distanceMeters: Number(place.distance_m ?? 0),
    sourceKind,
    sourceLabel:
      sourceKind === "popup"
        ? "팝업"
        : sourceKind === "culture"
          ? "문화행사"
          : null,
    eventPeriod: formatEventPeriod(eventStart, eventEnd),
    eventUrgency: eventUrgency(eventEnd),
    imageUrl: actualImageUrl ?? fallbackImageUrl,
    imageStatus: actualImageUrl ? "available" : "fallback",
    imageSource: place.image_source ?? place.imageSource ?? null,
    imageAttribution:
      place.image_attribution ?? place.imageAttribution ?? null,
    imageAttributionUrl:
      place.image_attribution_url ?? place.imageAttributionUrl ?? null,
  };
}

export function distanceMetersBetween(from, to) {
  if (!from || !to || from.latitude == null || to.latitude == null)
    return Infinity;
  const radius = 6371000;
  const latitudeDelta =
    ((Number(to.latitude) - Number(from.latitude)) * Math.PI) / 180;
  const longitudeDelta =
    ((Number(to.longitude) - Number(from.longitude)) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((Number(from.latitude) * Math.PI) / 180) *
      Math.cos((Number(to.latitude) * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetween(from, to) {
  if (!from || !to || from.latitude == null || to.latitude == null) return null;
  const fromLatitude = (Number(from.latitude) * Math.PI) / 180;
  const toLatitude = (Number(to.latitude) * Math.PI) / 180;
  const longitudeDelta =
    ((Number(to.longitude) - Number(from.longitude)) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function findSelectedPlace(optimizedPlace, selectedPlaces) {
  return selectedPlaces.find(
    (place) =>
      place.category === optimizedPlace.category &&
      Math.abs(Number(place.latitude) - Number(optimizedPlace.latitude)) <
        0.000001 &&
      Math.abs(Number(place.longitude) - Number(optimizedPlace.longitude)) <
        0.000001,
  );
}
