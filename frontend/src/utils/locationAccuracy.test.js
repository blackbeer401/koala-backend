import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasFastGpsFix,
  hasUsableGpsFix,
  normalizeGpsFix,
} from './locationAccuracy.js'

test('GPS coordinates must be within valid geographic bounds', () => {
  assert.equal(normalizeGpsFix({ latitude: 91, longitude: 127, accuracy: 10 }), null)
  assert.equal(normalizeGpsFix({ latitude: 37.5, longitude: 181, accuracy: 10 }), null)
  assert.equal(normalizeGpsFix({ latitude: 37.5, longitude: 127, accuracy: 0 }), null)
})

test('GPS fixes with strong accuracy are accepted immediately', () => {
  const location = normalizeGpsFix({ latitude: 37.5, longitude: 127, accuracy: 65 })

  assert.equal(hasFastGpsFix(location), true)
  assert.equal(hasUsableGpsFix(location), true)
})

test('coarse GPS fixes are allowed only as a bounded fallback', () => {
  const location = normalizeGpsFix({ latitude: 37.5, longitude: 127, accuracy: 120 })

  assert.equal(hasFastGpsFix(location), false)
  assert.equal(hasUsableGpsFix(location), true)
  assert.equal(hasUsableGpsFix(normalizeGpsFix({ latitude: 37.5, longitude: 127, accuracy: 300 })), false)
})
