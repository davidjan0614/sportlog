import { useState } from 'react'
import { downloadGpx } from '../gpx'
import type { GpxFile } from '../gpx'

export default function GpxExport({ file }: { file: GpxFile | null }) {
  const [message, setMessage] = useState('')
  return <div className="gpx-export">
    <button className="btn-gpx" disabled={!file} onClick={() => {
      if (!file) return
      try { downloadGpx(file); setMessage('已交給瀏覽器下載，請查看下載項目或「檔案」。') }
      catch { setMessage('下載未完成，請重試或改用手機瀏覽器。') }
    }}>下載 GPX</button>
    {file ? <a href="https://www.strava.com/upload/select" target="_blank" rel="noreferrer">前往 Strava 匯入 ↗</a> : <span className="muted">這台裝置沒有此筆完整定位時間，無法匯出。</span>}
    {message && <p className="muted" role="status">{message}</p>}
  </div>
}
