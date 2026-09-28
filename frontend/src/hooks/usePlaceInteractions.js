import { useState } from "react";
import {
  addFavoritePlace,
  excludePlace,
  getPersonalizationProfile,
  recordInteraction,
  removeFavoritePlace,
} from "../api/accountApi";
import { placeIdentity } from "../utils/recommendationPlaces";

/** 장소 숨김·즐겨찾기·취향 피드백과 계정 API 연동을 담당한다. */
export function usePlaceInteractions({
  account,
  areaName,
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
}) {
  const [placeFeedback, setPlaceFeedback] = useState({});

  const handleExcludePlace = async (place, { preserveCourse = false } = {}) => {
    if (!account?.token) {
      onOpenAccount?.();
      return;
    }
    const placeKey = placeIdentity(place);
    try {
      await excludePlace(account.token, { place_key: placeKey, place_name: place.name });
      setExcludedPlaceKeys((current) => new Set([...current, placeKey]));
      if (!preserveCourse) {
        setPlaces((current) => current.filter((item) => placeIdentity(item) !== placeKey));
        setSelectedPlaces((current) => current.filter((item) => placeIdentity(item) !== placeKey));
        setCalculated(false);
        setCourseResult(null);
      }
      void recordInteraction(account.token, {
        event_type: "hide",
        place_key: placeKey,
        place_name: place.name,
        category: place.category,
        context_data: { area_name: areaName ?? null },
      }).catch(() => {});
    } catch (error) {
      setPlaceError(error.message ?? "이 장소를 숨기지 못했어요.");
    }
  };

  const toggleFavoritePlace = async (place) => {
    if (!account?.token) {
      onOpenAccount?.();
      return;
    }
    const placeKey = placeIdentity(place);
    const isFavorite = favoritePlaceKeys.has(placeKey);
    try {
      if (isFavorite) {
        await removeFavoritePlace(account.token, placeKey);
      } else {
        await addFavoritePlace(account.token, {
          place_key: placeKey,
          place_name: place.name,
          category: place.category,
          // 다른 기기에서도 코스에 다시 넣을 수 있는 최소 정보만 보관한다.
          place_data: {
            id: place.id,
            source_id: place.source_id ?? null,
            name: place.name,
            address: place.address ?? null,
            category: place.category,
            latitude: place.latitude,
            longitude: place.longitude,
            image_url: place.imageUrl ?? null,
          },
        });
      }
      setFavoritePlaceKeys((current) => {
        const next = new Set(current);
        if (isFavorite) next.delete(placeKey);
        else next.add(placeKey);
        return next;
      });
      if (!isFavorite) {
        void recordInteraction(account.token, {
          event_type: "favorite",
          place_key: placeKey,
          place_name: place.name,
          category: place.category,
          context_data: { area_name: areaName ?? null },
        }).catch(() => {});
      }
    } catch (error) {
      setPlaceError(error.message ?? "즐겨찾기를 변경하지 못했어요.");
    }
  };

  const sendPlaceFeedback = async (place, eventType) => {
    if (!account?.token) {
      onOpenAccount?.();
      return;
    }
    const placeKey = placeIdentity(place);
    const previousFeedback = placeFeedback[placeKey];
    if (previousFeedback === eventType) return;
    setPlaceFeedback((current) => ({ ...current, [placeKey]: eventType }));
    try {
      await recordInteraction(account.token, {
        event_type: eventType,
        place_key: placeKey,
        place_name: place.name,
        category: place.category,
        context_data: { area_name: areaName ?? null },
      });
      const personalization = await getPersonalizationProfile(account.token);
      onAccountChange?.({ ...account, personalization });
    } catch (error) {
      setPlaceFeedback((current) => {
        const next = { ...current };
        if (previousFeedback) next[placeKey] = previousFeedback;
        else delete next[placeKey];
        return next;
      });
      setPlaceError(error.message ?? "의견을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  };

  return { placeFeedback, handleExcludePlace, toggleFavoritePlace, sendPlaceFeedback };
}
