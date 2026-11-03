export type Format = 'm4a' | 'mp3' | 'both'
export type FileFormat = 'm4a' | 'mp3'

export interface Track {
  id: string
  title: string
  artists: string[]
  album?: string
  durationMs?: number
  coverUrl?: string
  isrc?: string
  trackNumber?: number
  discNumber?: number
  year?: string
  bpm?: number
  // Set when another track in the playlist has the same artist and title.
  variant?: number
}

export interface ImportedPlaylist {
  name: string
  coverUrl?: string
  link?: string
  totalReported?: number
  warning?: string
  connectHelps?: boolean
  tracks: Track[]
}

export interface Candidate {
  videoId: string
  title: string
  artists: string[]
  album?: string
  durationS?: number
  thumbnail?: string
  kind: 'song' | 'video'
  score: number
}

export type TrackStatus =
  | 'searching'
  | 'found'
  | 'review'
  | 'missing'
  | 'queued'
  | 'downloading'
  | 'saved'
  | 'have'
  | 'failed'

export interface TrackState extends Track {
  status: TrackStatus
  candidates: Candidate[]
  chosenVideoId?: string
  progress: number
  files: string[]
  error?: string
}

export interface DownloadOptions {
  outDir: string
  format: Format
  splitByFormat: boolean
  concurrency: number
}

export interface AccountPlaylist {
  id: string
  name: string
  coverUrl?: string
  count?: number
  owner: string
  fullList: boolean
}

export interface Settings extends DownloadOptions {
  sound: boolean
  spotifyClientId?: string
  recent: { name: string; link: string; count: number }[]
}

export interface Session {
  name: string
  coverUrl?: string
  warning?: string
  connectHelps?: boolean
  tracks: TrackState[]
  downloading: boolean
}

export interface RunSummary {
  saved: number
  had: number
  failed: number
  missing: number
  folder: string
}
