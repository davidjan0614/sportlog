import { useEffect, useState } from 'react'
import { fetchActivities, deleteActivity, fetchPhotos, uploadPhoto } from '../api'
import type { Activity } from '../types'
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../format'

const LABEL: Record<string, string> = { run: '🏃 跑步', cycle: '🚴 騎車', walk: '🚶 走路' }

export default function HistoryPage({ refreshKey }: { refreshKey: number }) {
  const [list, setList] = useState<Activity[]>([])
  const [photos, setPhotos] = useState<Record<number, string[]>>({})
  const [error, setError] = useState('')

  async function load() {
    try {
      const acts = await fetchActivities()
      setList(acts); setError('')
      const pmap: Record<number, string[]> = {}
      for (const a of acts) {
        try { pmap[a.id] = await fetchPhotos(a.id) } catch { pmap[a.id] = [] }
      }
      setPhotos(pmap)
    } catch { setError('載入失敗') }
  }
  useEffect(() => { load() }, [refreshKey])

  async function remove(id: number) {
    if (!window.confirm('確定刪除這筆紀錄？')) return
    await deleteActivity(id)
    load()
  }

  async function onPick(aid: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadPhoto(aid, file)
      const p = await fetchPhotos(aid)
      setPhotos((prev) => ({ ...prev, [aid]: p }))
    } catch { /* ignore */ }
    e.target.value = ''
  }

  return (
    <div className="page">
      <h2>運動歷史</h2>
      {error && <p className="error">{error}</p>}
      {list.length === 0 && !error && <p className="muted">還沒有紀錄，去「追蹤」開始第一筆吧！</p>}
      <ul className="history-list">
        {list.map((a) => (
          <li key={a.id} className="history-item">
            <div className="history-info">
              <span className="history-type">{LABEL[a.type] ?? a.type}</span>
              <div className="history-meta">
                <strong>{formatDistance(a.distance_m)}</strong>
                <span>· {formatDuration(a.duration_s)} · 配速 {formatPace(a.duration_s, a.distance_m)}</span>
                <span className="history-date">{formatDateTime(a.start_ts)}</span>
              </div>
              {(photos[a.id]?.length ?? 0) > 0 && (
                <div className="photo-row">
                  {photos[a.id].map((url, i) => <img key={i} src={url} className="photo-thumb" alt="" />)}
                </div>
              )}
            </div>
            <div className="history-actions">
              <label className="btn-add-photo">📷
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(a.id, e)} />
              </label>
              <button className="btn-danger small" onClick={() => remove(a.id)}>刪除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
