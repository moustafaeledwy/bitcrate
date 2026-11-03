import type { Candidate, Track, TrackStatus } from '../../shared/types'

const FOUND_AT = 80
const REVIEW_AT = 55

// Words that mean a different cut of a track, which matters when you are mixing.
const VERSION_WORDS = ['extended', 'radio', 'remix', 'dub', 'edit', 'instrumental', 'live', 'acapella', 'vip', 'rework', 'bootleg', 'karaoke', 'slowed', 'sped up', 'cover']
const NOISE_WORDS = new Set(['official', 'video', 'audio', 'lyric', 'lyrics', 'visualizer', 'hd', 'hq', 'topic', 'music'])

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[([][^)\]]*\b(feat|ft|featuring|with)\b[^)\]]*[)\]]/g, ' ')
    .replace(/\s(feat|ft|featuring)\.?\s.*$/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const removePhrase = (text: string, phrase: string) =>
  phrase ? ` ${text} `.split(` ${phrase} `).join(' ').trim() : text

// The name of the song with versions, credits and channel words taken out.
function cleanTitle(title: string, artists: string[]): string {
  const withoutGroups = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s[^-]*(mix|edit|remix|remaster|remastered|version|original|radio|extended|dub)[^-]*$/i, ' ')
  let text = normalize(withoutGroups)
  for (const artist of artists) text = removePhrase(text, normalize(artist))
  return text
    .split(' ')
    .filter((word) => word && !NOISE_WORDS.has(word))
    .join(' ')
}

function versionTags(title: string): Set<string> {
  const text = ` ${normalize(title).replace(/\boriginal mix\b/g, ' ')} `
  return new Set(VERSION_WORDS.filter((word) => text.includes(` ${word} `)))
}

function overlap(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean))
  const right = new Set(b.split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared++
  return (2 * shared) / (left.size + right.size)
}

export function titleSimilarity(trackTitle: string, otherTitle: string, artists: string[]): number {
  return overlap(cleanTitle(trackTitle, artists), cleanTitle(otherTitle, artists))
}

export function artistMatches(artists: string[], text: string): boolean {
  const haystack = ` ${normalize(text)} `
  return artists.some((artist) => {
    const name = normalize(artist)
    return name !== '' && haystack.includes(` ${name} `)
  })
}

const usesLatin = (text: string) => /\p{Script=Latin}/u.test(text)

function durationFit(diffSeconds: number): number {
  if (diffSeconds <= 2) return 1
  if (diffSeconds <= 5) return 0.85
  if (diffSeconds <= 10) return 0.5
  if (diffSeconds <= 30) return 0.2
  return 0
}

export function scoreCandidate(track: Track, candidate: Candidate): number {
  const title = titleSimilarity(track.title, candidate.title, track.artists)
  const artist = artistMatches(track.artists, `${candidate.artists.join(' ')} ${candidate.title}`) ? 1 : 0

  let score: number
  if (track.durationMs && candidate.durationS !== undefined) {
    const diff = Math.abs(track.durationMs / 1000 - candidate.durationS)
    score = title * 35 + artist * 25 + durationFit(diff) * 40
    // Over a minute off is a different cut, so it should never download by itself.
    if (diff > 60) score = Math.min(score, REVIEW_AT - 5)
  } else {
    // Without a length to compare, text alone can only ever reach "please check".
    score = (title * 60 + artist * 40) * 0.75
  }

  const wanted = versionTags(track.title)
  const offered = versionTags(candidate.title)
  for (const tag of new Set([...wanted, ...offered])) {
    if (wanted.has(tag) !== offered.has(tag)) score -= 25
  }
  if (candidate.kind === 'video') score -= 5

  // A song written in another alphabet can't match on text, as with Arabic titles spelled in Latin
  // letters on Spotify. An exact length on an official song is worth a look, but only as a review.
  if (candidate.kind === 'song' && track.durationMs && candidate.durationS !== undefined) {
    const exactLength = Math.abs(track.durationMs / 1000 - candidate.durationS) <= 2
    if (exactLength && usesLatin(track.title) !== usesLatin(candidate.title)) score = Math.max(score, REVIEW_AT)
  }
  return Math.max(0, Math.round(score))
}

export function statusForScore(score: number): Extract<TrackStatus, 'found' | 'review' | 'missing'> {
  if (score >= FOUND_AT) return 'found'
  if (score >= REVIEW_AT) return 'review'
  return 'missing'
}

export function rankCandidates(track: Track, candidates: Candidate[]): Candidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(track, candidate) }))
    .sort((a, b) => b.score - a.score)
}
