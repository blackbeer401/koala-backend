export const FAST_GPS_ACCURACY_METERS = 80
export const MAX_GPS_ACCURACY_METERS = 150

export function normalizeGpsFix(coords) {
  const latitude = Number(coords?.latitude)
  const longitude = Number(coords?.longitude)
  const accuracy = Number(coords?.accuracy)

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy <= 0
  ) {
    return null
  }

  return { latitude, longitude, accuracy, updatedAt: Date.now() }
}

export function hasFastGpsFix(location) {
  return Boolean(
    location && location.accuracy <= FAST_GPS_ACCURACY_METERS,
  )
}

export function hasUsableGpsFix(location) {
  return Boolean(
    location && location.accuracy <= MAX_GPS_ACCURACY_METERS,
  )
}
