export type ActivityType = 'run' | 'cycle' | 'walk'

export interface Activity {
  id: number
  type: ActivityType
  distance_m: number
  duration_s: number
  start_ts: number
  end_ts: number
  route: [number, number][] | null
  note?: string | null
}

export interface Stats {
  total: { count: number; distance_m: number; duration_s: number }
  by_type: Record<string, { count: number; distance_m: number; duration_s: number }>
}
