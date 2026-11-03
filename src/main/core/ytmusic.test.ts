import { describe, expect, test } from 'vitest'
import fixture from './__fixtures__/ytmusic-search.json'
import { parseSearchResponse, parseYtSearchJson, searchQuery, upscaleThumbnail } from './ytmusic'

describe('parseSearchResponse', () => {
  const results = parseSearchResponse(fixture, 'song')
  test('reads the real response', () => {
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toMatchObject({
      videoId: 'kPS8Av2lhSY',
      title: 'Hide & Seek',
      artists: ['Nathan Coles'],
      album: 'Hide & Seek',
      durationS: 459,
      kind: 'song'
    })
  })
  test('asks for a large cover', () => {
    expect(results[0].thumbnail).toContain('w1200-h1200')
  })
  test('returns nothing for an empty response', () => {
    expect(parseSearchResponse({}, 'song')).toEqual([])
  })
})

describe('upscaleThumbnail', () => {
  test('leaves other image hosts alone', () => {
    expect(upscaleThumbnail('https://i.ytimg.com/vi/x/hq720.jpg')).toBe('https://i.ytimg.com/vi/x/hq720.jpg')
  })
})

describe('searchQuery', () => {
  test('uses the first artists and the title', () => {
    expect(searchQuery({ id: '1', title: 'Father', artists: ['Luciano', 'Thomas Melchior'] })).toBe('Luciano Thomas Melchior Father')
  })
})

describe('parseYtSearchJson', () => {
  test('reads the yt-dlp fallback output', () => {
    const json = JSON.stringify({ entries: [{ id: 'abcdefghijk', title: 'Song', channel: 'Band - Topic', duration: 200 }] })
    expect(parseYtSearchJson(json)).toEqual([
      { videoId: 'abcdefghijk', title: 'Song', artists: ['Band'], durationS: 200, kind: 'video', score: 0 }
    ])
  })
})
