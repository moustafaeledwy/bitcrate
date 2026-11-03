import { useMemo } from 'react'

const GRID = 32

function colorAt(x: number, y: number): string | null {
  const dx = x + 0.5 - GRID / 2
  const dy = y + 0.5 - GRID / 2
  const r = Math.hypot(dx, dy)
  if (r > 15.5) return null
  if (r < 1.8) return '#FFF0E5'
  if (r < 5.5) return '#FFD300'
  if (dx > 0 && dy < 0 && r > 7 && r < 13 && Math.abs(dx + dy) < 2.5) return '#F966FF'
  if (Math.floor(r) === 8 || Math.floor(r) === 11) return '#3A10E5'
  return '#1D2340'
}

// The same pixel-art record as the app icon.
export function Record({ size, spinning }: { size: number; spinning?: boolean }) {
  const pixels = useMemo(() => {
    const list: { x: number; y: number; fill: string }[] = []
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const fill = colorAt(x, y)
        if (fill) list.push({ x, y, fill })
      }
    }
    return list
  }, [])
  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={spinning ? 'record-spin' : undefined}
    >
      {pixels.map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />
      ))}
    </svg>
  )
}
