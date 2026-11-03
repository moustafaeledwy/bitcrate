import { describe, expect, test } from 'vitest'
import type { Track } from '../../shared/types'
import { describeFailure, downloadArgs, isVideoId, parseProgress, tagArgs, watchUrl } from './ytdlp'

const tools = { ytDlp: 'y.exe', ffmpeg: 'C:\\bin\\ffmpeg.exe', deno: 'C:\\bin\\deno.exe' }
const track: Track = {
  id: '1',
  title: 'Colt',
  artists: ['Dense & Pika', 'Other'],
  album: 'Colt EP',
  year: '2014',
  trackNumber: 3,
  discNumber: 1,
  isrc: 'GB123',
  bpm: 128
}

describe('downloadArgs', () => {
  test('saves the original AAC stream for M4A, with no converting', () => {
    const args = downloadArgs('abcdefghijk', 'm4a', 'T:\\job\\audio.%(ext)s', tools)
    expect(args[args.indexOf('-f') + 1]).toBe('140/bestaudio[ext=m4a]')
    expect(args).not.toContain('--audio-format')
    expect(args).not.toContain('-x')
  })
  test('takes the best stream as the source for MP3', () => {
    const args = downloadArgs('abcdefghijk', 'mp3', 'T:\\job\\audio.%(ext)s', tools)
    expect(args[args.indexOf('-f') + 1]).toBe('bestaudio')
  })
  test('ignores personal yt-dlp config and never grabs playlists', () => {
    const args = downloadArgs('abcdefghijk', 'm4a', 'o', tools)
    expect(args).toContain('--no-config')
    expect(args).toContain('--no-playlist')
  })
  test('points at the bundled tools', () => {
    const args = downloadArgs('abcdefghijk', 'm4a', 'o', tools)
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe(tools.ffmpeg)
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe(`deno:${tools.deno}`)
  })
  test('refuses a video id that could be a command line flag', () => {
    expect(() => downloadArgs('--exec=evil', 'm4a', 'o', tools)).toThrow(/video id/i)
  })
})

describe('isVideoId', () => {
  test('accepts only YouTube-shaped ids', () => {
    expect(isVideoId('kPS8Av2lhSY')).toBe(true)
    expect(isVideoId('short')).toBe(false)
  })
})

describe('watchUrl', () => {
  test('builds a YouTube Music link', () => {
    expect(watchUrl('kPS8Av2lhSY')).toBe('https://music.youtube.com/watch?v=kPS8Av2lhSY')
  })
})

describe('tagArgs', () => {
  const metaOf = (args: string[]) => args.filter((_, i) => args[i - 1] === '-metadata')

  test('copies M4A audio untouched and embeds the cover', () => {
    const args = tagArgs({ input: 'a.m4a', cover: 'c.jpg', output: 'o.m4a', format: 'm4a', track, videoId: 'kPS8Av2lhSY' })
    expect(args.join(' ')).toContain('-c:a copy')
    expect(args.join(' ')).toContain('-disposition:v:0 attached_pic')
  })
  test('encodes MP3 at a constant 320 kbps', () => {
    const args = tagArgs({ input: 'a.webm', cover: 'c.jpg', output: 'o.mp3', format: 'mp3', track, videoId: 'kPS8Av2lhSY' })
    expect(args.join(' ')).toContain('-c:a libmp3lame -b:a 320k')
    expect(args.join(' ')).toContain('-id3v2_version 3')
  })
  test('writes the track metadata and where it came from', () => {
    const meta = metaOf(tagArgs({ input: 'a', output: 'o.m4a', format: 'm4a', track, videoId: 'kPS8Av2lhSY' }))
    expect(meta).toEqual(
      expect.arrayContaining([
        'title=Colt',
        'artist=Dense & Pika, Other',
        'album=Colt EP',
        'date=2014',
        'track=3',
        'disc=1',
        'comment=https://music.youtube.com/watch?v=kPS8Av2lhSY'
      ])
    )
  })
  test('adds BPM and ISRC to MP3s', () => {
    const meta = metaOf(tagArgs({ input: 'a', output: 'o.mp3', format: 'mp3', track, videoId: 'kPS8Av2lhSY' }))
    expect(meta).toEqual(expect.arrayContaining(['TBPM=128', 'TSRC=GB123']))
  })
  test('works without a cover', () => {
    const args = tagArgs({ input: 'a', output: 'o.m4a', format: 'm4a', track, videoId: 'kPS8Av2lhSY' })
    expect(args).not.toContain('attached_pic')
    expect(args.filter((a) => a === '-i')).toHaveLength(1)
  })
})

describe('parseProgress', () => {
  test('turns a progress line into a fraction', () => {
    expect(parseProgress('BC|500|1000')).toBe(0.5)
  })
  test('ignores other output and unknown totals', () => {
    expect(parseProgress('[download] something')).toBeNull()
    expect(parseProgress('BC|500|NA')).toBeNull()
  })
})

describe('describeFailure', () => {
  test('explains rate limiting', () => {
    expect(describeFailure('ERROR: HTTP Error 429: Too Many Requests')).toMatch(/slower|wait/i)
  })
  test('explains a removed video', () => {
    expect(describeFailure('ERROR: [youtube] x: Video unavailable')).toMatch(/unavailable/i)
  })
  test('suggests updating when YouTube changed something', () => {
    expect(describeFailure('ERROR: Requested format is not available')).toMatch(/update/i)
  })
  test('falls back to the last error line', () => {
    expect(describeFailure('noise\nERROR: weird thing\n')).toBe('weird thing')
  })
})

describe('describeFailure for sign-in walls', () => {
  test('says when a video is age restricted', () => {
    expect(describeFailure('ERROR: [youtube] x: Sign in to confirm your age. Use --cookies')).toMatch(/age.restricted/i)
  })
  test('says when YouTube suspects a bot', () => {
    expect(describeFailure("ERROR: [youtube] x: Sign in to confirm you're not a bot")).toMatch(/wait|lower/i)
  })
})
