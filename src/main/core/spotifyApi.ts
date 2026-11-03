import type { AccountPlaylist, ImportedPlaylist, Track } from '../../shared/types'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
type GetToken = () => Promise<string>
type Wait = (ms: number) => Promise<void>

const API = 'https://api.spotify.com/v1'
const MAX_TRIES = 4
const sleep: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class SpotifyForbidden extends Error {}

interface ImageObject {
  url?: string
  width?: number | null
}

function largestImage(images: ImageObject[] | null | undefined): string | undefined {
  return [...(images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
}

async function apiGet(url: string, getToken: GetToken, fetcher: Fetcher, wait: Wait): Promise<any> {
  // Paging links come from the response, so check them before attaching the sign-in token.
  if (!url.startsWith(`${API}/`)) throw new Error('Spotify returned an unexpected link.')
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${await getToken()}` },
      signal: AbortSignal.timeout(20000)
    })
    if (response.ok) return response.json()
    if (response.status === 401) throw new Error('Your Spotify connection has expired. Connect Spotify again.')
    if (response.status === 403) throw new SpotifyForbidden('Spotify does not allow reading this playlist.')
    if (response.status !== 429) throw new Error(`Spotify returned an error (${response.status}).`)
    if (attempt < MAX_TRIES) await wait(Number(response.headers.get('Retry-After') ?? 1) * 1000)
  }
  throw new Error('Spotify is limiting requests from your app. Wait a little and try again.')
}

async function allPages(firstUrl: string, getToken: GetToken, fetcher: Fetcher, wait: Wait): Promise<any[]> {
  const items: any[] = []
  let url: string | null = firstUrl
  while (url) {
    const page: any = await apiGet(url, getToken, fetcher, wait)
    items.push(...(page.items ?? []))
    url = page.next ?? null
  }
  return items
}

function toTrack(entry: any): Track | null {
  // Spotify renamed "track" to "item" in 2026, so accept either.
  const item = entry?.item ?? entry?.track
  if (!item || item.type !== 'track' || !item.id || entry?.is_local || item.is_local) return null
  return {
    id: item.id,
    title: item.name,
    artists: (item.artists ?? []).map((artist: any) => artist?.name).filter(Boolean),
    album: item.album?.name || undefined,
    coverUrl: largestImage(item.album?.images),
    durationMs: item.duration_ms || undefined,
    trackNumber: item.track_number || undefined,
    discNumber: item.disc_number || undefined,
    isrc: item.external_ids?.isrc || undefined,
    year: item.album?.release_date?.slice(0, 4) || undefined
  }
}

export async function fetchPlaylist(id: string, getToken: GetToken, fetcher: Fetcher = fetch, wait: Wait = sleep): Promise<ImportedPlaylist> {
  if (!/^[A-Za-z0-9]+$/.test(id)) throw new Error('That is not a valid playlist id.')
  const meta = await apiGet(`${API}/playlists/${id}`, getToken, fetcher, wait)
  const entries = await allPages(`${API}/playlists/${id}/items?limit=50`, getToken, fetcher, wait)
  return {
    name: meta.name,
    coverUrl: largestImage(meta.images),
    link: meta.external_urls?.spotify ?? `https://open.spotify.com/playlist/${id}`,
    tracks: entries.map(toTrack).filter((track): track is Track => track !== null)
  }
}

export async function fetchMyPlaylists(getToken: GetToken, fetcher: Fetcher = fetch, wait: Wait = sleep): Promise<AccountPlaylist[]> {
  const me = await apiGet(`${API}/me`, getToken, fetcher, wait)
  const playlists = await allPages(`${API}/me/playlists?limit=50`, getToken, fetcher, wait)
  return playlists
    .filter((playlist) => playlist?.id)
    .map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      coverUrl: largestImage(playlist.images),
      count: playlist.items?.total ?? playlist.tracks?.total,
      owner: playlist.owner?.display_name ?? playlist.owner?.id ?? '',
      // Spotify only returns full track lists to a playlist's owner and collaborators.
      fullList: playlist.owner?.id === me.id || playlist.collaborative === true
    }))
}
