import type { ImportedPlaylist, Track } from '../../shared/types'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

// Spotify's public pages stop around here, so reaching it with no known total means there may be more.
const PUBLIC_PAGE_CAP = 99

export interface SpotifyLink {
  type: 'playlist' | 'album'
  id: string
}

interface ImageSource {
  url?: string
  width?: number
}

interface Parsed {
  name: string
  coverUrl?: string
  totalReported?: number
  tracks: Track[]
}

const LINK_HELP = 'Paste a Spotify playlist or album link from open.spotify.com.'

export function parseSpotifyLink(input: string): SpotifyLink {
  const text = input.trim()
  const match =
    text.match(/^spotify:(playlist|album):([A-Za-z0-9]{22})$/) ??
    text.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]{22})(?:[/?#].*)?$/i)
  if (!match) throw new Error(LINK_HELP)
  return { type: match[1].toLowerCase() as SpotifyLink['type'], id: match[2] }
}

const idFromUri = (uri: unknown) => String(uri ?? '').split(':').pop() ?? ''

function largestImage(sources: ImageSource[] | undefined): string | undefined {
  const sorted = [...(sources ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted[0]?.url
}

export function parsePageHtml(html: string, id: string): Parsed | null {
  const match = html.match(/<script[^>]+id=["']initialState["'][^>]*>([\s\S]*?)<\/script>/)
  if (!match) return null
  try {
    const state = JSON.parse(Buffer.from(match[1].trim(), 'base64').toString('utf8'))
    const entity = state?.entities?.items?.[`spotify:playlist:${id}`]
    if (!entity?.content) return null
    const tracks: Track[] = []
    for (const item of entity.content.items ?? []) {
      const data = item?.itemV2?.data
      if (data?.__typename !== 'Track' || !data.name) continue
      tracks.push({
        id: idFromUri(data.uri),
        title: data.name,
        artists: (data.artists?.items ?? []).map((a: any) => a?.profile?.name).filter(Boolean),
        album: data.albumOfTrack?.name,
        coverUrl: largestImage(data.albumOfTrack?.coverArt?.sources),
        durationMs: data.duration?.totalMilliseconds,
        trackNumber: data.trackNumber,
        discNumber: data.discNumber
      })
    }
    return {
      name: entity.name,
      coverUrl: largestImage(entity.images?.items?.[0]?.sources),
      totalReported: entity.content.totalCount,
      tracks
    }
  } catch {
    return null
  }
}

export function parseEmbedHtml(html: string): Parsed {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  const entity = match ? JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity : undefined
  if (!entity) throw new Error('Spotify did not return this playlist. Check that it is public.')
  const isAlbum = entity.type === 'album'
  const name: string = entity.name ?? entity.title ?? 'Spotify playlist'
  const coverUrl = largestImage(entity.coverArt?.sources)
  const tracks: Track[] = (entity.trackList ?? []).map((item: any, index: number) => ({
    id: idFromUri(item.uri),
    title: item.title,
    artists: String(item.subtitle ?? '')
      .split(',')
      .map((artist) => artist.replace(/ /g, ' ').trim())
      .filter(Boolean),
    durationMs: item.duration || undefined,
    ...(isAlbum ? { album: name, coverUrl, trackNumber: index + 1 } : {})
  }))
  return { name, coverUrl, tracks }
}

export function mergeSpotify(page: Parsed | null, embed: Parsed): ImportedPlaylist {
  const seen = new Set((page?.tracks ?? []).map((track) => track.id))
  const tracks = [...(page?.tracks ?? []), ...embed.tracks.filter((track) => !seen.has(track.id))]
  const total = page?.totalReported
  return {
    name: page?.name ?? embed.name,
    coverUrl: embed.coverUrl ?? page?.coverUrl,
    totalReported: total,
    warning:
      total && tracks.length < total
        ? `BitCrate could only read ${tracks.length} of ${total} tracks. To get them all, export the playlist to a CSV with exportify.net and open that file here.`
        : undefined,
    tracks
  }
}

export async function fetchSpotify(input: string, fetcher: Fetcher = fetch): Promise<ImportedPlaylist> {
  const link = parseSpotifyLink(input)
  const get = (url: string) =>
    fetcher(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(20000)
    })
  const url = `https://open.spotify.com/${link.type}/${link.id}`
  const [embedResponse, pageResponse] = await Promise.all([
    get(`https://open.spotify.com/embed/${link.type}/${link.id}`),
    link.type === 'playlist' ? get(url).catch(() => null) : Promise.resolve(null)
  ])
  if (!embedResponse.ok) throw new Error('Spotify could not find this link. Check that the playlist is public.')
  const embed = parseEmbedHtml(await embedResponse.text())
  const page = pageResponse?.ok ? parsePageHtml(await pageResponse.text(), link.id) : null
  const merged = mergeSpotify(page, embed)
  if (!merged.tracks.length) throw new Error('This playlist has no playable tracks.')
  const { tracks, totalReported: total } = merged
  const partial = total ? tracks.length < total : tracks.length >= PUBLIC_PAGE_CAP
  if (!partial) return { ...merged, link: url }
  const shown = total ? `${tracks.length} of ${total}` : `the first ${tracks.length}`
  return {
    ...merged,
    connectHelps: true,
    warning: `Spotify only shows ${shown} tracks without an account. Connect Spotify to get them all, or open a CSV from exportify.net.`,
    link: url
  }
}
