import { useEffect, useState } from 'react'
import { fetchActivities, deleteActivity } from '../api'
import type { Activity } from '../types'
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../format'

const LABEL: Record<string, string> = { run: '🏃 跑步', cycle: '🚴 騎車', walk: '🚶 走路' }

export default function HistoryPage({ refreshKey }: { refreshKey: number }) {
  const [list, setList] = useState<Activity[]>([])
  const [error, setError] = useState('')

  async function load() {
    try { setList(await fetchActivities()); setError('') }
    catch { setError('載入失敗（後端未啟動？）') }
  }
  useEffect(() => { load() }, [refreshKey])

  async function remove(id: number) {
    if (!window.confirm('確定刪除這筆紀錄？')) return
    await deleteActivity(id)
    load()
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
            </div>
            <button className="btn-danger small" onClick={() => remove(a.id)}>刪除</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
