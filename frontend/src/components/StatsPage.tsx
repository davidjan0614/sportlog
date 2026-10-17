import { useEffect, useState } from 'react'
import { fetchStats } from '../api'
import type { Stats } from '../types'
import { formatDistance, formatDuration } from '../format'

const LABEL: Record<string, string> = { run: '🏃 跑步', cycle: '🚴 騎車', walk: '🚶 走路' }

export default function StatsPage({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => { fetchStats().then(setStats).catch(() => setStats(null)) }, [refreshKey])

  return (
    <div className="page">
      <h2>統計</h2>
      {!stats && <p className="muted">載入中…</p>}
      {stats && (
        <>
          <div className="stat-cards">
            <div className="stat-card"><span className="stat-num">{stats.total.count}</span><span className="stat-label">總次數</span></div>
            <div className="stat-card"><span className="stat-num">{formatDistance(stats.total.distance_m)}</span><span className="stat-label">總距離</span></div>
            <div className="stat-card"><span className="stat-num">{formatDuration(stats.total.duration_s)}</span><span className="stat-label">總時間</span></div>
          </div>
          <h3>各類型</h3>
          {Object.entries(stats.by_type).map(([k, v]) => (
            <div key={k} className="stat-row">
              <span className="stat-row-label">{LABEL[k] ?? k}</span>
              <span className="stat-row-value">{v.count} 次 · {formatDistance(v.distance_m)} · {formatDuration(v.duration_s)}</span>
            </div>
          ))}
          {Object.keys(stats.by_type).length === 0 && <p className="muted">還沒有運動紀錄。</p>}
        </>
      )}
    </div>
  )
}
