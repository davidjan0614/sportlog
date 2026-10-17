import { useEffect, useRef, useState } from 'react'
import MapView from './MapView'
import { saveActivity, uploadPhoto } from '../api'
import { formatDistance, formatDuration, formatPace, formatSpeed } from '../format'
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

export default function TrackPage({ onSaved }: { onSaved: () => void }) {
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

  const watchId = useRef<number | null>(null)
  const timerId = useRef<number | null>(null)
  const startTs = useRef(0)
  const accum = useRef(0)
  const lastPt = useRef<[number, number] | null>(null)

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
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setPoints((prev) => [...prev, [lat, lng]])
        if (lastPt.current) setDistance((prev) => prev + haversine(lastPt.current![0], lastPt.current![1], lat, lng))
        lastPt.current = [lat, lng]
      },
      (err) => setError('定位失敗：' + err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  function start() {
    setPoints([]); setDistance(0); setElapsed(0); setError(''); setSaved(false); setPhotos([]); setSavedId(null)
    lastPt.current = null; accum.current = 0
    if (!('geolocation' in navigator)) { setError('此裝置不支援 GPS'); return }
    startTs.current = Date.now()
    setStatus('tracking')
    startWatch()
  }

  function pause() {
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    clearTimer()
    accum.current += (Date.now() - startTs.current) / 1000
    setElapsed(accum.current)
    setStatus('paused')
  }

  function resume() {
    startTs.current = Date.now()
    setStatus('tracking')
    startWatch()
  }

  async function stop() {
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    clearTimer()
    const endTs = Date.now()
    const duration = Math.max(1, accum.current + (endTs - startTs.current) / 1000)
    setElapsed(duration)
    setStatus('idle')
    setSaving(true)
    try {
      const id = await saveActivity({
        type, distance_m: Math.round(distance), duration_s: Math.round(duration),
        start_ts: startTs.current, end_ts: endTs, route: points.length > 0 ? points : null,
      })
      setSavedId(id)
      setSaved(true)
      onSaved()
    } catch (e) {
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
    <div className="page">
      <h2>開始運動</h2>
      <div className="type-select">
        {TYPES.map((t) => (
          <button key={t.key} className={type === t.key ? 'type-btn active' : 'type-btn'}
            onClick={() => status === 'idle' && setType(t.key)}>
            <span className="type-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="track-stats">
        <div className="track-stat primary">
          <span className="track-label">距離</span>
          <span className="track-value">{formatDistance(distance)}</span>
        </div>
        <div className="track-stat"><span className="track-label">時間</span><span className="track-value">{formatDuration(elapsed)}</span></div>
        <div className="track-stat"><span className="track-label">配速</span><span className="track-value">{formatPace(elapsed, distance)}</span></div>
        <div className="track-stat"><span className="track-label">速度</span><span className="track-value">{formatSpeed(distance, elapsed)} km/h</span></div>
      </div>

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
        {status === 'idle' && <button className="btn-primary" onClick={start}>▶ 開始</button>}
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
