import type { Track } from '../../shared/types'
import { artistMatches, titleSimilarity } from './match'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

interface DeezerHit {
  id: number
  title: string
  duration?: number
  artist?: { name?: string }
  album?: { title?: string; cover_xl?: string }
}

export function pickDeezerMatch(track: Track, hits: DeezerHit[]): DeezerHit | undefined {
  return hits.find((hit) => {
    const name = hit.artist?.name ?? ''
    const sameArtist = artistMatches(track.artists, name) || artistMatches([name], track.artists.join(' '))
    const sameLength = !track.durationMs || !hit.duration || Math.abs(track.durationMs / 1000 - hit.duration) <= 3
    return sameArtist && sameLength && titleSimilarity(track.title, hit.title, track.artists) >= 0.8
  })
}

// Deezer's public API needs no account. Any failure just means fewer tags, so it never throws.
export async function lookupDeezer(track: Track, fetcher: Fetcher = fetch): Promise<Partial<Track>> {
  try {
    const query = encodeURIComponent(`${track.artists[0] ?? ''} ${track.title}`)
    const search = await (await fetcher(`https://api.deezer.com/search?q=${query}&limit=10`, { signal: AbortSignal.timeout(10000) })).json()
    const hit = pickDeezerMatch(track, search?.data ?? [])
    if (!hit) return {}
    const detail = await (await fetcher(`https://api.deezer.com/track/${hit.id}`, { signal: AbortSignal.timeout(10000) })).json()
    return {
      album: hit.album?.title,
      coverUrl: hit.album?.cover_xl,
      durationMs: hit.duration ? hit.duration * 1000 : undefined,
      isrc: detail.isrc,
      year: detail.release_date?.slice(0, 4),
      trackNumber: detail.track_position,
      discNumber: detail.disk_number,
      bpm: detail.bpm > 0 ? Math.round(detail.bpm) : undefined
    }
  } catch {
    return {}
  }
}

export function fillMissing(track: Track, extra: Partial<Track>): Partial<Track> {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(extra)) {
    const current = (track as unknown as Record<string, unknown>)[key]
    if (value !== undefined && (current === undefined || current === '')) patch[key] = value
  }
  return patch as Partial<Track>
}
