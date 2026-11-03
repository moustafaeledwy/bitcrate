import { EventEmitter } from 'node:events'
import type { Candidate, DownloadOptions, ImportedPlaylist, RunSummary, Session, Track, TrackState } from '../../shared/types'
import { fillMissing } from './deezer'
import { rankCandidates, statusForScore } from './match'
import { playlistFolder, trackFileName } from './paths'
import { createPool } from './pool'

const MAX_ALTERNATIVES = 2

function numberVariants(tracks: Track[]): Track[] {
  const seen = new Map<string, number>()
  return tracks.map((track) => {
    const key = trackFileName(track, 'm4a').toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count > 1 ? { ...track, variant: count } : track
  })
}

export interface EngineDeps {
  search(track: Track, signal: AbortSignal): Promise<Candidate[]>
  enrich(track: Track): Promise<Partial<Track>>
  download(track: Track, candidate: Candidate, options: DownloadOptions, onProgress: (fraction: number) => void, signal: AbortSignal, force?: boolean): Promise<string[]>
  // Scans the save folder, then answers whether each track is already in it.
  findExisting?(options: DownloadOptions): Promise<(track: Track) => string[] | null>
  finish(session: Session, options: DownloadOptions): Promise<void>
}

export interface EngineLimits {
  searchConcurrency: number
  enrichConcurrency: number
}

export class Engine extends EventEmitter {
  private session: Session = { name: '', tracks: [], downloading: false }
  private searches
  private enriches
  private downloads = createPool(4)
  private generation = 0
  private busy = 0
  private idleWaiters: (() => void)[] = []
  private enriched = new Map<string, Promise<void>>()
  private handPicked = new Set<string>()
  private forced = new Set<string>()
  private scanning = 0
  private controllers = new Set<AbortController>()
  private loadController = new AbortController()
  private options?: DownloadOptions

  constructor(
    private deps: EngineDeps,
    limits: EngineLimits = { searchConcurrency: 8, enrichConcurrency: 4 }
  ) {
    super()
    this.searches = createPool(limits.searchConcurrency)
    this.enriches = createPool(limits.enrichConcurrency)
  }

  snapshot(): Session {
    return this.session
  }

  load(playlist: ImportedPlaylist, options?: DownloadOptions): void {
    this.cancel()
    this.searches.clear()
    this.enriches.clear()
    this.loadController.abort()
    this.loadController = new AbortController()
    this.generation++
    this.enriched.clear()
    this.handPicked.clear()
    this.forced.clear()
    this.session = {
      name: playlist.name,
      coverUrl: playlist.coverUrl,
      warning: playlist.warning,
      connectHelps: playlist.connectHelps,
      downloading: false,
      tracks: numberVariants([...new Map(playlist.tracks.map((track) => [track.id, track])).values()]).map((track) => ({
        ...track,
        status: 'searching',
        candidates: [],
        progress: 0,
        files: []
      }))
    }
    this.emit('session', this.session)
    const lookUpTheRest = () => {
      for (const track of this.session.tracks) {
        if (track.status !== 'searching') continue
        this.scheduleEnrich(track.id)
        this.scheduleSearch(track.id)
      }
    }
    if (options && this.deps.findExisting) this.scanFolder(options, lookUpTheRest)
    else lookUpTheRest()
  }

  start(options: DownloadOptions): void {
    this.options = options
    this.downloads.setLimit(options.concurrency)
    this.setDownloading(true)
    const enqueueReady = () => {
      if (!this.session.downloading) return
      for (const track of this.session.tracks) {
        const retryable = track.status === 'failed' && track.chosenVideoId
        if (track.status === 'found' || track.status === 'review' || retryable) this.enqueue(track.id)
      }
    }
    if (this.deps.findExisting) {
      this.scanFolder(options, enqueueReady)
    } else {
      enqueueReady()
      this.maybeFinish()
    }
  }

  // For when the save folder or format changes before downloading.
  checkFolder(options: DownloadOptions): void {
    if (this.deps.findExisting && !this.session.downloading) this.scanFolder(options, () => {})
  }

  downloadAgain(id: string): void {
    if (!this.find(id)) return
    this.forced.add(id)
    this.patch(id, { status: 'searching', files: [], progress: 0, error: undefined })
    this.scheduleEnrich(id)
    this.scheduleSearch(id)
  }

  cancel(): void {
    if (!this.session.downloading) return
    this.setDownloading(false)
    this.downloads.clear()
    this.controllers.forEach((controller) => controller.abort())
    for (const track of this.session.tracks) {
      if (track.status === 'queued') this.patch(track.id, { status: this.settledStatus(track), progress: 0 })
    }
  }

  choose(id: string, videoId: string): void {
    const track = this.find(id)
    if (!track?.candidates.some((candidate) => candidate.videoId === videoId)) return
    this.handPicked.add(id)
    this.patch(id, { chosenVideoId: videoId, status: 'found', error: undefined, progress: 0, files: [] })
    if (this.session.downloading) this.enqueue(id)
  }

  retry(id: string): void {
    const track = this.find(id)
    if (!track) return
    if (track.chosenVideoId && this.options) {
      this.patch(id, { error: undefined, progress: 0 })
      this.setDownloading(true)
      this.enqueue(id)
    } else {
      this.patch(id, { status: 'searching', error: undefined })
      this.scheduleSearch(id)
    }
  }

  whenIdle(): Promise<void> {
    if (this.busy === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private scanFolder(options: DownloadOptions, then: () => void): void {
    this.scanning++
    this.work(async (isCurrent) => {
      let lookup: (track: Track) => string[] | null = () => null
      try {
        lookup = await this.deps.findExisting!(options)
      } catch {
        // A folder that can't be read just means nothing counts as already downloaded.
      }
      this.scanning--
      if (!isCurrent()) return
      this.applyFolder(lookup)
      then()
    })
  }

  private applyFolder(lookup: (track: Track) => string[] | null): void {
    for (const track of this.session.tracks) {
      if (this.forced.has(track.id) || ['queued', 'downloading', 'saved'].includes(track.status)) continue
      const files = lookup(track)
      if (files) {
        this.patch(track.id, { status: 'have', files, progress: 1, error: undefined })
      } else if (track.status === 'have') {
        this.patch(track.id, { status: 'searching', files: [], progress: 0 })
        this.scheduleEnrich(track.id)
        this.scheduleSearch(track.id)
      }
    }
  }

  private find(id: string): TrackState | undefined {
    return this.session.tracks.find((track) => track.id === id)
  }

  private patch(id: string, patch: Partial<TrackState>): void {
    const track = this.find(id)
    if (!track) return
    Object.assign(track, patch)
    this.emit('patch', id, patch)
  }

  private setDownloading(downloading: boolean): void {
    this.session.downloading = downloading
    this.emit('downloading', downloading)
  }

  // Runs background work that belongs to the current playlist, and drops its result if a new one has loaded.
  private work(job: (isCurrent: () => boolean) => Promise<void>): void {
    const generation = this.generation
    this.busy++
    job(() => generation === this.generation)
      .catch(() => {})
      .finally(() => {
        this.busy--
        this.maybeFinish()
        if (this.busy === 0) this.idleWaiters.splice(0).forEach((resolve) => resolve())
      })
  }

  private scheduleEnrich(id: string): void {
    let done = () => {}
    this.enriched.set(id, new Promise((resolve) => (done = resolve)))
    this.work(async (isCurrent) => {
      try {
        await this.enriches.run(async () => {
          const track = this.find(id)
          if (!track) return
          const extra = await this.deps.enrich(track)
          if (isCurrent()) this.patch(id, fillMissing(track, extra))
        })
      } finally {
        done()
      }
    })
  }

  private scheduleSearch(id: string): void {
    const signal = this.loadController.signal
    this.work(async (isCurrent) => {
      // With no length to compare, matching is much stronger once the lookup has supplied one.
      if (!this.find(id)?.durationMs) await this.enriched.get(id)
      await this.searches.run(async () => {
        const track = this.find(id)
        if (!track || !isCurrent() || track.status !== 'searching') return
        try {
          const ranked = rankCandidates(track, await this.deps.search(track, signal))
          // The folder scan may have found this track while the search was running.
          if (!isCurrent() || track.status !== 'searching') return
          const best = ranked[0]
          const status = statusForScore(best?.score ?? 0)
          this.patch(id, {
            candidates: ranked,
            status,
            chosenVideoId: status === 'missing' ? undefined : best.videoId,
            ...(status === 'missing' ? {} : fillMissing(track, { album: best.album, coverUrl: best.thumbnail }))
          })
          if (status !== 'missing' && this.session.downloading) this.enqueue(id)
        } catch (error) {
          if (isCurrent() && track.status === 'searching') this.patch(id, { status: 'failed', error: (error as Error).message })
        }
      })
    })
  }

  private settledStatus(track: TrackState): TrackState['status'] {
    if (this.handPicked.has(track.id)) return 'found'
    const chosen = track.candidates.find((candidate) => candidate.videoId === track.chosenVideoId)
    return statusForScore(chosen?.score ?? 0)
  }

  private enqueue(id: string): void {
    this.patch(id, { status: 'queued', progress: 0 })
    this.work(async (isCurrent) => {
      await this.downloads.run(async () => {
        const track = this.find(id)
        const options = this.options
        if (!track || !options || !isCurrent() || !this.session.downloading) return
        if (!track.chosenVideoId) return
        this.patch(id, { status: 'downloading' })
        await this.enriched.get(id)

        const controller = new AbortController()
        this.controllers.add(controller)
        try {
          const files = await this.downloadBestAvailable(track, options, controller.signal, isCurrent)
          if (isCurrent()) this.patch(id, { status: 'saved', progress: 1, files, error: undefined })
        } catch (error) {
          if (!isCurrent()) return
          if (controller.signal.aborted) this.patch(id, { status: this.settledStatus(track), progress: 0 })
          else this.patch(id, { status: 'failed', progress: 0, error: (error as Error).message })
        } finally {
          this.controllers.delete(controller)
        }
      })
    })
  }

  // The chosen result gets a second try for network blips. After that, other good matches get one try
  // each, because some videos can't be downloaded at all. Results you picked by hand are never swapped.
  private async downloadBestAvailable(track: TrackState, options: DownloadOptions, signal: AbortSignal, isCurrent: () => boolean): Promise<string[]> {
    const onProgress = (progress: number) => {
      if (isCurrent()) this.patch(track.id, { progress })
    }
    const chosen = track.candidates.find((candidate) => candidate.videoId === track.chosenVideoId)
    if (!chosen) throw new Error('No result is selected for this track.')
    const force = this.forced.has(track.id)
    const attempt = (candidate: Candidate) => this.deps.download(track, candidate, options, onProgress, signal, force)

    let firstError: unknown
    try {
      return await attempt(chosen)
    } catch (error) {
      firstError = error
      if (signal.aborted) throw error
    }
    try {
      return await attempt(chosen)
    } catch (error) {
      if (signal.aborted) throw error
    }

    if (!this.handPicked.has(track.id)) {
      const alternatives = track.candidates
        .filter((candidate) => candidate.videoId !== chosen.videoId && statusForScore(candidate.score) !== 'missing')
        .filter((candidate, index, list) => list.findIndex((item) => item.videoId === candidate.videoId) === index)
        .slice(0, MAX_ALTERNATIVES)
      for (const candidate of alternatives) {
        try {
          const files = await attempt(candidate)
          if (isCurrent()) this.patch(track.id, { chosenVideoId: candidate.videoId })
          return files
        } catch (error) {
          if (signal.aborted) throw error
        }
      }
    }
    throw firstError
  }

  private maybeFinish(): void {
    if (!this.session.downloading || !this.options || this.scanning > 0) return
    const unsettled = this.session.tracks.some((track) => ['searching', 'queued', 'downloading'].includes(track.status))
    if (unsettled) return
    const session = this.session
    const options = this.options
    this.setDownloading(false)
    const count = (status: TrackState['status']) => session.tracks.filter((track) => track.status === status).length
    const summary: RunSummary = {
      saved: count('saved'),
      had: count('have'),
      failed: count('failed'),
      missing: count('missing'),
      folder: playlistFolder(options.outDir, session.name)
    }
    this.work(async () => {
      await this.deps.finish(session, options)
      this.emit('done', summary)
    })
  }
}
