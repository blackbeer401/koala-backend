import { useCallback, useEffect, useRef, useState } from 'react'
import { reverseGeocodeLocation } from '../api/locationApi'
import {
  hasFastGpsFix,
  hasUsableGpsFix,
  normalizeGpsFix,
} from '../utils/locationAccuracy'

// Give high-accuracy GPS a short window, then accept only the bounded coarse fallback.
const GPS_FIX_WAIT_MS = 8000

export function useCurrentLocation() {
  const [location, setLocation] = useState(null)
  const [address, setAddress] = useState(null)
  const [addressStatus, setAddressStatus] = useState('idle')
  const [status, setStatus] = useState('idle')
  const watchIdRef = useRef(null)
  const fixTimeoutRef = useRef(null)
  const addressRequestRef = useRef(null)
  const generationRef = useRef(0)

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const cancelRequests = useCallback(() => {
    generationRef.current += 1
    stopWatching()
    if (fixTimeoutRef.current !== null) {
      window.clearTimeout(fixTimeoutRef.current)
      fixTimeoutRef.current = null
    }
    addressRequestRef.current?.abort()
    addressRequestRef.current = null
  }, [stopWatching])

  useEffect(() => cancelRequests, [cancelRequests])

  const clearLocation = useCallback(() => {
    cancelRequests()
    setLocation(null)
    setAddress(null)
    setAddressStatus('idle')
    setStatus('idle')
  }, [cancelRequests])

  const requestLocation = useCallback((onSuccess, onFailure) => {
    if (!navigator.geolocation) {
      setStatus('unsupported')
      if (typeof onFailure === 'function') onFailure()
      return
    }

    cancelRequests()
    const generation = generationRef.current
    setStatus('loading')
    let settled = false
    let bestLocation = null

    const fail = (error) => {
      if (settled || generation !== generationRef.current) return
      settled = true
      if (fixTimeoutRef.current !== null) {
        window.clearTimeout(fixTimeoutRef.current)
        fixTimeoutRef.current = null
      }
      setStatus('unavailable')
      if (error?.code === error?.PERMISSION_DENIED) setStatus('denied')
      stopWatching()
      if (typeof onFailure === 'function') onFailure(error)
    }

    const acceptLocation = (nextLocation) => {
      if (settled || generation !== generationRef.current) return
      settled = true
      if (fixTimeoutRef.current !== null) {
        window.clearTimeout(fixTimeoutRef.current)
        fixTimeoutRef.current = null
      }
      setLocation(nextLocation)
      setAddress(null)
      setAddressStatus('loading')
      setStatus('success')
      stopWatching()
      if (typeof onSuccess === 'function') onSuccess(nextLocation)

      // Ignore late address responses after location is cleared or requested again.
      const addressController = new AbortController()
      addressRequestRef.current = addressController
      const addressTimeout = window.setTimeout(() => addressController.abort(), 8000)
      reverseGeocodeLocation(nextLocation, { signal: addressController.signal })
        .then((result) => {
          if (generation !== generationRef.current) return
          setAddress(result)
          setAddressStatus(result?.road_address || result?.jibun_address || result?.display_name ? 'success' : 'unavailable')
        })
        .catch(() => { if (generation === generationRef.current) setAddressStatus('unavailable') })
        .finally(() => window.clearTimeout(addressTimeout))
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        ({ coords }) => {
          if (settled || generation !== generationRef.current) return
          const nextLocation = normalizeGpsFix(coords)
          if (!nextLocation) return
          if (!bestLocation || nextLocation.accuracy < bestLocation.accuracy) {
            bestLocation = nextLocation
          }
          if (hasFastGpsFix(nextLocation)) {
            acceptLocation(nextLocation)
            return
          }
          setStatus('low_accuracy')
        },
        (error) => {
          if (settled || generation !== generationRef.current) return
          if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
            fail(error)
            return
          }
          setStatus('low_accuracy')
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      )
    } catch (error) {
      // Some browsers throw synchronously when location access is blocked by
      // permissions or document policy; route that through the same fallback.
      fail(error)
      return
    }

    fixTimeoutRef.current = window.setTimeout(() => {
      if (hasUsableGpsFix(bestLocation)) {
        acceptLocation(bestLocation)
        return
      }
      fail({ code: 'LOW_ACCURACY' })
    }, GPS_FIX_WAIT_MS)
  }, [stopWatching, cancelRequests])

  return { location, address, addressStatus, status, requestLocation, clearLocation }
}
