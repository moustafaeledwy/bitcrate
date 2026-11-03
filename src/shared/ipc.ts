import type { AccountPlaylist, DownloadOptions, RunSummary, Session, Settings, TrackState } from './types'

export interface TrackPatch {
  id: string
  patch: Partial<TrackState>
}

export interface FilePick {
  // Set when one file held several playlists, such as a CSVMusic library.
  choices?: { index: number; name: string; count: number }[]
  cancelled?: boolean
}

export interface AppApi {
  getState(): Promise<{ settings: Settings; session: Session }>
  loadLink(link: string): Promise<void>
  openFile(): Promise<FilePick>
  loadChoice(index: number): Promise<void>
  start(options: DownloadOptions): Promise<void>
  cancel(): Promise<void>
  choose(id: string, videoId: string): Promise<void>
  retry(id: string): Promise<void>
  downloadAgain(id: string): Promise<void>
  chooseFolder(): Promise<string | null>
  openOutput(): Promise<void>
  openVideo(videoId: string): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  updateDownloader(): Promise<string>
  spotifyStatus(): Promise<{ connected: boolean; clientId?: string }>
  spotifyConnect(clientId: string): Promise<void>
  spotifyDisconnect(): Promise<void>
  myPlaylists(): Promise<AccountPlaylist[]>
  openSpotifyDashboard(): Promise<void>
  copyRedirectUri(): Promise<void>
  onSession(listener: (session: Session) => void): () => void
  onPatches(listener: (patches: TrackPatch[]) => void): () => void
  onDownloading(listener: (downloading: boolean) => void): () => void
  onDone(listener: (summary: RunSummary) => void): () => void
}
