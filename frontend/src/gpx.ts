import type { Activity, ActivityType } from './types'

export type GpsSample = { lat: number; lng: number; ts: number; segment: number }
export type GpxFile = { xml: string; filename: string }
const LABEL = { run: '跑步', cycle: '騎車', walk: '走路' }
const key = (owner: string, activity: Pick<Activity, 'id' | 'start_ts'>) => `sportlog_gpx:${encodeURIComponent(owner)}:${activity.id}:${activity.start_ts}`

export function makeGpx(type: ActivityType, samples: GpsSample[]): GpxFile {
  if (samples.length < 2) throw new Error('至少需要兩個 GPS 定位點才能匯出，請先在戶外記錄一段運動。')
  let previousTime = 0
  let previousSegment: number | null = null
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="SportLog" xmlns="http://www.topografix.com/GPX/1/1"><trk>', `<name>SportLog ${LABEL[type]}</name>`]
  for (const p of samples) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || !Number.isFinite(p.ts) || p.ts <= previousTime || !Number.isFinite(new Date(p.ts).getTime())) {
      throw new Error('定位資料或時間不完整，無法產生 GPX。')
    }
    if (p.segment !== previousSegment) {
      if (previousSegment != null) parts.push('</trkseg>')
      parts.push('<trkseg>')
      previousSegment = p.segment
    }
    parts.push(`<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.ts).toISOString()}</time></trkpt>`)
    previousTime = p.ts
  }
  parts.push('</trkseg></trk></gpx>')
  return { xml: parts.join('\n'), filename: `SportLog-${type}-${new Date(samples[0].ts).toISOString().replace(/[:.]/g, '-')}.gpx` }
}

export function rememberGpx(owner: string, activity: Pick<Activity, 'id' | 'start_ts'>, file: GpxFile): boolean {
  try { localStorage.setItem(key(owner, activity), JSON.stringify(file)); return true } catch { return false }
}

export function recalledGpx(owner: string, activity: Pick<Activity, 'id' | 'start_ts'>): GpxFile | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(owner, activity)) || 'null')
    return typeof value?.xml === 'string' && typeof value?.filename === 'string' ? value : null
  } catch { return null }
}

export function forgetGpx(owner: string, activity: Pick<Activity, 'id' | 'start_ts'>) {
  try { localStorage.removeItem(key(owner, activity)) } catch { /* Browser storage can be unavailable. */ }
}

export function downloadGpx(file: GpxFile) {
  const url = URL.createObjectURL(new Blob([file.xml], { type: 'application/gpx+xml;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
