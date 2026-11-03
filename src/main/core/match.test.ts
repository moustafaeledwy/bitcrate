import { describe, expect, test } from 'vitest'
import type { Candidate, Track } from '../../shared/types'
import { normalize, rankCandidates, scoreCandidate, statusForScore } from './match'

const track: Track = { id: '1', title: 'Hide & Seek', artists: ['Nathan Coles'], durationMs: 459000 }
const cand = (over: Partial<Candidate>): Candidate => ({
  videoId: 'v',
  title: 'Hide & Seek',
  artists: ['Nathan Coles'],
  durationS: 459,
  kind: 'song',
  score: 0,
  ...over
})

describe('normalize', () => {
  test('strips accents, case, punctuation and feat credits', () => {
    expect(normalize('Beyoncé — Déjà Vu (feat. Jay-Z)')).toBe('beyonce deja vu')
  })
  test('treats & and and the same', () => {
    expect(normalize('Hide & Seek')).toBe(normalize('Hide and Seek'))
  })
  test('keeps titles written in other alphabets', () => {
    expect(normalize('سلام')).toBe('سلام')
  })
})

describe('scoreCandidate', () => {
  test('an exact song scores high', () => {
    expect(statusForScore(scoreCandidate(track, cand({})))).toBe('found')
  })
  test('a different artist is not auto-accepted', () => {
    expect(statusForScore(scoreCandidate(track, cand({ artists: ['Somebody Else'] })))).not.toBe('found')
  })
  test('a very different length is not auto-accepted', () => {
    expect(statusForScore(scoreCandidate(track, cand({ durationS: 200 })))).not.toBe('found')
  })
  test('an extended mix does not pass for the normal version', () => {
    const extended = scoreCandidate(track, cand({ title: 'Hide & Seek (Extended Mix)' }))
    expect(extended).toBeLessThan(scoreCandidate(track, cand({})))
    expect(statusForScore(extended)).not.toBe('found')
  })
  test('an asked-for remix prefers the remix', () => {
    const remix: Track = { ...track, title: 'Hide & Seek (Dense Remix)' }
    expect(scoreCandidate(remix, cand({ title: 'Hide & Seek (Dense Remix)' }))).toBeGreaterThan(scoreCandidate(remix, cand({})))
  })
  test('Original Mix counts as the plain version', () => {
    expect(statusForScore(scoreCandidate(track, cand({ title: 'Hide & Seek - Original Mix' })))).toBe('found')
  })
  test('a music video loses to the same song', () => {
    expect(scoreCandidate(track, cand({ kind: 'video' }))).toBeLessThan(scoreCandidate(track, cand({})))
  })
  test('an artist named only in a video title still counts', () => {
    const score = scoreCandidate(track, cand({ kind: 'video', title: 'Nathan Coles - Hide & Seek', artists: ['Some Label'] }))
    expect(statusForScore(score)).toBe('found')
  })
  test('with no known length a perfect text match still asks for review', () => {
    const noLength: Track = { ...track, durationMs: undefined }
    expect(statusForScore(scoreCandidate(noLength, cand({})))).toBe('review')
  })
  test('an unrelated result counts as missing', () => {
    expect(statusForScore(scoreCandidate(track, cand({ title: 'Totally Different', artists: ['Nobody'], durationS: 120 })))).toBe('missing')
  })
})

describe('rankCandidates', () => {
  test('sorts best first and fills in scores', () => {
    const ranked = rankCandidates(track, [cand({ videoId: 'bad', durationS: 100, title: 'Other' }), cand({ videoId: 'good' })])
    expect(ranked[0].videoId).toBe('good')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
})

describe('titles written in another alphabet', () => {
  const latin: Track = { id: '1', title: 'Boushret Kheir', artists: ['Hussain Aljassmi'], durationMs: 240000 }
  test('a song with the exact length is offered for review', () => {
    const arabic = cand({ title: 'بشرة خير', artists: ['حسين الجسمي'], durationS: 241 })
    expect(statusForScore(scoreCandidate(latin, arabic))).toBe('review')
  })
  test('a different length is still not a match', () => {
    const arabic = cand({ title: 'بشرة خير', artists: ['حسين الجسمي'], durationS: 200 })
    expect(statusForScore(scoreCandidate(latin, arabic))).toBe('missing')
  })
  test('a music video is too loose to count on length alone', () => {
    const arabic = cand({ kind: 'video', title: 'بشرة خير', artists: ['قناة'], durationS: 241 })
    expect(statusForScore(scoreCandidate(latin, arabic))).toBe('missing')
  })
  test('same alphabet with a different name stays missing', () => {
    expect(statusForScore(scoreCandidate(latin, cand({ title: 'Another Song', artists: ['Someone'], durationS: 241 })))).toBe('missing')
  })
})
