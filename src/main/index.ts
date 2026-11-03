import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { TrackPatch } from '../shared/ipc'
import { SPOTIFY_REDIRECT_URI } from '../shared/spotify'
import type { DownloadOptions, FileFormat, ImportedPlaylist, RunSummary, Session, Settings, TrackState } from '../shared/types'
import { lookupDeezer } from './core/deezer'
import { Engine } from './core/engine'
import { parseCsvmusicLibrary, parseCsvPlaylist } from './core/imports'
import { buildIndex, findExisting, listAudioFiles } from './core/library'
import { m3uContent, outputFile, playlistFolder, safeName } from './core/paths'
import { spaced } from './core/pool'
import { fetchSpotify, parseSpotifyLink } from './core/spotify'
import { fetchMyPlaylists, fetchPlaylist, SpotifyForbidden } from './core/spotifyApi'
import { isVideoId, watchUrl } from './core/ytdlp'
import { downloadTrack } from './download'
import { searchTrack } from './search'
import { connect, disconnect, getAccessToken, isConnected, setClientId } from './spotifyAccount'
import { loadSettings, optionsSchema, saveSettings } from './store'
import { resolveTools, updateYtDlp } from './tools'

let win: BrowserWindow | null = null
let settings: Settings
let pendingChoices: ImportedPlaylist[] = []
let lastLink: string | null = null

const send = (channel: string, value: unknown) => win?.webContents.send(channel, value)

// One playlist file per format, which rekordbox can import directly. Tracks already in the
// folder are included where they are, even when they live in another playlist's folder.
async function writePlaylists(session: Session, options: DownloadOptions): Promise<void> {
  const kept = session.tracks.filter((track) => track.status === 'saved' || track.status === 'have')
  const formats: FileFormat[] = options.format === 'both' ? ['m4a', 'mp3'] : [options.format]
  for (const format of formats) {
    const entries = kept.flatMap((track) => {
      const file = track.files.find((path) => extname(path).toLowerCase() === `.${format}`) ?? (formats.length === 1 ? track.files[0] : undefined)
      return file ? [{ track, file }] : []
    })
    if (!entries.length) continue
    const folder = dirname(outputFile(options, session.name, format, entries[0].track))
    await mkdir(folder, { recursive: true })
    const suffix = formats.length > 1 && !options.splitByFormat ? ` ${format.toUpperCase()}` : ''
    await writeFile(
      join(folder, `${safeName(session.name)}${suffix}.m3u8`),
      m3uContent(entries.map(({ track, file }) => ({ track, file: relative(folder, file) })))
    )
  }
}

// Deezer publishes a limit of 50 requests every 5 seconds. Going over it would silently lose tags.
const deezerFetch = spaced(fetch, 110)

function createEngine(): Engine {
  const tools = resolveTools()
  const engine = new Engine({
    search: (track, signal) => searchTrack(track, tools, signal),
    enrich: (track) => lookupDeezer(track, deezerFetch),
    download: (track, candidate, options, onProgress, signal, force) =>
      downloadTrack(track, candidate, options, engine.snapshot().name, resolveTools(), onProgress, signal, force),
    findExisting: async (options) => {
      const index = buildIndex(await listAudioFiles(options.outDir))
      const name = engine.snapshot().name
      return (track) => findExisting(index, track, options, name)
    },
    finish: writePlaylists
  })

  // Row updates are grouped so a big playlist doesn't redraw the window for every progress tick.
  const pending = new Map<string, Partial<TrackState>>()
  const flush = () => {
    if (!pending.size) return
    const patches: TrackPatch[] = [...pending].map(([id, patch]) => ({ id, patch }))
    pending.clear()
    send('engine:patches', patches)
  }
  setInterval(flush, 120)

  engine.on('session', (session: Session) => {
    pending.clear()
    send('engine:session', session)
  })
  engine.on('patch', (id: string, patch: Partial<TrackState>) => {
    pending.set(id, { ...pending.get(id), ...patch })
  })
  engine.on('downloading', (downloading: boolean) => {
    flush()
    send('engine:downloading', downloading)
  })
  engine.on('done', (summary: RunSummary) => {
    flush()
    send('engine:done', summary)
  })
  return engine
}

function rememberLink(playlist: ImportedPlaylist): void {
  if (!playlist.link) return
  const entry = { name: playlist.name, link: playlist.link, count: playlist.tracks.length }
  settings = { ...settings, recent: [entry, ...settings.recent.filter((item) => item.link !== entry.link)].slice(0, 8) }
  void saveSettings(settings)
}

function registerHandlers(engine: Engine): void {
  ipcMain.handle('state:get', () => ({ settings, session: engine.snapshot() }))

  // Connected accounts get the full list from Spotify's API. Anything else uses the public pages.
  const readSpotify = async (link: string): Promise<ImportedPlaylist> => {
    const parsed = parseSpotifyLink(link)
    if (parsed.type !== 'playlist' || !isConnected()) return fetchSpotify(link)
    let reason = "Spotify only gives full track lists for playlists you own or collaborate on."
    try {
      return await fetchPlaylist(parsed.id, getAccessToken)
    } catch (error) {
      if (!(error instanceof SpotifyForbidden)) reason = (error as Error).message
    }
    const playlist = await fetchSpotify(link)
    if (!playlist.connectHelps) return playlist
    return {
      ...playlist,
      connectHelps: false,
      warning: `${reason} BitCrate read ${playlist.tracks.length}${playlist.totalReported ? ` of ${playlist.totalReported}` : ''} tracks. To get them all, copy them into a playlist of your own, or open a CSV from exportify.net.`
    }
  }

  const loadSpotify = async (link: string) => {
    lastLink = link
    const playlist = await readSpotify(link)
    rememberLink(playlist)
    engine.load(playlist, settings)
  }
  ipcMain.handle('crate:link', (_event, link: string) => loadSpotify(String(link)))

  ipcMain.handle('spotify:status', () => ({ connected: isConnected(), clientId: settings.spotifyClientId }))
  ipcMain.handle('spotify:connect', async (_event, clientId: string) => {
    await connect(String(clientId))
    settings = { ...settings, spotifyClientId: String(clientId).trim() }
    await saveSettings(settings)
    if (lastLink && !engine.snapshot().downloading) await loadSpotify(lastLink)
  })
  ipcMain.handle('spotify:disconnect', () => disconnect())
  ipcMain.handle('spotify:playlists', () => fetchMyPlaylists(getAccessToken))
  ipcMain.handle('spotify:dashboard', () => shell.openExternal('https://developer.spotify.com/dashboard'))
  ipcMain.handle('spotify:copyRedirect', () => clipboard.writeText(SPOTIFY_REDIRECT_URI))

  ipcMain.handle('crate:file', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open a playlist file',
      properties: ['openFile'],
      filters: [{ name: 'Playlist files', extensions: ['csv', 'json'] }]
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return { cancelled: true }
    const text = await readFile(path, 'utf8')
    if (extname(path).toLowerCase() === '.json') {
      pendingChoices = parseCsvmusicLibrary(text)
      if (pendingChoices.length > 1) {
        return { choices: pendingChoices.map((playlist, index) => ({ index, name: playlist.name, count: playlist.tracks.length })) }
      }
      engine.load(pendingChoices[0], settings)
      return {}
    }
    engine.load(parseCsvPlaylist(text, basename(path, extname(path))), settings)
    return {}
  })

  ipcMain.handle('crate:choice', (_event, index: number) => {
    const playlist = pendingChoices[index]
    if (!playlist) throw new Error('That playlist is no longer available. Open the file again.')
    engine.load(playlist, settings)
  })

  ipcMain.handle('run:start', async (_event, raw: unknown) => {
    const options = optionsSchema.parse(raw)
    settings = { ...settings, ...options }
    void saveSettings(settings)
    await mkdir(options.outDir, { recursive: true })
    engine.start(options)
  })
  ipcMain.handle('run:cancel', () => engine.cancel())
  ipcMain.handle('track:choose', (_event, id: string, videoId: string) => engine.choose(id, videoId))
  ipcMain.handle('track:retry', (_event, id: string) => engine.retry(id))
  ipcMain.handle('track:again', (_event, id: string) => engine.downloadAgain(id))

  ipcMain.handle('folder:choose', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose where to save music',
      defaultPath: settings.outDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('folder:open', async () => {
    const name = engine.snapshot().name
    const folder = name ? playlistFolder(settings.outDir, name) : settings.outDir
    const target = existsSync(folder) ? folder : settings.outDir
    await mkdir(target, { recursive: true })
    await shell.openPath(target)
  })
  ipcMain.handle('video:open', (_event, videoId: string) => {
    if (isVideoId(videoId)) void shell.openExternal(watchUrl(videoId))
  })

  ipcMain.handle('settings:save', async (_event, patch: Partial<Settings>) => {
    const { sound, outDir, format, splitByFormat, concurrency } = patch
    const allowed = { sound, outDir, format, splitByFormat, concurrency }
    const defined = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined))
    const folderChanged = (outDir && outDir !== settings.outDir) || (format && format !== settings.format)
    settings = { ...settings, ...defined }
    await saveSettings(settings)
    if (folderChanged) engine.checkFolder(settings)
    return settings
  })
  ipcMain.handle('tools:update', () => updateYtDlp())
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#10162F',
    title: 'BitCrate',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#10162F', symbolColor: '#FFF0E5', height: 36 },
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

// Lets the end-to-end test run with its own settings.
if (process.env.BITCRATE_USER_DATA) app.setPath('userData', process.env.BITCRATE_USER_DATA)

app.whenReady().then(() => {
  settings = loadSettings()
  setClientId(settings.spotifyClientId)
  registerHandlers(createEngine())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
