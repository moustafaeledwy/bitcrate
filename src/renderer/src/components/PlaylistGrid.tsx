import type { AccountPlaylist } from '../../../shared/types'
import { PixelCover } from './PixelCover'

interface Props {
  playlists: AccountPlaylist[]
  loading: boolean
  disabled?: boolean
  onPick: (playlist: AccountPlaylist) => void
}

const countLabel = (playlist: AccountPlaylist) => {
  if (playlist.count === undefined) return playlist.owner
  const tracks = `${playlist.count} ${playlist.count === 1 ? 'track' : 'tracks'}`
  return playlist.fullList || playlist.count <= 100 ? tracks : `First 100 of ${playlist.count} tracks`
}

export function PlaylistGrid({ playlists, loading, disabled, onPick }: Props) {
  if (loading && !playlists.length) return <p className="blink mt-3 font-pixel text-lg">Opening your crates</p>
  if (!playlists.length) return <p className="mt-3">Your Spotify account has no playlists yet.</p>
  return (
    <div data-testid="playlist-grid" className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
      {playlists.map((playlist) => (
        <button
          key={playlist.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(playlist)}
          className="btn !block min-w-0 !p-2 text-left !whitespace-normal"
        >
          <span className="block aspect-square w-full border-2 border-navy">
            <PixelCover url={playlist.coverUrl} resolution="full" />
          </span>
          <span className="mt-2 block truncate font-bold">{playlist.name}</span>
          <span className="block truncate text-sm font-normal text-muted-foreground">{countLabel(playlist)}</span>
        </button>
      ))}
    </div>
  )
}
