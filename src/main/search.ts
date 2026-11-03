import type { Candidate, Track } from '../shared/types'
import { rankCandidates } from './core/match'
import { baseArgs, type Tools } from './core/ytdlp'
import { parseYtSearchJson, searchQuery, searchYtMusic } from './core/ytmusic'
import { runTool } from './tools'

const CONFIDENT = 80

async function withRetry<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    return await job()
  } catch (error) {
    if (signal.aborted) throw error
    await new Promise((resolve) => setTimeout(resolve, 800))
    return job()
  }
}

// Songs first, since those are the official audio. Videos only when no song is a confident match.
async function searchFast(track: Track, signal: AbortSignal): Promise<Candidate[]> {
  const query = searchQuery(track)
  const songs = await withRetry(() => searchYtMusic(query, 'song', signal), signal)
  if ((rankCandidates(track, songs)[0]?.score ?? 0) >= CONFIDENT) return songs
  const videos = await withRetry(() => searchYtMusic(query, 'video', signal), signal)
  return [...songs, ...videos]
}

export async function searchTrack(track: Track, tools: Tools, signal: AbortSignal): Promise<Candidate[]> {
  try {
    return await searchFast(track, signal)
  } catch (error) {
    if (signal.aborted) throw error
    // The direct search is much faster, but yt-dlp keeps working if YouTube Music changes it.
    const output = await runTool(tools.ytDlp, [...baseArgs(tools), '--flat-playlist', '-J', `ytsearch6:${searchQuery(track)}`], { signal, timeoutMs: 60000 })
    return parseYtSearchJson(output)
  }
}
