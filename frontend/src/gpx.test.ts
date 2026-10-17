// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { makeGpx, rememberGpx, recalledGpx, forgetGpx } from './gpx'
const samples = [
  { lat: 25, lng: 121, ts: 1792195200000, segment: 0 },
  { lat: 25.0003, lng: 121, ts: 1792195210000, segment: 0 },
  { lat: 25.0005, lng: 121, ts: 1792195300000, segment: 1 },
]
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
it('exports actual UTC times in GPX 1.1 with separate pause segments', () => {
  const file = makeGpx('run', samples)
  const xml = new DOMParser().parseFromString(file.xml, 'application/xml')
  expect(xml.querySelector('parsererror')).toBeNull()
  expect(xml.documentElement.namespaceURI).toBe('http://www.topografix.com/GPX/1/1')
  expect(xml.querySelectorAll('trkseg')).toHaveLength(2)
  expect([...xml.querySelectorAll('time')].map(n => n.textContent)).toEqual(samples.map(p => new Date(p.ts).toISOString()))
  expect(file.filename).toMatch(/^SportLog-run-.*\.gpx$/)
})
it('rejects missing or invalid times and coordinates', () => {
  expect(() => makeGpx('run', [])).toThrow()
  expect(() => makeGpx('run', [samples[1], samples[0]])).toThrow()
  expect(() => makeGpx('run', [samples[0], {...samples[1], lat: 100}])).toThrow()
})
it('isolates exports by account and activity start and handles full storage', () => {
  const activity = {id: 1, start_ts: samples[0].ts}
  const file = makeGpx('walk', samples)
  expect(rememberGpx('runner', activity, file)).toBe(true)
  expect(recalledGpx('runner', activity)).toEqual(file)
  expect(recalledGpx('other', activity)).toBeNull()
  expect(recalledGpx('runner', {...activity, start_ts: 1})).toBeNull()
  forgetGpx('runner', activity)
  expect(recalledGpx('runner', activity)).toBeNull()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(rememberGpx('runner', activity, file)).toBe(false)
})
