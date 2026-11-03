import { createHash } from 'node:crypto'
import type { ImportedPlaylist, Track } from '../../shared/types'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^﻿/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const HEADERS: Record<string, string[]> = {
  title: ['track name', 'title', 'name', 'song', 'track'],
  artists: ['artist name(s)', 'artist names', 'artist name', 'artists', 'artist'],
  album: ['album name', 'album'],
  released: ['album release date', 'release date', 'year'],
  cover: ['album image url', 'image url', 'cover url', 'cover'],
  disc: ['disc number', 'disc'],
  number: ['track number', 'track no', 'number'],
  duration: ['track duration (ms)', 'duration (ms)', 'duration_ms', 'duration ms'],
  isrc: ['isrc'],
  uri: ['track uri', 'spotify uri', 'uri', 'spotify id']
}

const stableId = (title: string, artists: string[]) =>
  createHash('sha1').update(`${title}|${artists.join(',')}`).digest('hex').slice(0, 16)

const splitArtists = (text: string) =>
  text
    .split(text.includes(';') ? ';' : ',')
    .map((artist) => artist.trim())
    .filter(Boolean)

const positive = (text: string | undefined) => {
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function parseCsvPlaylist(text: string, name: string): ImportedPlaylist {
  const [header, ...rows] = parseCsv(text)
  const names = (header ?? []).map((cell) => cell.trim().toLowerCase())
  const column = (key: string) => names.findIndex((cell) => HEADERS[key].includes(cell))
  const titleAt = column('title')
  if (titleAt < 0) throw new Error('This CSV has no track name column. It needs a column called "Track Name" or "Title".')
  const at = (row: string[], key: string) => {
    const index = column(key)
    return index >= 0 ? row[index]?.trim() || undefined : undefined
  }

  const tracks: Track[] = []
  for (const row of rows) {
    const title = row[titleAt]?.trim()
    if (!title) continue
    const artists = splitArtists(at(row, 'artists') ?? '')
    const uri = at(row, 'uri')?.split(':').pop()
    tracks.push({
      id: uri || stableId(title, artists),
      title,
      artists,
      album: at(row, 'album'),
      year: at(row, 'released')?.slice(0, 4),
      coverUrl: at(row, 'cover'),
      discNumber: positive(at(row, 'disc')),
      trackNumber: positive(at(row, 'number')),
      durationMs: positive(at(row, 'duration')),
      isrc: at(row, 'isrc')
    })
  }
  if (!tracks.length) throw new Error('This CSV has no tracks in it.')
  return { name, tracks }
}

export function parseCsvmusicLibrary(text: string): ImportedPlaylist[] {
  const data = JSON.parse(text)
  if (!Array.isArray(data?.playlists)) throw new Error('This file is not a CSVMusic library.')
  return data.playlists.map((playlist: any) => ({
    name: playlist.name,
    coverUrl: playlist.cover_url ?? undefined,
    link: playlist.url,
    tracks: (playlist.tracks ?? []).map((track: any) => {
      const artists = String(track.artists ?? '')
        .split(',')
        .map((artist) => artist.trim())
        .filter(Boolean)
      return {
        id: track.sp_id || stableId(track.title, artists),
        title: track.title,
        artists,
        album: track.album || undefined,
        coverUrl: track.cover_url || undefined,
        trackNumber: track.track_no || undefined,
        discNumber: track.disc_no || undefined,
        durationMs: track.duration_ms || undefined,
        isrc: track.isrc || undefined,
        year: track.year ? String(track.year) : undefined
      }
    })
  }))
}
