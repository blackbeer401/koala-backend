import { API_BASE_URL } from "./apiConfig";

// Resolve a user's station or neighborhood text into a selectable start point.
export async function searchStartLocation(query, { signal } = {}) {
  const params = new URLSearchParams({ query: query.trim() });
  const response = await fetch(
    `${API_BASE_URL}/search-location?${params.toString()}`,
    { signal },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.detail ?? "지역을 찾지 못했어요. 역이나 동네 이름으로 검색해 주세요.",
    );
  }
  return data;
}

// Resolve an accepted GPS fix to an address for display; route math keeps using coordinates.
export async function reverseGeocodeLocation(location, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  });
  const response = await fetch(
    `${API_BASE_URL}/reverse-geocode?${params.toString()}`,
    { signal },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail ?? "현재 주소를 확인하지 못했어요.");
  }
  return data;
}
