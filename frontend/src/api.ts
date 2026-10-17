import type { Activity, ActivityType, Stats } from './types'

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? '/api'

let TOKEN: string | null = localStorage.getItem('sportlog_token')

export function getToken(): string | null { return TOKEN }

export function setToken(t: string | null) {
  TOKEN = t
  if (t) localStorage.setItem('sportlog_token', t)
  else localStorage.removeItem('sportlog_token')
}

export function photoUrl(path: string): string {
  if (path.startsWith('http')) return path
  return API_BASE + path
}

async function req(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers as any) }
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN
  const r = await fetch(API_BASE + path, { ...opts, headers })
  if (r.status === 401) { setToken(null); throw new Error('登入已過期') }
  return r
}

async function reqJson(path: string, opts: RequestInit = {}): Promise<any> {
  const r = await req(path, opts)
  if (!r.ok) {
    let msg = '錯誤'
    try { const j = await r.json(); msg = j.detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return r.json()
}

export async function login(username: string, password: string): Promise<{ username: string }> {
  const r = await fetch(API_BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (!r.ok) {
    let msg = '登入失敗'
    try { msg = (await r.json()).detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const j = await r.json()
  setToken(j.token)
  return { username: j.username }
}

export async function register(username: string, password: string): Promise<{ username: string }> {
  const r = await fetch(API_BASE + '/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (!r.ok) {
    let msg = '註冊失敗'
    try { msg = (await r.json()).detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const j = await r.json()
  setToken(j.token)
  return { username: j.username }
}

export async function me(): Promise<{ username: string }> {
  return reqJson('/auth/me')
}

export async function fetchActivities(): Promise<Activity[]> {
  return reqJson('/activities')
}

export async function saveActivity(a: {
  type: ActivityType; distance_m: number; duration_s: number; start_ts: number; end_ts: number;
  route: [number, number][] | null; note?: string
}): Promise<number> {
  const j = await reqJson('/activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a),
  })
  return j.id
}

export async function deleteActivity(id: number): Promise<void> {
  await req('/activities/' + id, { method: 'DELETE' })
}

export async function fetchStats(): Promise<Stats> {
  return reqJson('/stats')
}

export async function fetchMonthly(): Promise<any[]> {
  return reqJson('/reports/monthly')
}

export async function uploadPhoto(activityId: number, file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await req('/activities/' + activityId + '/photos', { method: 'POST', body: fd })
  if (!r.ok) throw new Error('照片上傳失敗')
  const j = await r.json()
  return photoUrl(j.photo)
}

export async function fetchPhotos(activityId: number): Promise<string[]> {
  const j = await reqJson('/activities/' + activityId + '/photos')
  return j.map(photoUrl)
}
