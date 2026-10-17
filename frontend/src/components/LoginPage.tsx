import { useState } from 'react'
import { login, register } from '../api'

export default function LoginPage({ onLogin }: { onLogin: (u: { username: string }) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const fn = mode === 'login' ? login : register
      const u = await fn(username.trim(), password)
      onLogin(u)
    } catch (err: any) {
      setError(err.message || '失敗')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>🏃 SportLog</h1>
        <p className="muted">運動紀錄 · 跑步 / 騎車 / 走路</p>
        <form onSubmit={submit}>
          <label>帳號
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" placeholder="例如 david" />
          </label>
          <label>密碼
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="至少 4 字" />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" disabled={loading}>{loading ? '處理中…' : mode === 'login' ? '登入' : '註冊'}</button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '沒有帳號？去註冊' : '已有帳號？去登入'}
        </button>
      </div>
    </div>
  )
}
