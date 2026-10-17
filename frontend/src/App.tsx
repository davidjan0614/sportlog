import { useState } from 'react'
import TrackPage from './components/TrackPage'
import HistoryPage from './components/HistoryPage'
import StatsPage from './components/StatsPage'

type Tab = 'track' | 'history' | 'stats'

export default function App() {
  const [tab, setTab] = useState<Tab>('track')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏃 SportLog 運動紀錄</h1>
      </header>
      <main className="app-main">
        {tab === 'track' && <TrackPage onSaved={() => setRefreshKey((k) => k + 1)} />}
        {tab === 'history' && <HistoryPage refreshKey={refreshKey} />}
        {tab === 'stats' && <StatsPage refreshKey={refreshKey} />}
      </main>
      <nav className="tab-bar">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>追蹤</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>歷史</button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>統計</button>
      </nav>
    </div>
  )
}
