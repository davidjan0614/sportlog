import { useEffect, useState } from 'react'
import { fetchActivities, deleteActivity, fetchPhotos, uploadPhoto } from '../api'
import GpxExport from './GpxExport'
import { recalledGpx, forgetGpx } from '../gpx'
import type { Activity } from '../types'
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../format'

const LABEL: Record<string, string> = { run: '🏃 跑步', cycle: '🚴 騎車', walk: '🚶 走路' }

export default function HistoryPage({ refreshKey, username = '' }: { refreshKey: number; username?: string }) {
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
    const activity = list.find(a => a.id === id)
    if (activity) forgetGpx(username, activity)
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
      <details className="gpx-help"><summary>如何手動匯入 Strava？</summary>
        <p>1. 下載這筆運動的 GPX 檔案。</p>
        <p>2. 開啟 Strava 網站的「上傳活動 → 檔案」，選擇 GPX。</p>
        <p>3. 檢查運動類型及公開範圍後儲存。</p>
        <p>建議用電腦操作；手機若看不到上傳欄位，請切換瀏覽器的「電腦版網站」。</p>
        <p>新版 GPX 只保留在記錄運動的裝置；清除瀏覽資料、更換裝置或舊紀錄缺少逐點時間時無法下載。Strava 會重新計算數據，可能與本站略有不同。</p>
      </details>
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
                <GpxExport file={recalledGpx(username, a)} />
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
