import { useCallback, useEffect, useRef, useState } from "react";
import {
  requestMorePlaces,
  requestPlacePhotos,
  requestPlaces,
} from "../api/placesApi";
import { audit } from "../utils/auditTrace";
import { normalizePlace, placeIdentity } from "../utils/recommendationPlaces";

const PHOTO_LOOKUP_BATCH_SIZE = 6;
const PAGE_APPEND_LIMIT = 4;
const LOAD_MORE_THROTTLE_MS = 700;

/** 추천 지역의 장소 목록, 사진 보강, 추가 페이지 상태를 한 곳에서 관리한다. */
export function useRecommendationPlaces({
  placeMode,
  autoCourseMode,
  selectedArea,
  recommendationContext,
  excludedPlaceKeys,
}) {
  const [places, setPlaces] = useState([]);
  const [placeSourceFilter, setPlaceSourceFilter] = useState("all");
  const [placeCursor, setPlaceCursor] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);
  const [hasMorePlaces, setHasMorePlaces] = useState(false);
  const [placeStatus, setPlaceStatus] = useState("idle");
  const [placeError, setPlaceError] = useState("");
  const [moreLoadError, setMoreLoadError] = useState("");
  const placeRequestGenerationRef = useRef(0);
  const photoLookupAttemptedRef = useRef(new Set());
  const loadMoreRequestRef = useRef(false);
  const lastLoadMoreAtRef = useRef(0);
  const placeScrollRef = useRef(null);

  useEffect(() => {
    if (!placeMode || !selectedArea?.name || selectedArea.latitude == null || selectedArea.longitude == null) {
      return undefined;
    }

    const requestGeneration = ++placeRequestGenerationRef.current;
    let cancelled = false;
    setPlaceSourceFilter("all");
    setPlaceStatus("loading");
    setPlaceError("");
    setMoreLoadError("");

    requestPlaces({
      areaName: selectedArea.name,
      latitude: selectedArea.latitude,
      longitude: selectedArea.longitude,
      recommendationContext,
    })
      .then(async (data) => {
        if (cancelled || requestGeneration !== placeRequestGenerationRef.current) return;
        let combinedPlaces = data.places ?? [];
        let nextCursor = data.cursor ?? null;
        let followingOffset = data.next_offset ?? null;
        let moreAvailable = Boolean(data.has_more);

        // 자동 코스 선택지를 다양하게 만들 수 있도록 준비된 다음 페이지만 한 번 덧붙인다.
        if (autoCourseMode && nextCursor && followingOffset != null && moreAvailable) {
          try {
            const more = await requestMorePlaces({ cursor: nextCursor, offset: followingOffset });
            if (cancelled || requestGeneration !== placeRequestGenerationRef.current) return;
            combinedPlaces = [...combinedPlaces, ...(more.places ?? [])];
            nextCursor = more.cursor ?? nextCursor;
            followingOffset = more.next_offset ?? null;
            moreAvailable = Boolean(more.has_more);
          } catch {
            // 첫 페이지 결과만으로도 추천을 이어간다.
          }
        }

        const seen = new Set();
        setPlaces(combinedPlaces.map(normalizePlace).filter((place) => {
          const identity = placeIdentity(place);
          if (excludedPlaceKeys.has(identity) || seen.has(identity)) return false;
          seen.add(identity);
          return true;
        }));
        setPlaceCursor(nextCursor);
        setNextOffset(followingOffset);
        setHasMorePlaces(moreAvailable);
        setPlaceStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setPlaces([]);
        setPlaceStatus("error");
        setPlaceError(error.message);
      });

    return () => { cancelled = true; };
  }, [
    placeMode,
    autoCourseMode,
    selectedArea?.name,
    selectedArea?.latitude,
    selectedArea?.longitude,
    recommendationContext,
    excludedPlaceKeys,
  ]);

  useEffect(() => {
    if (!placeMode || placeStatus !== "ready") return undefined;
    const candidates = places.filter((place) =>
      place.sourceKind === "general" &&
      ["food", "cafe", "culture", "walk", "entertainment", "shopping", "drink"].includes(place.category) &&
      place.imageStatus !== "available" &&
      !photoLookupAttemptedRef.current.has(place.id),
    ).slice(0, PHOTO_LOOKUP_BATCH_SIZE);
    if (!candidates.length) return undefined;

    candidates.forEach((place) => photoLookupAttemptedRef.current.add(place.id));
    let cancelled = false;
    requestPlacePhotos(candidates)
      .then((data) => {
        if (cancelled || !data?.enabled || !data.photos?.length) return;
        const photos = new Map(data.photos.map((photo) => [photo.client_key, photo]));
        setPlaces((current) => current.map((place) => {
          const photo = photos.get(place.id);
          return photo ? {
            ...place,
            imageUrl: photo.image_url,
            imageStatus: "available",
            imageSource: photo.image_source,
            imageAttribution: photo.image_attribution,
            imageAttributionUrl: photo.image_attribution_url,
          } : place;
        }));
      })
      .catch((error) => audit("optional_place_photo_error", { message: error?.message }));
    return () => { cancelled = true; };
  }, [placeMode, placeStatus, places]);

  const handleLoadMore = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (
      !placeCursor || nextOffset == null || !hasMorePlaces ||
      (moreLoadError && !force) || placeStatus === "more-loading" ||
      loadMoreRequestRef.current || (!force && now - lastLoadMoreAtRef.current < LOAD_MORE_THROTTLE_MS)
    ) return;

    loadMoreRequestRef.current = true;
    lastLoadMoreAtRef.current = now;
    const requestGeneration = placeRequestGenerationRef.current;
    const requestedOffset = nextOffset;
    setMoreLoadError("");
    setPlaceStatus("more-loading");
    try {
      const data = await requestMorePlaces({ cursor: placeCursor, offset: requestedOffset });
      if (requestGeneration !== placeRequestGenerationRef.current) return;
      setPlaces((current) => {
        const seen = new Set(current.map(placeIdentity));
        const additions = (data.places ?? [])
          .map((place, index) => normalizePlace(place, current.length + index))
          .filter((place) => {
            const identity = placeIdentity(place);
            if (excludedPlaceKeys.has(identity) || seen.has(identity)) return false;
            seen.add(identity);
            return true;
          })
          .slice(0, PAGE_APPEND_LIMIT);
        return [...current, ...additions];
      });

      // 화면에는 한 번에 네 곳씩 추가하고, 아직 안 보인 서버 결과는 다음 조회에서 이어서 받는다.
      const nextClientOffset = requestedOffset + PAGE_APPEND_LIMIT;
      const moreCandidatesRemain = Boolean(data.has_more) || (data.places ?? []).length > PAGE_APPEND_LIMIT;
      setNextOffset(moreCandidatesRemain ? nextClientOffset : null);
      setHasMorePlaces(moreCandidatesRemain);
      setPlaceStatus("ready");
    } catch (error) {
      setPlaceStatus("ready");
      setMoreLoadError(error.message || "장소를 불러오지 못했어요");
    } finally {
      loadMoreRequestRef.current = false;
    }
  }, [placeCursor, nextOffset, hasMorePlaces, moreLoadError, placeStatus, excludedPlaceKeys]);

  return {
    places,
    setPlaces,
    placeSourceFilter,
    setPlaceSourceFilter,
    placeCursor,
    nextOffset,
    hasMorePlaces,
    placeStatus,
    setPlaceStatus,
    placeError,
    setPlaceError,
    moreLoadError,
    setMoreLoadError,
    placeRequestGenerationRef,
    placeScrollRef,
    handleLoadMore,
  };
}
