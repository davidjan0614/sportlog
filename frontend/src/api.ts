import type { Activity, ActivityType, Stats } from './types'

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? '/api'

export async function fetchActivities(): Promise<Activity[]> {
  const r = await fetch(API_BASE + '/activities')
  if (!r.ok) throw new Error('載入歷史失敗')
  return r.json()
}

export async function saveActivity(a: {
  type: ActivityType; distance_m: number; duration_s: number; start_ts: number; end_ts: number;
  route: [number, number][] | null; note?: string
}): Promise<number> {
  const r = await fetch(API_BASE + '/activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a),
  })
  if (!r.ok) throw new Error('儲存失敗')
  const j = await r.json()
  return j.id
}

export async function deleteActivity(id: number): Promise<void> {
  await fetch(API_BASE + '/activities/' + id, { method: 'DELETE' })
}

export async function fetchStats(): Promise<Stats> {
  const r = await fetch(API_BASE + '/stats')
  if (!r.ok) throw new Error('統計載入失敗')
  return r.json()
}
