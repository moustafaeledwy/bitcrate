import type { Candidate, Track } from '../../shared/types'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
type Kind = Candidate['kind']

const SEARCH_URL = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false'
const FILTERS: Record<Kind, string> = {
  song: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==',
  video: 'EgWKAQIQAWoKEAkQBRAKEAMQBA=='
}

export function searchQuery(track: Track): string {
  return [...track.artists.slice(0, 2), track.title].join(' ')
}

export function upscaleThumbnail(url: string): string {
  return url.replace(/=w\d+-h\d+[^/]*$/, '=w1200-h1200-l90-rj')
}

function findShelves(node: unknown, found: any[] = []): any[] {
  if (Array.isArray(node)) node.forEach((item) => findShelves(item, found))
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'musicShelfRenderer') found.push(value)
      else findShelves(value, found)
    }
  }
  return found
}

const toSeconds = (text: string) => text.split(':').reduce((total, part) => total * 60 + Number(part), 0)
const pageType = (run: any): string | undefined =>
  run?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType

function parseItem(item: any, kind: Kind): Candidate | null {
  const renderer = item?.musicResponsiveListItemRenderer
  const columns = renderer?.flexColumns ?? []
  const titleRun = columns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
  const videoId = titleRun?.navigationEndpoint?.watchEndpoint?.videoId ?? renderer?.playlistItemData?.videoId
  if (!videoId || !titleRun?.text) return null

  const runs: any[] = columns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []
  const artistRuns = runs.filter((run) => /ARTIST|USER_CHANNEL/.test(pageType(run) ?? ''))
  const artists = artistRuns.length ? artistRuns.map((run) => run.text) : runs.slice(0, 1).map((run) => run.text)
  const album = runs.find((run) => pageType(run) === 'MUSIC_PAGE_TYPE_ALBUM')?.text
  const length = runs.map((run) => run.text as string).find((text) => /^\d{1,2}(:\d{2}){1,2}$/.test(text))
  const thumbs = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? []
  const thumbnail = thumbs[thumbs.length - 1]?.url

  return {
    videoId,
    title: titleRun.text,
    artists,
    album,
    durationS: length ? toSeconds(length) : undefined,
    thumbnail: thumbnail ? upscaleThumbnail(thumbnail) : undefined,
    kind,
    score: 0
  }
}

export function parseSearchResponse(response: unknown, kind: Kind): Candidate[] {
  const results: Candidate[] = []
  for (const shelf of findShelves(response)) {
    for (const item of shelf?.contents ?? []) {
      const candidate = parseItem(item, kind)
      if (candidate) results.push(candidate)
    }
  }
  return results
}

export async function searchYtMusic(query: string, kind: Kind, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<Candidate[]> {
  const response = await fetcher(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://music.youtube.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'
    },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20260101.01.00' } },
      query,
      params: FILTERS[kind]
    }),
    signal
  })
  if (!response.ok) throw new Error(`YouTube Music search failed (${response.status})`)
  return parseSearchResponse(await response.json(), kind)
}

// Reads the output of: yt-dlp --flat-playlist -J "ytsearch5:query"
export function parseYtSearchJson(json: string): Candidate[] {
  const entries: any[] = JSON.parse(json)?.entries ?? []
  return entries
    .filter((entry) => entry?.id && entry?.title)
    .map((entry) => ({
      videoId: entry.id,
      title: entry.title,
      artists: [String(entry.channel ?? entry.uploader ?? '').replace(/ - Topic$/, '')].filter(Boolean),
      durationS: entry.duration ?? undefined,
      kind: 'video' as const,
      score: 0
    }))
}
