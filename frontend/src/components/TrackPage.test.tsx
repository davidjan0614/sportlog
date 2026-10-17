// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import TrackPage from './TrackPage'
import { saveActivity } from '../api'

vi.mock('./StravaPanel', () => ({ default: () => null, StravaActivity: () => null }))
vi.mock('./MapView', () => ({ default: () => null }))
vi.mock('../api', () => ({ saveActivity: vi.fn().mockResolvedValue(1), uploadPhoto: vi.fn() }))
let position: PositionCallback
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-17T00:00:00Z'))
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    watchPosition: vi.fn((callback: PositionCallback) => { position = callback; return 1 }),
    clearWatch: vi.fn(),
  } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })
function fix(latitude: number, speed: number | null) {
  act(() => position({ timestamp: Date.now(), coords: { latitude, longitude: 121, accuracy: 5, speed } } as GeolocationPosition))
}
function mount() { render(<TrackPage onSaved={vi.fn()} onActiveChange={vi.fn()} />); fireEvent.click(screen.getByText('▶ 開始')) }
it('updates distance and derives live pace when GPS has no speed; expires stale readings', () => {
  mount()
  fix(25, null)
  act(() => vi.advanceTimersByTime(10000))
  fix(25.0003, null)
  expect(screen.getAllByText('12.0').length).toBe(2)
  expect(screen.getByText('0.03')).toBeTruthy()
  expect(screen.getAllByText('4:59').length).toBeGreaterThan(0)
  act(() => vi.advanceTimersByTime(16000))
  expect(screen.getByText('GPS 尚未更新，請確認定位權限與訊號')).toBeTruthy()
  expect(screen.getByText('即時速度').parentElement?.textContent).toBe('即時速度--km/h')
})
it('excludes pause time and paused movement, preserving original start time', async () => {
  mount()
  const start = Date.now()
  fix(25, 3)
  act(() => vi.advanceTimersByTime(10000))
  fix(25.0003, 3)
  fireEvent.click(screen.getByText('⏸ 暫停'))
  act(() => vi.advanceTimersByTime(60000))
  fireEvent.click(screen.getByText('▶ 繼續'))
  fix(25.01, 3)
  act(() => vi.advanceTimersByTime(5000))
  fireEvent.click(screen.getByText('⏸ 暫停'))
  act(() => vi.advanceTimersByTime(60000))
  await act(async () => { fireEvent.click(screen.getByText('■ 結束並儲存')) })
  expect(saveActivity).toHaveBeenCalledWith(expect.objectContaining({ duration_s: 15, distance_m: 33, start_ts: start }))
})
it('releases screen wake lock on stop and clears GPS on unmount', async () => {
  const release = vi.fn().mockResolvedValue(undefined)
  const request = vi.fn().mockResolvedValue({ released: false, release, addEventListener: vi.fn() })
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
  mount()
  await act(async () => {})
  expect(request).toHaveBeenCalledWith('screen')
  expect(screen.getByText('螢幕保持亮起中')).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByText('■ 結束並儲存')) })
  expect(release).toHaveBeenCalled()
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(1)
  fireEvent.click(screen.getByText('▶ 開始'))
  cleanup()
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledTimes(2)
  Reflect.deleteProperty(navigator, 'wakeLock')
})
