import { useEffect, useState } from 'react'
import TrackPage from './components/TrackPage'
import HistoryPage from './components/HistoryPage'
import StatsPage from './components/StatsPage'
import ReportPage from './components/ReportPage'
import LoginPage from './components/LoginPage'
import { getToken, me, setToken } from './api'

type Tab = 'track' | 'history' | 'stats' | 'report'

export default function App() {
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<Tab>('track')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    ;(async () => {
      if (getToken()) {
        try { setUser(await me()) } catch { setToken(null); setUser(null) }
      }
      setChecking(false)
    })()
  }, [])

  if (checking) return <div className="app"><p className="muted">載入中…</p></div>
  if (!user) return <LoginPage onLogin={(u) => setUser(u)} />

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏃 SportLog 運動紀錄</h1>
        <span className="user-chip">{user.username}</span>
        <button className="logout-btn" onClick={() => { setToken(null); setUser(null) }}>登出</button>
      </header>
      <main className="app-main">
        {tab === 'track' && <TrackPage onSaved={() => setRefreshKey((k) => k + 1)} />}
        {tab === 'history' && <HistoryPage refreshKey={refreshKey} />}
        {tab === 'stats' && <StatsPage refreshKey={refreshKey} />}
        {tab === 'report' && <ReportPage refreshKey={refreshKey} />}
      </main>
      <nav className="tab-bar">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>追蹤</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>歷史</button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>統計</button>
        <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>報表</button>
      </nav>
    </div>
  )
}
