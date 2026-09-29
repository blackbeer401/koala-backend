import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasAutoCourseStartLocationMismatch,
  hasStartLocationMismatch,
} from './locationContract.js'

test('nearby automatic-course response is accepted', () => {
  assert.equal(hasAutoCourseStartLocationMismatch(
    { latitude: 37.486890, longitude: 126.929364 },
    { latitude: 37.487001, longitude: 126.929100 },
  ), false)
})

test('wrong-area automatic-course response is rejected', () => {
  assert.equal(hasAutoCourseStartLocationMismatch(
    { latitude: 37.486890, longitude: 126.929364 },
    { latitude: 37.501271, longitude: 126.754157 },
  ), true)
})

test('manual start accepts a backend coordinate within geocoder tolerance', () => {
  assert.equal(hasStartLocationMismatch(
    { latitude: 37.4812845, longitude: 126.9527132 },
    { latitude: 37.4806129, longitude: 126.9530625 },
  ), false)
})

test('manual start rejects a different response location', () => {
  assert.equal(hasStartLocationMismatch(
    { latitude: 37.4812845, longitude: 126.9527132 },
    { latitude: 37.4676889, longitude: 126.9598429 },
  ), true)
})

test('manual start rejects a response without verified coordinates', () => {
  assert.equal(hasStartLocationMismatch(
    { latitude: 37.4812845, longitude: 126.9527132 },
    null,
  ), true)
})
