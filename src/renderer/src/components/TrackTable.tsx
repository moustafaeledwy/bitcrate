import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import type { TrackState, TrackStatus } from '../../../shared/types'
import { formatLength } from '../lib/store'
import { PixelCover, resolutionFor } from './PixelCover'

const COLUMNS = 'grid-cols-[52px_minmax(0,2.4fr)_minmax(0,1.5fr)_56px_minmax(0,1.2fr)_124px]'

const STATUS: Record<TrackStatus, { label: string; className: string }> = {
  searching: { label: 'Searching', className: 'bg-white blink' },
  found: { label: 'Found', className: 'bg-lime' },
  review: { label: 'Check match', className: 'bg-yellow' },
  missing: { label: 'Not found', className: 'bg-pink' },
  queued: { label: 'Queued', className: 'bg-white' },
  downloading: { label: 'Downloading', className: 'bg-hyper text-white' },
  saved: { label: 'Saved', className: 'bg-navy text-lime' },
  have: { label: 'Already have', className: 'bg-cream' },
  failed: { label: 'Failed', className: 'bg-red text-white' }
}

// Saved tracks stay flagged when the match was uncertain, because a wrong version matters in a set.
export function isWeakMatch(track: TrackState): boolean {
  const chosen = track.candidates.find((candidate) => candidate.videoId === track.chosenVideoId)
  return !!chosen && chosen.score < 80
}

export function StatusChip({ status }: { status: TrackStatus }) {
  const { label, className } = STATUS[status]
  return <span className={`inline-block border-2 border-navy px-2 py-0.5 font-pixel text-sm whitespace-nowrap ${className}`}>{label}</span>
}

function Source({ track }: { track: TrackState }) {
  const chosen = track.candidates.find((candidate) => candidate.videoId === track.chosenVideoId)
  if (track.status === 'searching') return null
  if (track.status === 'have') return <span className="text-muted-foreground">Your folder</span>
  if (!chosen) {
    return track.candidates.length ? (
      <span className="text-muted-foreground">{track.candidates.length} weak results</span>
    ) : (
      <span className="text-muted-foreground">No results</span>
    )
  }
  return (
    <>
      <span className="block truncate">{chosen.kind === 'song' ? 'YouTube Music song' : 'YouTube video'}</span>
      <span className={`block w-fit truncate text-sm ${isWeakMatch(track) ? 'bg-yellow px-1 font-bold' : 'text-muted-foreground'}`}>{chosen.score}% match</span>
    </>
  )
}

interface Props {
  tracks: TrackState[]
  focusId: string | null
  onOpen: (id: string) => void
}

export function TrackTable({ tracks, focusId, onOpen }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 60,
    overscan: 8
  })

  useEffect(() => {
    if (!focusId) return
    const index = tracks.findIndex((track) => track.id === focusId)
    if (index >= 0) virtual.scrollToIndex(index, { align: 'center' })
    // Only scroll when a new track is picked, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`grid ${COLUMNS} items-center gap-3 border-y-2 border-navy py-1.5 pr-[36px] pl-6 text-sm font-bold`}>
        <span />
        <span>Track</span>
        <span>Album</span>
        <span>Length</span>
        <span>Comes from</span>
        <span>Status</span>
      </div>
      <div ref={scroller} className="pixel-scroll min-h-0 flex-1 overflow-y-auto" data-testid="track-table">
        <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map((row) => {
            const track = tracks[row.index]
            return (
              <button
                key={track.id}
                type="button"
                data-testid="track-row"
                data-status={track.status}
                onClick={() => onOpen(track.id)}
                className={`absolute top-0 left-0 grid h-[60px] w-full cursor-pointer ${COLUMNS} items-center gap-3 border-b border-navy/20 px-6 text-left hover:bg-white focus-visible:-outline-offset-2`}
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <span className="block h-[46px] w-[46px] border-2 border-navy">
                  <PixelCover url={track.coverUrl} resolution={resolutionFor(track)} muted={track.status === 'missing' || track.status === 'failed'} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{track.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{track.artists.join(', ')}</span>
                </span>
                <span className="truncate text-sm">{track.album}</span>
                <span className="text-sm tabular-nums">{formatLength(track.durationMs)}</span>
                <span className="min-w-0 text-sm">
                  <Source track={track} />
                </span>
                <span className="min-w-0">
                  {track.status === 'downloading' ? (
                    <span className="chunks block text-navy" style={{ '--chunk': 'var(--hyper)' } as React.CSSProperties}>
                      <span style={{ width: `${Math.round(track.progress * 100)}%` }} />
                    </span>
                  ) : (
                    <StatusChip status={track.status} />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
