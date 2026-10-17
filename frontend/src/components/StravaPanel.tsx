import { useEffect, useState } from 'react'
import { stravaStatus, stravaConnect, stravaDisconnect, stravaActivity, stravaSync } from '../api'
import type { StravaState, StravaResult } from '../api'

export default function StravaPanel() {
  const [state, setState] = useState<StravaState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { stravaStatus().then(setState).catch(() => setError('Strava 連線狀態暫時無法讀取')) }, [])
  async function connect() {
    setBusy(true); setError('')
    try { window.location.assign((await stravaConnect()).url) }
    catch (e) { setError((e as Error).message); setBusy(false) }
  }
  async function disconnect() {
    setBusy(true)
    try { await stravaDisconnect(); setState(await stravaStatus()) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const callback = new URLSearchParams(window.location.search).get('strava')
  return <section className="strava-panel">
    <div><h3>Strava 同步</h3><p className="muted">連接後，新運動的路線與時間會自動上傳至你的 Strava。</p></div>
    {callback === 'failed' && <p className="error">授權未完成，請重新連接並允許上傳運動。</p>}
    {state?.connected ? <><p className="success">已連接・新運動自動同步</p><button className="link-btn" disabled={busy} onClick={disconnect}>停止同步並移除此站的授權資料</button></> : state?.configured ? <button className="strava-button" disabled={busy} onClick={connect}>連接 Strava</button> : state && <p className="muted">網站尚未完成 Strava 設定，暫時無法連接。</p>}
    {error && <p className="error">{error}</p>}
    <p className="muted">同步後的公開範圍依 Strava 設定；馬拉松世界需另外開啟其 Strava 同步。</p>
  </section>
}

export function StravaActivity({ id }: { id: number }) {
  const [result, setResult] = useState<StravaResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let checks = 0
    async function check() {
      try {
        const next = await stravaActivity(id)
        if (cancelled) return
        setResult(next)
        if (checks++ < 12 && (next.status === 'processing' || next.status === 'not_synced')) {
          if (next.status === 'processing') {
            const polled = await stravaSync(id)
            if (!cancelled) setResult(polled)
          }
          if (!cancelled) timer = setTimeout(check, 5000)
        }
      } catch { /* Keep saved workouts available even if integration is offline. */ }
    }
    void check()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id])
  async function retry() {
    setBusy(true); setError('')
    try { setResult(await stravaSync(id)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (!result) return null
  return <div className="strava-activity">
    {result.status === 'synced' && result.strava_id ? <a href={`https://www.strava.com/activities/${result.strava_id}`} target="_blank" rel="noreferrer">已同步至 Strava ↗</a> : <>
      <span>{result.status === 'processing' ? 'Strava 處理中' : result.status === 'failed' ? result.error : '尚未同步至 Strava'}</span>
      <button className="sync-button" disabled={busy} onClick={retry}>{busy ? '同步中…' : result.status === 'processing' ? '更新狀態' : '同步至 Strava'}</button>
    </>}
    {error && <p className="error">{error}</p>}
  </div>
}
