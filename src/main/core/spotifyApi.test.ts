import { describe, expect, test } from 'vitest'
import { fetchMyPlaylists, fetchPlaylist, SpotifyForbidden } from './spotifyApi'

const token = async () => 'TOKEN'
const noWait = async () => {}

type Routes = Record<string, unknown | (() => Response)>
function routes(table: Routes) {
  const calls: string[] = []
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const text = String(url)
    calls.push(text)
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer TOKEN')
    const route = table[text.replace('https://api.spotify.com/v1', '')]
    if (route === undefined) return new Response('not found', { status: 404 })
    return typeof route === 'function' ? (route as () => Response)() : Response.json(route)
  }
  return { fetcher, calls }
}

const track = (id: string, over = {}) => ({
  added_at: '2026-01-01',
  is_local: false,
  item: {
    id,
    type: 'track',
    name: `Song ${id}`,
    artists: [{ name: 'Gorge' }, { name: 'Other' }],
    album: {
      name: 'Move EP',
      release_date: '2019-04',
      images: [
        { url: 'https://i/small', width: 64, height: 64 },
        { url: 'https://i/large', width: 640, height: 640 }
      ]
    },
    duration_ms: 369744,
    track_number: 2,
    disc_number: 1,
    external_ids: { isrc: 'DE123' },
    ...over
  }
})

describe('fetchPlaylist', () => {
  const meta = { name: 'Discovery', images: [{ url: 'https://i/pl', width: 300 }], external_urls: { spotify: 'https://open.spotify.com/playlist/P' } }

  test('reads every page of a long playlist', async () => {
    const { fetcher, calls } = routes({
      '/playlists/P': meta,
      '/playlists/P/items?limit=50': { items: [track('a')], next: 'https://api.spotify.com/v1/playlists/P/items?offset=50&limit=50', total: 2 },
      '/playlists/P/items?offset=50&limit=50': { items: [track('b')], next: null, total: 2 }
    })
    const playlist = await fetchPlaylist('P', token, fetcher, noWait)
    expect(playlist.tracks.map((t) => t.id)).toEqual(['a', 'b'])
    expect(playlist.name).toBe('Discovery')
    expect(playlist.warning).toBeUndefined()
    expect(calls).toHaveLength(3)
  })
  test('maps all the metadata', async () => {
    const { fetcher } = routes({ '/playlists/P': meta, '/playlists/P/items?limit=50': { items: [track('a')], next: null } })
    expect((await fetchPlaylist('P', token, fetcher, noWait)).tracks[0]).toEqual({
      id: 'a',
      title: 'Song a',
      artists: ['Gorge', 'Other'],
      album: 'Move EP',
      coverUrl: 'https://i/large',
      durationMs: 369744,
      trackNumber: 2,
      discNumber: 1,
      isrc: 'DE123',
      year: '2019'
    })
  })
  test('skips removed tracks, podcast episodes and local files', async () => {
    const { fetcher } = routes({
      '/playlists/P': meta,
      '/playlists/P/items?limit=50': {
        items: [{ item: null }, track('ep', { type: 'episode' }), { ...track('local'), is_local: true }, track('ok')],
        next: null
      }
    })
    expect((await fetchPlaylist('P', token, fetcher, noWait)).tracks.map((t) => t.id)).toEqual(['ok'])
  })
  test('still understands the older track field', async () => {
    const { fetcher } = routes({ '/playlists/P': meta, '/playlists/P/items?limit=50': { items: [{ track: track('old').item }], next: null } })
    expect((await fetchPlaylist('P', token, fetcher, noWait)).tracks[0].id).toBe('old')
  })
  test('a playlist you neither own nor collaborate on is reported as forbidden', async () => {
    const { fetcher } = routes({ '/playlists/P': meta, '/playlists/P/items?limit=50': () => new Response('{}', { status: 403 }) })
    await expect(fetchPlaylist('P', token, fetcher, noWait)).rejects.toBeInstanceOf(SpotifyForbidden)
  })
  test('waits when Spotify asks it to slow down, then carries on', async () => {
    let tries = 0
    const waits: number[] = []
    const { fetcher } = routes({
      '/playlists/P': meta,
      '/playlists/P/items?limit=50': () =>
        ++tries === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : Response.json({ items: [track('a')], next: null })
    })
    const playlist = await fetchPlaylist('P', token, fetcher, async (ms) => {
      waits.push(ms)
    })
    expect(waits).toEqual([2000])
    expect(playlist.tracks).toHaveLength(1)
  })
  test('gives up after repeated slow-downs', async () => {
    const { fetcher } = routes({ '/playlists/P': () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }) })
    await expect(fetchPlaylist('P', token, fetcher, noWait)).rejects.toThrow(/limiting/i)
  })
  test('never sends the sign-in token to another site', async () => {
    const { fetcher, calls } = routes({
      '/playlists/P': meta,
      '/playlists/P/items?limit=50': { items: [track('a')], next: 'https://evil.example/steal' }
    })
    await expect(fetchPlaylist('P', token, fetcher, noWait)).rejects.toThrow(/unexpected/i)
    expect(calls.some((url) => url.includes('evil'))).toBe(false)
  })
  test('refuses an id that is not a Spotify id', async () => {
    const { fetcher } = routes({})
    await expect(fetchPlaylist('../me', token, fetcher, noWait)).rejects.toThrow(/playlist id/i)
  })
})

describe('fetchMyPlaylists', () => {
  const me = { id: 'moustafa' }
  const mine = { id: 'A', name: 'Discovery', images: [{ url: 'https://i/a', width: 300 }], owner: { id: 'moustafa', display_name: 'M' }, collaborative: false, items: { total: 154 } }
  const followed = { id: 'B', name: 'Their mix', images: [], owner: { id: 'someone', display_name: 'Someone' }, collaborative: false, items: { total: 40 } }
  const shared = { id: 'C', name: 'Shared', images: null, owner: { id: 'x', display_name: 'X' }, collaborative: true }

  test('lists every page and marks which ones can be read in full', async () => {
    const { fetcher } = routes({
      '/me': me,
      '/me/playlists?limit=50': { items: [mine], next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50' },
      '/me/playlists?offset=50&limit=50': { items: [followed, shared], next: null }
    })
    expect(await fetchMyPlaylists(token, fetcher, noWait)).toEqual([
      { id: 'A', name: 'Discovery', coverUrl: 'https://i/a', count: 154, owner: 'M', fullList: true },
      { id: 'B', name: 'Their mix', coverUrl: undefined, count: 40, owner: 'Someone', fullList: false },
      { id: 'C', name: 'Shared', coverUrl: undefined, count: undefined, owner: 'X', fullList: true }
    ])
  })
  test('reads the older count field too', async () => {
    const { fetcher } = routes({ '/me': me, '/me/playlists?limit=50': { items: [{ ...mine, items: undefined, tracks: { total: 7 } }], next: null } })
    expect((await fetchMyPlaylists(token, fetcher, noWait))[0].count).toBe(7)
  })
  test('skips empty slots in the list', async () => {
    const { fetcher } = routes({ '/me': me, '/me/playlists?limit=50': { items: [null, mine], next: null } })
    expect(await fetchMyPlaylists(token, fetcher, noWait)).toHaveLength(1)
  })
  test('explains an expired sign-in', async () => {
    const { fetcher } = routes({ '/me': () => new Response('{}', { status: 401 }) })
    await expect(fetchMyPlaylists(token, fetcher, noWait)).rejects.toThrow(/connect/i)
  })
})
