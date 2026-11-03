import { useEffect, useRef, useState } from 'react'
import type { TrackState } from '../../../shared/types'

const images = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string): Promise<HTMLImageElement> {
  let image = images.get(url)
  if (!image) {
    image = new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = reject
      element.src = url
    })
    images.set(url, image)
  }
  return image
}

// Covers start as chunky 8-bit art and sharpen as the track downloads.
export function resolutionFor(track: Pick<TrackState, 'status' | 'progress'>): number | 'full' {
  if (track.status === 'saved' || track.status === 'have') return 'full'
  if (track.status === 'downloading') return [8, 12, 16, 24, 32][Math.min(4, Math.floor(track.progress * 5))]
  return 8
}

interface Props {
  url?: string
  resolution: number | 'full'
  muted?: boolean
  emptyClass?: string
}

export function PixelCover({ url, resolution, muted, emptyClass = 'dither-tile-light' }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
    if (!url || resolution === 'full') return
    let current = true
    loadImage(url).then(
      (image) => {
        const element = canvas.current
        if (!current || !element) return
        element.width = resolution
        element.height = resolution
        element.getContext('2d')?.drawImage(image, 0, 0, resolution, resolution)
      },
      () => current && setBroken(true)
    )
    return () => {
      current = false
    }
  }, [url, resolution])

  if (!url || broken) return <div className={`h-full w-full ${emptyClass}`} />
  if (resolution === 'full') return <img src={url} alt="" className="block h-full w-full object-cover" onError={() => setBroken(true)} />
  return <canvas ref={canvas} className={`pixel-img ${muted ? 'opacity-50 grayscale' : ''}`} />
}
