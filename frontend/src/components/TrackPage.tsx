import { useEffect, useRef, useState } from 'react'
import MapView from './MapView'
import { saveActivity, uploadPhoto } from '../api'
import { formatDuration, formatPace, formatSpeed } from '../format'
import type { ActivityType } from '../types'

const TYPES: { key: ActivityType; label: string; icon: string }[] = [
  { key: 'run', label: '跑步', icon: '🏃' },
  { key: 'cycle', label: '騎車', icon: '🚴' },
  { key: 'walk', label: '走路', icon: '🚶' },
]

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export default function TrackPage({ onSaved, onActiveChange }: { onSaved: () => void; onActiveChange: (active: boolean) => void }) {
  const [type, setType] = useState<ActivityType>('run')
  const [status, setStatus] = useState<'idle' | 'tracking' | 'paused'>('idle')
  const [points, setPoints] = useState<[number, number][]>([])
  const [distance, setDistance] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null)
  const [lastFix, setLastFix] = useState(0)
  const [awake, setAwake] = useState(false)
  const [keepAwake, setKeepAwake] = useState(true)

  const watchId = useRef<number | null>(null)
  const timerId = useRef<number | null>(null)
  const startTs = useRef(0)
  const accum = useRef(0)
  const lastPt = useRef<[number, number] | null>(null)
  const lastPosition = useRef<GeolocationPosition | null>(null)
  const sessionStart = useRef(0)
  const active = useRef(false)

  useEffect(() => { onActiveChange(status !== 'idle') }, [status, onActiveChange])

  useEffect(() => () => {
    active.current = false
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  useEffect(() => {
    if (status === 'idle') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  useEffect(() => {
    if (status === 'idle' || !keepAwake || !('wakeLock' in navigator)) return
    let disposed = false
    let lock: WakeLockSentinel | null = null
    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (disposed) { await next.release(); return }
        lock = next
        setAwake(true)
        next.addEventListener('release', () => { if (!disposed) setAwake(false) })
      } catch { if (!disposed) setAwake(false) }
    }
    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
      setAwake(false)
    }
  }, [status, keepAwake])

  function clearTimer() {
    if (timerId.current) { window.clearInterval(timerId.current); timerId.current = null }
  }

  useEffect(() => {
    if (status !== 'tracking') return
    const tick = () => setElapsed(accum.current + (Date.now() - startTs.current) / 1000)
    tick()
    timerId.current = window.setInterval(tick, 500)
    return clearTimer
  }, [status])

  function startWatch() {
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!active.current) return
        if (lastPosition.current && pos.timestamp <= lastPosition.current.timestamp) return
        if (!Number.isFinite(pos.coords.accuracy) || pos.coords.accuracy > 50) {
          setError('GPS 訊號較弱，請移到戶外開闊處')
          return
        }
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setError('')
        setLastFix(Date.now())
        const previous = lastPosition.current
        let speed = pos.coords.speed
        if (previous) {
          const seconds = (pos.timestamp - previous.timestamp) / 1000
          const meters = haversine(previous.coords.latitude, previous.coords.longitude, lat, lng)
          if (speed == null || !Number.isFinite(speed) || speed < 0) speed = seconds > 0 ? meters / seconds : null
        }
        setCurrentSpeed(speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null)
        lastPosition.current = pos
        setPoints((prev) => [...prev, [lat, lng]])
        if (lastPt.current) {
          const segment = haversine(lastPt.current[0], lastPt.current[1], lat, lng)
          setDistance((prev) => prev + segment)
        }
        lastPt.current = [lat, lng]
      },
      (err) => { if (active.current) { setCurrentSpeed(null); setError('定位失敗：' + err.message) } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  function start() {
    setPoints([]); setDistance(0); setElapsed(0); setError(''); setSaved(false); setPhotos([]); setSavedId(null)
    lastPt.current = null; accum.current = 0
    lastPosition.current = null; setCurrentSpeed(null); setLastFix(0)
    if (!('geolocation' in navigator)) { setError('此裝置不支援 GPS'); return }
    startTs.current = Date.now()
    sessionStart.current = startTs.current
    active.current = true
    setStatus('tracking')
    startWatch()
  }

  function pause() {
    active.current = false
    setCurrentSpeed(null)
    lastPt.current = null
    lastPosition.current = null
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    clearTimer()
    accum.current += (Date.now() - startTs.current) / 1000
    setElapsed(accum.current)
    setStatus('paused')
  }

  function resume() {
    active.current = true
    setLastFix(0)
    startTs.current = Date.now()
    setStatus('tracking')
    startWatch()
  }

  async function stop() {
    if (saving) return
    active.current = false
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    clearTimer()
    const endTs = Date.now()
    const duration = Math.max(1, accum.current + (status === 'tracking' ? (endTs - startTs.current) / 1000 : 0))
    setElapsed(duration)
    setStatus('idle')
    setSaving(true)
    try {
      const id = await saveActivity({
        type, distance_m: Math.round(distance), duration_s: Math.round(duration),
        start_ts: sessionStart.current, end_ts: endTs, route: points.length > 0 ? points : null,
      })
      setSavedId(id)
      setSaved(true)
      onSaved()
    } catch (e) {
      accum.current = duration
      setStatus('paused')
      setError('儲存失敗（後端未啟動？）')
    } finally { setSaving(false) }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || savedId == null) return
    try {
      const url = await uploadPhoto(savedId, file)
      setPhotos((prev) => [...prev, url])
    } catch { setError('照片上傳失敗') }
    e.target.value = ''
  }

  return (
    <div className={status === 'idle' ? 'page' : 'page running'}>
      <h2>{status === 'idle' ? '準備開始運動' : status === 'paused' ? '運動已暫停' : '運動進行中'}</h2>
      <div className="type-select">
        {TYPES.map((t) => (
          <button key={t.key} className={type === t.key ? 'type-btn active' : 'type-btn'}
            onClick={() => status === 'idle' && setType(t.key)}>
            <span className="type-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <section className="workout-dashboard" aria-label="運動數據">
        <div className="pace-hero">
          <span className="track-label">即時配速</span>
          <div className="pace-number">{status === 'tracking' && lastFix > Date.now() - 15000 && currentSpeed != null && currentSpeed > 0.3 ? formatPace(1000 / currentSpeed, 1000).split(' ')[0] : '--:--'}</div>
          <span className="metric-unit">分 / 公里</span>
        </div>
        <div className="workout-totals">
          <div className="metric"><span className="track-label">運動時間</span><strong>{formatDuration(elapsed)}</strong><span className="metric-unit">時間</span></div>
          <div className="metric"><span className="track-label">累計距離</span><strong>{(distance / 1000).toFixed(2)}</strong><span className="metric-unit">公里</span></div>
        </div>
        <div className="workout-details">
          <div className="metric"><span className="track-label">即時速度</span><strong>{status === 'tracking' && lastFix > Date.now() - 15000 && currentSpeed != null ? (currentSpeed * 3.6).toFixed(1) : '--'}</strong><span className="metric-unit">km/h</span></div>
          <div className="metric"><span className="track-label">平均配速</span><strong>{formatPace(elapsed, distance).split(' ')[0]}</strong><span className="metric-unit">分 / 公里</span></div>
          <div className="metric"><span className="track-label">平均速度</span><strong>{formatSpeed(distance, elapsed)}</strong><span className="metric-unit">km/h</span></div>
        </div>
      </section>
      {status !== 'idle' && <div className="tracking-notice" role="status">
        <p>{status === 'paused' ? '已暫停' : !lastFix ? '等待 GPS 定位，請允許位置權限' : lastFix < Date.now() - 15000 ? 'GPS 尚未更新，請確認定位權限與訊號' : 'GPS 定位中・數據隨定位更新'}</p>
        <label><input type="checkbox" checked={keepAwake} onChange={e => setKeepAwake(e.target.checked)} /> 保持螢幕亮起</label>
        <p>{awake ? '螢幕保持亮起中' : '螢幕常亮未啟用，請保持此頁在前景'}</p>
      </div>}

      {error && <p className="error">{error}</p>}
      {saving && <p className="muted">儲存中…</p>}
      {saved && (
        <div className="saved-box">
          <p className="success">✅ 已儲存！</p>
          <label className="btn-add-photo big">📷 上傳運動照片
            <input type="file" accept="image/*" capture="environment" hidden onChange={onPickPhoto} />
          </label>
          {photos.length > 0 && (
            <div className="photo-row">
              {photos.map((url, i) => <img key={i} src={url} className="photo-thumb" alt="" />)}
            </div>
          )}
        </div>
      )}

      <div className="track-actions">
        {status === 'idle' && <button className="btn-primary" disabled={saving} onClick={start}>▶ 開始</button>}
        {status === 'tracking' && <button className="btn-warn" onClick={pause}>⏸ 暫停</button>}
        {status === 'paused' && (
          <>
            <button className="btn-primary" onClick={resume}>▶ 繼續</button>
            <button className="btn-danger" onClick={stop}>■ 結束並儲存</button>
          </>
        )}
        {status === 'tracking' && <button className="btn-danger" onClick={stop}>■ 結束並儲存</button>}
      </div>

      <MapView points={points} height={280} />
    </div>
  )
}
