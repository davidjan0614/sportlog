import { useEffect, useState } from 'react'
import { fetchMonthly } from '../api'
import { formatDistance, formatDuration } from '../format'

interface MonthRow {
  month: string; count: number; distance_m: number; duration_s: number
  by_type: Record<string, { count: number; distance_m: number; duration_s: number }>
}

const LABEL: Record<string, string> = { run: '🏃 跑步', cycle: '🚴 騎車', walk: '🚶 走路' }

export default function ReportPage({ refreshKey }: { refreshKey: number }) {
  const [months, setMonths] = useState<MonthRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMonthly().then(setMonths).catch(() => setError('載入失敗'))
  }, [refreshKey])

  return (
    <div className="page">
      <h2>每月報表</h2>
      {error && <p className="error">{error}</p>}
      {months.length === 0 && !error && <p className="muted">還沒有運動紀錄。</p>}
      {months.map((m) => (
        <div key={m.month} className="month-card">
          <div className="month-head">
            <strong>{m.month}</strong>
            <span>{m.count} 次 · {formatDistance(m.distance_m)} · {formatDuration(m.duration_s)}</span>
          </div>
          <div className="month-types">
            {Object.entries(m.by_type).map(([t, v]) => (
              <span key={t} className="month-type-chip">{LABEL[t] ?? t}：{v.count} 次 · {formatDistance(v.distance_m)}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
