import type { FileFormat, Track } from '../../shared/types'

export interface Tools {
  ytDlp: string
  ffmpeg: string
  deno?: string
}

const PROGRESS_TEMPLATE = 'download:BC|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s'

export const isVideoId = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id) && !id.startsWith('-')
export const watchUrl = (videoId: string) => `https://music.youtube.com/watch?v=${videoId}`

export function baseArgs(tools: Tools): string[] {
  return [
    '--no-config',
    '--no-playlist',
    '--no-warnings',
    '--retries', '3',
    '--socket-timeout', '20',
    '--ffmpeg-location', tools.ffmpeg,
    ...(tools.deno ? ['--js-runtimes', `deno:${tools.deno}`] : [])
  ]
}

export function downloadArgs(videoId: string, format: FileFormat, outputTemplate: string, tools: Tools): string[] {
  if (!isVideoId(videoId)) throw new Error(`Not a valid video id: ${videoId}`)
  return [
    ...baseArgs(tools),
    '--force-overwrites',
    '--newline',
    '--progress-template', PROGRESS_TEMPLATE,
    // Stream 140 is YouTube's AAC, saved as is. MP3 has to be encoded anyway, so start from the best stream.
    '-f', format === 'm4a' ? '140/bestaudio[ext=m4a]' : 'bestaudio',
    '-o', outputTemplate,
    watchUrl(videoId)
  ]
}

export interface TagRequest {
  input: string
  cover?: string
  output: string
  format: FileFormat
  track: Track
  videoId: string
}

export function tagArgs({ input, cover, output, format, track, videoId }: TagRequest): string[] {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input]
  if (cover) args.push('-i', cover)
  args.push('-map', '0:a:0')
  if (cover) args.push('-map', '1:v:0')
  args.push('-map_metadata', '-1')

  if (format === 'm4a') args.push('-c:a', 'copy', '-movflags', '+faststart')
  else args.push('-c:a', 'libmp3lame', '-b:a', '320k', '-id3v2_version', '3')
  if (cover) args.push('-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic')

  const tags: Record<string, string | number | undefined> = {
    title: track.title,
    artist: track.artists.join(', '),
    album: track.album,
    date: track.year,
    track: track.trackNumber,
    disc: track.discNumber,
    comment: watchUrl(videoId),
    ...(format === 'mp3' ? { TBPM: track.bpm, TSRC: track.isrc } : {})
  }
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== '') args.push('-metadata', `${key}=${value}`)
  }
  args.push(output)
  return args
}

export function parseProgress(line: string): number | null {
  const match = line.match(/^BC\|(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)/)
  if (!match) return null
  const total = Number(match[2])
  return total > 0 ? Math.min(1, Number(match[1]) / total) : null
}

export function describeFailure(output: string): string {
  if (/429|too many requests/i.test(output)) return 'YouTube is limiting downloads. Lower the number of downloads at once, or wait a few minutes.'
  if (/video unavailable|private video|has been removed|not available in your country/i.test(output)) return 'This video is unavailable on YouTube. Choose another result.'
  if (/confirm your age|age.restricted|inappropriate for some users/i.test(output)) return 'This video is age-restricted, and YouTube requires a signed-in account. Choose another result.'
  if (/not a bot/i.test(output)) return "YouTube wants to check you're not a bot. Wait a few minutes, or lower the number of downloads at once."
  if (/requested format is not available|nsig|unable to extract/i.test(output)) return 'YouTube changed something. Update the downloader in Settings, then try again.'
  const errors = output.split(/\r?\n/).filter((line) => line.startsWith('ERROR:'))
  const last = errors[errors.length - 1]
  return last ? last.replace(/^ERROR:\s*/, '') : output.trim().split(/\r?\n/).pop() || 'The download failed.'
}
