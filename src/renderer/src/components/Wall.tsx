import type { TrackState } from '../../../shared/types'
import { PixelCover, resolutionFor } from './PixelCover'

// The whole crate at a glance: one tile per track, sharpening as each one saves.
export function Wall({ tracks, onPick }: { tracks: TrackState[]; onPick: (id: string) => void }) {
  const tile = tracks.length <= 30 ? 52 : tracks.length <= 100 ? 40 : tracks.length <= 300 ? 30 : 22
  return (
    <div
      data-testid="wall"
      className="grid max-h-40 min-w-0 flex-1 content-start gap-[2px] overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${tile}px)`, gridAutoRows: `${tile}px` }}
    >
      {tracks.map((track) => (
        <button
          key={track.id}
          type="button"
          tabIndex={-1}
          title={`${track.title} by ${track.artists.join(', ')}`}
          onClick={() => onPick(track.id)}
          className="no-drag block cursor-pointer overflow-hidden hover:outline-2 hover:outline-yellow"
        >
          <PixelCover
            url={track.status === 'searching' ? undefined : track.coverUrl}
            resolution={resolutionFor(track)}
            muted={track.status === 'missing' || track.status === 'failed'}
            emptyClass="dither-tile blink"
          />
        </button>
      ))}
    </div>
  )
}
