export function formatDuration(s: number): string {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, "0")
  const ss = String(sec).padStart(2, "0")
  return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss
}

export function formatDistance(m: number): string {
  if (m < 1000) return Math.round(m) + " m"
  return (m / 1000).toFixed(2) + " km"
}

export function formatPace(durationS: number, distanceM: number): string {
  if (distanceM < 1 || durationS <= 0) return "--:-- 分/公里"
  const pace = durationS / (distanceM / 1000)
  const m = Math.floor(pace / 60)
  const s = Math.floor(pace % 60)
  return m + ":" + String(s).padStart(2, "0") + ' 分/公里'
}

export function formatSpeed(distanceM: number, durationS: number): string {
  if (durationS < 1) return "0.0"
  return ((distanceM / 1000) / (durationS / 3600)).toFixed(1)
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
}
