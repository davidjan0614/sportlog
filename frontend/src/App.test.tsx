// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
vi.mock('./components/MapView', () => ({ default: () => null }))
vi.mock('./components/HistoryPage', () => ({ default: () => <p>歷史紀錄</p> }))
vi.mock('./api', () => ({ getToken: () => 'test', me: async () => ({ username: 'runner' }), setToken: vi.fn(), saveActivity: vi.fn(), uploadPhoto: vi.fn() }))
afterEach(() => { cleanup(); vi.useRealTimers() })
it('keeps GPS and elapsed time alive across internal tabs with a return shortcut', async () => {
  vi.useFakeTimers()
  const clearWatch = vi.fn()
  const watchPosition = vi.fn(() => 1)
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch } })
  await act(async () => { render(<App />) })
  fireEvent.click(screen.getByText('▶ 開始'))
  fireEvent.click(screen.getByText('歷史'))
  expect(screen.getByText('歷史紀錄')).toBeTruthy()
  act(() => vi.advanceTimersByTime(10000))
  fireEvent.click(screen.getByText('🏃 運動進行中・回到即時配速'))
  expect(screen.getByText('00:10')).toBeTruthy()
  expect(screen.getByText('⏸ 暫停')).toBeTruthy()
  expect(watchPosition).toHaveBeenCalledTimes(1)
  expect(clearWatch).not.toHaveBeenCalled()
})
