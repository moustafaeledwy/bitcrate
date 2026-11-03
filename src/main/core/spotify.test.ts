import { describe, expect, test } from 'vitest'
import embedFixture from './__fixtures__/spotify-embed.json'
import pageFixture from './__fixtures__/spotify-page.json'
import { fetchSpotify, mergeSpotify, parseEmbedHtml, parsePageHtml, parseSpotifyLink } from './spotify'

const embedHtml = (data: unknown) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`
const pageHtml = (data: unknown) =>
  `<html><script id="initialState" type="text/plain">${Buffer.from(JSON.stringify(data)).toString('base64')}</script></html>`

describe('parseSpotifyLink', () => {
  test('reads a playlist link with tracking junk', () => {
    expect(parseSpotifyLink('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7?si=abc')).toEqual({
      type: 'playlist',
      id: '6L51w3Z99N0IfzVaT9Kys7'
    })
  })
  test('reads a localized album link', () => {
    expect(parseSpotifyLink('https://open.spotify.com/intl-de/album/5TmEBZ2iB4ugNe37SRvPLY').type).toBe('album')
  })
  test('reads a spotify uri', () => {
    expect(parseSpotifyLink('spotify:playlist:6L51w3Z99N0IfzVaT9Kys7').id).toBe('6L51w3Z99N0IfzVaT9Kys7')
  })
  test('rejects anything else with a helpful message', () => {
    expect(() => parseSpotifyLink('https://example.com/playlist/x')).toThrow(/playlist or album link/)
  })
})

describe('parsePageHtml', () => {
  const page = parsePageHtml(pageHtml(pageFixture), '6L51w3Z99N0IfzVaT9Kys7')!
  test('reads full metadata for each track', () => {
    expect(page.name).toBe('Re-Onion')
    expect(page.totalReported).toBe(22)
    expect(page.tracks[0]).toMatchObject({
      id: '0Ws8BjDXw0wuzdghWrpxcj',
      title: 'Beat Trippin’',
      artists: ['Gorge'],
      album: 'Move EP',
      durationMs: 369744,
      trackNumber: 2,
      discNumber: 1
    })
  })
  test('picks the largest album cover', () => {
    expect(page.tracks[0].coverUrl).toContain('ab67616d0000b273')
  })
  test('returns null when the page has no embedded state', () => {
    expect(parsePageHtml('<html></html>', 'x')).toBeNull()
  })
})

describe('parseEmbedHtml', () => {
  test('reads title, artists and duration', () => {
    const embed = parseEmbedHtml(embedHtml(embedFixture))
    expect(embed.name).toBe('Re-Onion')
    expect(embed.tracks[0].id).toMatch(/^[A-Za-z0-9]{22}$/)
    expect(embed.tracks[0].durationMs).toBeGreaterThan(0)
    expect(embed.tracks[0].artists.length).toBeGreaterThan(0)
  })
  test('uses the album name and cover for every track of an album', () => {
    const data = structuredClone(embedFixture) as any
    data.props.pageProps.state.data.entity.type = 'album'
    data.props.pageProps.state.data.entity.name = 'Move EP'
    data.props.pageProps.state.data.entity.coverArt = { sources: [{ url: 'https://i.scdn.co/a', width: 640 }] }
    const tracks = parseEmbedHtml(embedHtml(data)).tracks
    expect(tracks[0].album).toBe('Move EP')
    expect(tracks[0].coverUrl).toBe('https://i.scdn.co/a')
    expect(tracks[1].trackNumber).toBe(2)
  })
  test('splits multiple artists', () => {
    const data = structuredClone(embedFixture) as any
    data.props.pageProps.state.data.entity.trackList[0].subtitle = 'Mr. Ho, Mogwaa'
    expect(parseEmbedHtml(embedHtml(data)).tracks[0].artists).toEqual(['Mr. Ho', 'Mogwaa'])
  })
})

describe('mergeSpotify', () => {
  const a = { id: 'a', title: 'A', artists: ['x'], album: 'Rich', durationMs: 1 }
  const b = { id: 'b', title: 'B', artists: ['y'], durationMs: 2 }
  const c = { id: 'c', title: 'C', artists: ['z'], durationMs: 3 }
  test('keeps rich tracks and appends the ones only the embed has', () => {
    const merged = mergeSpotify({ name: 'P', totalReported: 3, tracks: [a] }, { name: 'P', tracks: [{ ...a, album: undefined }, b, c] })
    expect(merged.tracks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(merged.tracks[0].album).toBe('Rich')
    expect(merged.warning).toBeUndefined()
  })
  test('warns when Spotify reports more tracks than we could read', () => {
    const merged = mergeSpotify({ name: 'P', totalReported: 152, tracks: [a] }, { name: 'P', tracks: [a, b] })
    expect(merged.warning).toMatch(/2 of 152/)
    expect(merged.warning).toMatch(/CSV/)
  })
})

describe('fetchSpotify', () => {
  test('explains a private or missing playlist', async () => {
    const fetcher = async () => new Response('nope', { status: 404 })
    await expect(fetchSpotify('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7', fetcher)).rejects.toThrow(/public/)
  })
  test('still works when only the embed responds', async () => {
    const fetcher = async (url: string | URL | Request) =>
      String(url).includes('/embed/') ? new Response(embedHtml(embedFixture)) : new Response('<html></html>')
    const result = await fetchSpotify('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7', fetcher)
    expect(result.tracks.length).toBe(3)
    expect(result.link).toContain('6L51w3Z99N0IfzVaT9Kys7')
  })
})

describe('when Spotify shows only part of a playlist', () => {
  const big = structuredClone(pageFixture) as any
  big.entities.items['spotify:playlist:6L51w3Z99N0IfzVaT9Kys7'].content.totalCount = 153
  const fetcher = async (url: string | URL | Request) =>
    String(url).includes('/embed/') ? new Response(embedHtml(embedFixture)) : new Response(pageHtml(big))

  test('says connecting will get the rest', async () => {
    const result = await fetchSpotify('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7', fetcher)
    expect(result.connectHelps).toBe(true)
    expect(result.warning).toMatch(/3 of 153/)
    expect(result.warning).toMatch(/Connect/)
    expect(result.warning).toMatch(/CSV/)
  })
  test('says nothing when it has them all', async () => {
    const whole = structuredClone(pageFixture) as any
    whole.entities.items['spotify:playlist:6L51w3Z99N0IfzVaT9Kys7'].content.totalCount = 3
    const complete = async (url: string | URL | Request) =>
      String(url).includes('/embed/') ? new Response(embedHtml(embedFixture)) : new Response(pageHtml(whole))
    const result = await fetchSpotify('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7', complete)
    expect(result.connectHelps).toBeFalsy()
    expect(result.warning).toBeUndefined()
  })
  test('warns at the cap even when the total is unknown', async () => {
    const data = structuredClone(embedFixture) as any
    const row = data.props.pageProps.state.data.entity.trackList[0]
    data.props.pageProps.state.data.entity.trackList = Array.from({ length: 100 }, (_, i) => ({
      ...row,
      uri: `spotify:track:${String(i).padStart(22, '0')}`
    }))
    const capped = async (url: string | URL | Request) =>
      String(url).includes('/embed/') ? new Response(embedHtml(data)) : new Response('<html></html>')
    const result = await fetchSpotify('https://open.spotify.com/playlist/6L51w3Z99N0IfzVaT9Kys7', capped)
    expect(result.connectHelps).toBe(true)
    expect(result.warning).toMatch(/first 100/)
  })
})
