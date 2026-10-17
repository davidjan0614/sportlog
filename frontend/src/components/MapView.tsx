import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  points: [number, number][]
  height?: number
}

export default function MapView({ points, height = 260 }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    if (!mapRef.current) {
      mapRef.current = L.map(divRef.current).setView([25.03, 121.5], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current)
      routeRef.current = L.layerGroup().addTo(mapRef.current)
    }
    routeRef.current!.clearLayers()
    if (points.length > 1) {
      const latlngs = points.map(([lat, lng]) => [lat, lng] as [number, number])
      L.polyline(latlngs, { color: '#16a34a', weight: 4 }).addTo(routeRef.current!)
      mapRef.current.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] })
    } else if (points.length === 1) {
      L.marker([points[0][0], points[0][1]]).addTo(routeRef.current!)
      mapRef.current.setView([points[0][0], points[0][1]], 15)
    }
  }, [points])

  return <div ref={divRef} style={{ height, width: '100%', borderRadius: 12 }} />
}
