import { describe, expect, test } from 'vitest'
import type { Candidate, DownloadOptions, ImportedPlaylist, Track } from '../../shared/types'
import { Engine, type EngineDeps } from './engine'

const options: DownloadOptions = { outDir: 'D:\\M', format: 'm4a', splitByFormat: false, concurrency: 2 }
const playlist = (n: number): ImportedPlaylist => ({
  name: 'P',
  tracks: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Song ${i}`, artists: ['A'], durationMs: 200000 }))
})
const good = (t: Track): Candidate => ({ videoId: 'abcdefghijk', title: t.title, artists: t.artists, durationS: 200, kind: 'song', score: 0 })
const wait = (ms = 3) => new Promise((r) => setTimeout(r, ms))

function deps(over: Partial<EngineDeps> = {}): EngineDeps {
  return {
    search: async (t) => [good(t)],
    enrich: async () => ({}),
    download: async (t) => [`${t.id}.m4a`],
    finish: async () => {},
    ...over
  }
}

const settle = async (e: Engine) => {
  await e.whenIdle()
}

describe('searching', () => {
  test('starts as soon as a playlist loads, many at once', async () => {
    let active = 0
    let peak = 0
    const e = new Engine(
      deps({
        search: async (t) => {
          active++
          peak = Math.max(peak, active)
          await wait()
          active--
          return [good(t)]
        }
      }),
      { searchConcurrency: 8, enrichConcurrency: 4 }
    )
    e.load(playlist(30))
    await settle(e)
    expect(peak).toBe(8)
    expect(e.snapshot().tracks.every((t) => t.status === 'found')).toBe(true)
  })
  test('records every candidate so you can see where a track comes from', async () => {
    const e = new Engine(deps())
    e.load(playlist(1))
    await settle(e)
    const t = e.snapshot().tracks[0]
    expect(t.chosenVideoId).toBe('abcdefghijk')
    expect(t.candidates[0].score).toBeGreaterThan(0)
  })
  test('marks a track missing when nothing is close', async () => {
    const e = new Engine(deps({ search: async () => [{ videoId: 'zzzzzzzzzzz', title: 'Nope', artists: ['B'], durationS: 30, kind: 'song', score: 0 }] }))
    e.load(playlist(1))
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('missing')
    expect(e.snapshot().tracks[0].chosenVideoId).toBeUndefined()
  })
  test('a failed search marks only that track', async () => {
    const e = new Engine(
      deps({
        search: async (t) => {
          if (t.id === 't0') throw new Error('no network')
          return [good(t)]
        }
      })
    )
    e.load(playlist(2))
    await settle(e)
    expect(e.snapshot().tracks[0]).toMatchObject({ status: 'failed', error: 'no network' })
    expect(e.snapshot().tracks[1].status).toBe('found')
  })
  test('adds looked-up metadata without replacing what the playlist gave us', async () => {
    const e = new Engine(deps({ enrich: async () => ({ isrc: 'X', title: 'Wrong' }) }))
    e.load(playlist(1))
    await settle(e)
    expect(e.snapshot().tracks[0]).toMatchObject({ isrc: 'X', title: 'Song 0' })
  })
  test('uses the matched song for album and cover when nothing else had them', async () => {
    const e = new Engine(deps({ search: async (t) => [{ ...good(t), album: 'YT album', thumbnail: 'https://t/x' }] }))
    e.load(playlist(1))
    await settle(e)
    expect(e.snapshot().tracks[0]).toMatchObject({ album: 'YT album', coverUrl: 'https://t/x' })
  })
})

describe('downloading', () => {
  test('never exceeds the chosen number of downloads', async () => {
    let active = 0
    let peak = 0
    const e = new Engine(
      deps({
        download: async (t) => {
          active++
          peak = Math.max(peak, active)
          await wait()
          active--
          return [t.id]
        }
      })
    )
    e.load(playlist(8))
    e.start({ ...options, concurrency: 3 })
    await settle(e)
    expect(peak).toBe(3)
    expect(e.snapshot().tracks.every((t) => t.status === 'saved')).toBe(true)
  })
  test('tracks found after pressing download start automatically', async () => {
    const order: string[] = []
    const e = new Engine(
      deps({
        search: async (t) => {
          await wait(t.id === 't1' ? 20 : 1)
          order.push(`found ${t.id}`)
          return [good(t)]
        },
        download: async (t) => {
          order.push(`download ${t.id}`)
          return [t.id]
        }
      })
    )
    e.load(playlist(2))
    e.start(options)
    await settle(e)
    expect(order.indexOf('download t0')).toBeLessThan(order.indexOf('found t1'))
    expect(order).toContain('download t1')
  })
  test('nothing downloads before you press download', async () => {
    let downloads = 0
    const e = new Engine(
      deps({
        download: async () => {
          downloads++
          return []
        }
      })
    )
    e.load(playlist(3))
    await settle(e)
    expect(downloads).toBe(0)
  })
  test('tags wait for that track’s metadata lookup', async () => {
    let seen: string | undefined
    const e = new Engine(
      deps({
        enrich: async () => {
          await wait(10)
          return { isrc: 'LATE' }
        },
        download: async (t) => {
          seen = t.isrc
          return []
        }
      })
    )
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(seen).toBe('LATE')
  })
  test('missing tracks are not downloaded', async () => {
    let downloads = 0
    const e = new Engine(
      deps({
        search: async () => [],
        download: async () => {
          downloads++
          return []
        }
      })
    )
    e.load(playlist(2))
    e.start(options)
    await settle(e)
    expect(downloads).toBe(0)
  })
  test('retries a failed download once, then reports it', async () => {
    let tries = 0
    const e = new Engine(
      deps({
        download: async () => {
          tries++
          throw new Error('broken')
        }
      })
    )
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(tries).toBe(2)
    expect(e.snapshot().tracks[0]).toMatchObject({ status: 'failed', error: 'broken' })
  })
  test('reports progress', async () => {
    const seen: number[] = []
    const e = new Engine(
      deps({
        download: async (_t, _c, _o, onProgress) => {
          onProgress(0.5)
          return []
        }
      })
    )
    e.on('patch', (_id, patch) => {
      if (patch.progress !== undefined) seen.push(patch.progress)
    })
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(seen).toContain(0.5)
  })
  test('cancel stops waiting downloads and returns them to found', async () => {
    let started = 0
    const e = new Engine(
      deps({
        download: async (_t, _c, _o, _p, signal) => {
          started++
          await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
          return []
        }
      })
    )
    e.load(playlist(5))
    e.start({ ...options, concurrency: 1 })
    await wait(20)
    e.cancel()
    await settle(e)
    expect(started).toBe(1)
    expect(e.snapshot().downloading).toBe(false)
    expect(e.snapshot().tracks.every((t) => t.status === 'found')).toBe(true)
  })
  test('finishes with a summary and writes the playlist file', async () => {
    let finished = false
    let summary: unknown
    const e = new Engine(
      deps({
        search: async (t) => (t.id === 't0' ? [] : [good(t)]),
        finish: async () => {
          finished = true
        }
      })
    )
    e.on('done', (s) => (summary = s))
    e.load(playlist(3))
    e.start(options)
    await settle(e)
    expect(finished).toBe(true)
    expect(summary).toMatchObject({ saved: 2, missing: 1, failed: 0 })
  })
  test('a new playlist replaces the old one and ignores its late results', async () => {
    const e = new Engine(
      deps({
        search: async (t) => {
          await wait(t.id === 't0' ? 15 : 0)
          return [good(t)]
        }
      })
    )
    e.load(playlist(1))
    e.load({ name: 'Second', tracks: [{ id: 'x', title: 'New', artists: ['A'], durationMs: 200000 }] })
    await settle(e)
    await wait(20)
    expect(e.snapshot().name).toBe('Second')
    expect(e.snapshot().tracks.map((t) => t.id)).toEqual(['x'])
  })
})

describe('choosing by hand', () => {
  test('choosing another result makes it the one downloaded', async () => {
    let got = ''
    const other: Candidate = { videoId: 'bbbbbbbbbbb', title: 'Song 0', artists: ['A'], durationS: 205, kind: 'video', score: 0 }
    const e = new Engine(
      deps({
        search: async (t) => [good(t), other],
        download: async (_t, c) => {
          got = c.videoId
          return []
        }
      })
    )
    e.load(playlist(1))
    await settle(e)
    e.choose('t0', 'bbbbbbbbbbb')
    expect(e.snapshot().tracks[0]).toMatchObject({ status: 'found', chosenVideoId: 'bbbbbbbbbbb' })
    e.start(options)
    await settle(e)
    expect(got).toBe('bbbbbbbbbbb')
  })
  test('a missing track can be rescued by choosing a result', async () => {
    const weak: Candidate = { videoId: 'ccccccccccc', title: 'Other', artists: ['Z'], durationS: 30, kind: 'song', score: 0 }
    const e = new Engine(deps({ search: async () => [weak] }))
    e.load(playlist(1))
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('missing')
    e.choose('t0', 'ccccccccccc')
    expect(e.snapshot().tracks[0].status).toBe('found')
  })
  test('retry searches again', async () => {
    let calls = 0
    const e = new Engine(
      deps({
        search: async (t) => {
          calls++
          if (calls === 1) throw new Error('blip')
          return [good(t)]
        }
      })
    )
    e.load(playlist(1))
    await settle(e)
    e.retry('t0')
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('found')
  })
})

describe('when a video cannot be downloaded', () => {
  const second: Candidate = { videoId: 'bbbbbbbbbbb', title: 'Song 0', artists: ['A'], durationS: 201, kind: 'video', score: 0 }
  const weak: Candidate = { videoId: 'ccccccccccc', title: 'Unrelated', artists: ['Z'], durationS: 20, kind: 'song', score: 0 }

  test('falls back to the next good match', async () => {
    const tried: string[] = []
    const e = new Engine(
      deps({
        search: async (t) => [good(t), second],
        download: async (_t, c) => {
          tried.push(c.videoId)
          if (c.videoId === 'abcdefghijk') throw new Error('age restricted')
          return ['ok.m4a']
        }
      })
    )
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(tried).toEqual(['abcdefghijk', 'abcdefghijk', 'bbbbbbbbbbb'])
    expect(e.snapshot().tracks[0]).toMatchObject({ status: 'saved', chosenVideoId: 'bbbbbbbbbbb' })
  })
  test('never falls back to a bad match', async () => {
    const tried: string[] = []
    const e = new Engine(
      deps({
        search: async (t) => [good(t), weak],
        download: async (_t, c) => {
          tried.push(c.videoId)
          throw new Error('nope')
        }
      })
    )
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(tried).not.toContain('ccccccccccc')
    expect(e.snapshot().tracks[0].status).toBe('failed')
  })
  test('a hand-picked result is not swapped for another', async () => {
    const tried: string[] = []
    const e = new Engine(
      deps({
        search: async (t) => [good(t), second],
        download: async (_t, c) => {
          tried.push(c.videoId)
          throw new Error('nope')
        }
      })
    )
    e.load(playlist(1))
    await settle(e)
    e.choose('t0', 'bbbbbbbbbbb')
    e.start(options)
    await settle(e)
    expect(tried).not.toContain('abcdefghijk')
  })
  test('failed tracks are tried again on the next download', async () => {
    let calls = 0
    const e = new Engine(
      deps({
        download: async () => {
          calls++
          if (calls <= 2) throw new Error('blip')
          return ['ok']
        }
      })
    )
    e.load(playlist(1))
    e.start(options)
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('failed')
    e.start(options)
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('saved')
  })
})

describe('loading', () => {
  test('a track listed twice only appears once', () => {
    const e = new Engine(deps())
    const track = { id: 'same', title: 'S', artists: ['A'], durationMs: 200000 }
    e.load({ name: 'P', tracks: [track, track] })
    expect(e.snapshot().tracks).toHaveLength(1)
  })
  test('a track with no length waits for the metadata lookup so it can match on length', async () => {
    let seenLength: number | undefined
    const e = new Engine(
      deps({
        enrich: async () => {
          await wait(5)
          return { durationMs: 200000 }
        },
        search: async (t) => {
          seenLength = t.durationMs
          return [good(t)]
        }
      })
    )
    e.load({ name: 'P', tracks: [{ id: 'x', title: 'Song 0', artists: ['A'] }] })
    await settle(e)
    expect(seenLength).toBe(200000)
    expect(e.snapshot().tracks[0].status).toBe('found')
  })
})

describe('tracks that share a name', () => {
  test('different versions get numbered so one never overwrites the other', () => {
    const e = new Engine(deps())
    e.load({
      name: 'P',
      tracks: [
        { id: 'a', title: 'Batal El Alam', artists: ['Marwan Moussa'], durationMs: 183000 },
        { id: 'b', title: 'batal el alam', artists: ['Marwan Moussa'], durationMs: 213000 },
        { id: 'c', title: 'Other', artists: ['Marwan Moussa'], durationMs: 100000 }
      ]
    })
    expect(e.snapshot().tracks.map((t) => t.variant)).toEqual([undefined, 2, undefined])
  })
})

describe('connect hint', () => {
  test('stays with the session so the window can offer connecting', () => {
    const e = new Engine(deps())
    e.load({ ...playlist(1), connectHelps: true, warning: 'Connect' })
    expect(e.snapshot().connectHelps).toBe(true)
  })
})

describe('tracks already in the folder', () => {
  const inFolder = (...ids: string[]) => async () => (t: Track) => (ids.includes(t.id) ? [`${t.id}.mp3`] : null)

  test('are marked when a playlist loads and never searched', async () => {
    const searched: string[] = []
    const e = new Engine(
      deps({
        findExisting: inFolder('t0'),
        search: async (t) => {
          searched.push(t.id)
          return [good(t)]
        }
      })
    )
    e.load(playlist(2), options)
    await settle(e)
    expect(e.snapshot().tracks[0]).toMatchObject({ status: 'have', files: ['t0.mp3'] })
    expect(searched).toEqual(['t1'])
    expect(e.snapshot().tracks[1].status).toBe('found')
  })
  test('are not downloaded', async () => {
    const downloaded: string[] = []
    const e = new Engine(
      deps({
        findExisting: inFolder('t0'),
        download: async (t) => {
          downloaded.push(t.id)
          return [t.id]
        }
      })
    )
    e.load(playlist(2), options)
    e.start(options)
    await settle(e)
    expect(downloaded).toEqual(['t1'])
  })
  test('the folder is scanned again before downloading starts', async () => {
    let files: string[] = []
    const downloaded: string[] = []
    const e = new Engine(
      deps({
        findExisting: async () => (t: Track) => (files.includes(t.id) ? [t.id] : null),
        download: async (t) => {
          downloaded.push(t.id)
          return [t.id]
        }
      })
    )
    e.load(playlist(2), options)
    await settle(e)
    files = ['t0']
    e.start(options)
    await settle(e)
    expect(downloaded).toEqual(['t1'])
    expect(e.snapshot().tracks[0].status).toBe('have')
  })
  test('a run with nothing left to download still finishes', async () => {
    let summary: any
    const e = new Engine(deps({ findExisting: inFolder('t0', 't1') }))
    e.on('done', (s) => (summary = s))
    e.load(playlist(2), options)
    await settle(e)
    e.start(options)
    await settle(e)
    expect(summary).toMatchObject({ saved: 0, had: 2 })
    expect(e.snapshot().downloading).toBe(false)
  })
  test('counts them separately in the summary', async () => {
    let summary: any
    const e = new Engine(deps({ findExisting: inFolder('t0') }))
    e.on('done', (s) => (summary = s))
    e.load(playlist(2), options)
    e.start(options)
    await settle(e)
    expect(summary).toMatchObject({ saved: 1, had: 1 })
  })
  test('choosing another folder re-checks every track', async () => {
    let inside = ['t0']
    const e = new Engine(deps({ findExisting: async () => (t: Track) => (inside.includes(t.id) ? [t.id] : null) }))
    e.load(playlist(2), options)
    await settle(e)
    inside = ['t1']
    e.checkFolder({ ...options, outDir: 'E:\\Other' })
    await settle(e)
    expect(e.snapshot().tracks.map((t) => t.status)).toEqual(['found', 'have'])
  })
  test('a late search result cannot overwrite a track found in the folder', async () => {
    let inside: string[] = []
    const e = new Engine(
      deps({
        findExisting: async () => (t: Track) => (inside.includes(t.id) ? [t.id] : null),
        search: async (t) => {
          await wait(15)
          return [good(t)]
        }
      })
    )
    e.load(playlist(1), options)
    await wait(3)
    inside = ['t0']
    e.checkFolder(options)
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('have')
  })
  test('a failed scan never blocks the playlist', async () => {
    const e = new Engine(
      deps({
        findExisting: async () => {
          throw new Error('no access')
        }
      })
    )
    e.load(playlist(1), options)
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('found')
  })
  test('download again ignores the existing file and replaces it', async () => {
    let force: boolean | undefined
    const e = new Engine(
      deps({
        findExisting: inFolder('t0'),
        download: async (t, _c, _o, _p, _s, forced) => {
          force = forced
          return [t.id]
        }
      })
    )
    e.load(playlist(1), options)
    await settle(e)
    e.downloadAgain('t0')
    await settle(e)
    expect(e.snapshot().tracks[0].status).toBe('found')
    e.start(options)
    await settle(e)
    expect(force).toBe(true)
    expect(e.snapshot().tracks[0].status).toBe('saved')
  })
})
