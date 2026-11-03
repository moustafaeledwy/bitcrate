import { ListMusic, Settings as SettingsIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FilePick } from '../../shared/ipc'
import type { AccountPlaylist, TrackState } from '../../shared/types'
import { ConnectDialog } from './components/ConnectDialog'
import { Controls } from './components/Controls'
import { PixelCover } from './components/PixelCover'
import { PlaylistGrid } from './components/PlaylistGrid'
import { Record } from './components/Record'
import { SettingsDialog } from './components/SettingsDialog'
import { TrackSheet } from './components/TrackSheet'
import { isWeakMatch, TrackTable } from './components/TrackTable'
import { Wall } from './components/Wall'
import { playJingle } from './lib/jingle'
import { errorText, useApp } from './lib/store'

type Filter = 'all' | 'review' | 'missing' | 'failed' | 'saved' | 'have'

const FILTERS: { value: Filter; label: string; matches: (track: TrackState) => boolean }[] = [
  { value: 'all', label: 'All', matches: () => true },
  { value: 'review', label: 'Check match', matches: (track) => track.status === 'review' || (track.status === 'saved' && isWeakMatch(track)) },
  { value: 'missing', label: 'Not found', matches: (track) => track.status === 'missing' },
  { value: 'failed', label: 'Failed', matches: (track) => track.status === 'failed' },
  { value: 'saved', label: 'Saved', matches: (track) => track.status === 'saved' },
  { value: 'have', label: 'Already have', matches: (track) => track.status === 'have' }
]

function ChunkBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return (
    <div className="w-44">
      <p className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-pixel tabular-nums">
          {value}/{total}
        </span>
      </p>
      <div className="chunks mt-0.5" style={{ '--chunk': color } as React.CSSProperties}>
        <span style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
      </div>
    </div>
  )
}

export function App() {
  const { settings, session, summary, setSummary, updateSettings } = useApp()
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [playlists, setPlaylists] = useState<AccountPlaylist[]>([])
  const [playlistsLoading, setPlaylistsLoading] = useState(false)
  const [choices, setChoices] = useState<FilePick['choices']>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const tracks = session.tracks
  const counts = useMemo(() => {
    const has = (...statuses: TrackState['status'][]) => tracks.filter((track) => statuses.includes(track.status)).length
    return {
      searching: has('searching'),
      ready: has('found', 'review') + tracks.filter((track) => track.status === 'failed' && track.chosenVideoId).length,
      saved: has('saved', 'have'),
      located: tracks.filter((track) => track.chosenVideoId || track.status === 'have').length
    }
  }, [tracks])

  const visible = useMemo(() => tracks.filter(FILTERS.find((item) => item.value === filter)!.matches), [tracks, filter])
  const opened = tracks.find((track) => track.id === openId)
  const working = session.downloading || counts.searching > 0

  useEffect(() => {
    if (summary && settings?.sound) playJingle()
    // Only when a run finishes, not when settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  const refreshAccount = useCallback(async () => {
    const status = await window.api.spotifyStatus()
    setConnected(status.connected)
    if (!status.connected) {
      setPlaylists([])
      return
    }
    setPlaylistsLoading(true)
    try {
      setPlaylists(await window.api.myPlaylists())
    } catch (error) {
      toast.error(errorText(error))
      setConnected((await window.api.spotifyStatus()).connected)
    } finally {
      setPlaylistsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAccount()
  }, [refreshAccount])

  const loadLink = async (value: string) => {
    setLoading(true)
    try {
      await window.api.loadLink(value)
      setFilter('all')
      setLink('')
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (link.trim()) void loadLink(link)
  }

  const pickPlaylist = (playlist: AccountPlaylist) => {
    setPickerOpen(false)
    void loadLink(`https://open.spotify.com/playlist/${playlist.id}`)
  }

  const openFile = async () => {
    try {
      const pick = await window.api.openFile()
      if (pick.choices) setChoices(pick.choices)
      else if (!pick.cancelled) setFilter('all')
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const start = async () => {
    if (!settings) return
    const { outDir, format, splitByFormat, concurrency } = settings
    try {
      await window.api.start({ outDir, format, splitByFormat, concurrency })
    } catch (error) {
      toast.error(errorText(error))
    }
  }

  const pickFromWall = (id: string) => {
    setFilter('all')
    setFocusId(id)
    setOpenId(id)
  }

  const linkForm = (large: boolean) => (
    <form onSubmit={submit} className={`no-drag flex gap-3 ${large ? 'w-full max-w-xl' : 'w-full max-w-lg'}`}>
      <input
        value={link}
        onChange={(event) => setLink(event.target.value)}
        aria-label="Spotify playlist or album link"
        placeholder="https://open.spotify.com/playlist/..."
        className={`min-w-0 flex-1 border-2 border-cream bg-white px-3 text-navy placeholder:text-navy/50 ${large ? 'py-3 text-base' : 'py-1.5 text-sm'}`}
      />
      <button type="submit" className={large ? 'btn btn-go' : 'btn'} disabled={loading || !link.trim()}>
        {loading ? 'Loading' : 'Load crate'}
      </button>
    </form>
  )

  const settingsButton = (
    <button type="button" aria-label="Settings" className="no-drag btn !border-cream !bg-navy !p-1.5 !text-cream" onClick={() => setSettingsOpen(true)}>
      <SettingsIcon className="size-4" aria-hidden="true" />
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      {/* The only part of the page that moves the window. Keep it thin: Windows gives clicks on it to the
          title bar even when a popup is showing on top. */}
      <div className="drag fixed top-0 right-0 left-0 z-0 h-9" aria-hidden="true" />
      {session.name ? (
        <>
          <header className="on-navy flex-none bg-navy px-6 pt-2 pb-4 text-cream">
            <div className="relative z-10 flex h-9 items-center gap-3 pr-36">
              <Record size={26} spinning={working} />
              <span className="font-pixel text-xl font-semibold">BitCrate</span>
              <div className="ml-4 flex-1">{linkForm(false)}</div>
              <button
                type="button"
                className="no-drag btn !border-cream !bg-navy !px-2 !py-1 !text-sm !text-cream"
                onClick={() => (connected ? setPickerOpen(true) : setConnectOpen(true))}
              >
                <ListMusic className="size-4" aria-hidden="true" />
                {connected ? 'Your playlists' : 'Connect Spotify'}
              </button>
              {settingsButton}
            </div>
            <div className="mt-3 flex items-start gap-5">
              <span className="block h-[116px] w-[116px] flex-none border-2 border-cream">
                <PixelCover url={session.coverUrl ?? tracks[0]?.coverUrl} resolution={summary ? 'full' : 24} emptyClass="dither-tile" />
              </span>
              <div className="w-64 flex-none">
                <h1 className="font-pixel text-3xl leading-none font-semibold break-words line-clamp-2">{session.name}</h1>
                <div className="mt-3 space-y-1.5">
                  <ChunkBar label="Found" value={counts.located} total={tracks.length} color="var(--lime)" />
                  <ChunkBar label="Saved" value={counts.saved} total={tracks.length} color="var(--yellow)" />
                </div>
              </div>
              <Wall tracks={tracks} onPick={pickFromWall} />
            </div>
          </header>
          <div className="dither" />

          <main className="flex min-h-0 flex-1 flex-col bg-cream">
            {session.warning && (
              <div className="flex items-center gap-4 border-b-2 border-navy bg-yellow px-6 py-2 text-sm">
                <p className="flex-1 font-bold">{session.warning}</p>
                {session.connectHelps && (
                  <button type="button" className="btn flex-none" disabled={session.downloading} onClick={() => setConnectOpen(true)}>
                    Connect Spotify
                  </button>
                )}
                <button type="button" className="btn flex-none" onClick={() => void openFile()}>
                  Open a CSV
                </button>
              </div>
            )}
            {summary && (
              <div data-testid="summary" className="flex items-center gap-4 border-b-2 border-navy bg-lime px-6 py-2">
                <p className="flex-1">
                  <span className="font-pixel text-xl font-semibold">Crate saved!</span>{' '}
                  {summary.saved} saved
                  {summary.had > 0 && `, ${summary.had} already in your folder`}
                  {summary.missing > 0 && `, ${summary.missing} not found`}
                  {summary.failed > 0 && `, ${summary.failed} failed`}.
                </p>
                <button type="button" className="btn" onClick={() => void window.api.openOutput()}>
                  Open folder
                </button>
                <button type="button" className="btn" onClick={() => setSummary(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {settings && (
              <Controls
                settings={settings}
                ready={counts.ready}
                downloading={session.downloading}
                onChange={updateSettings}
                onStart={() => void start()}
                onStop={() => void window.api.cancel()}
              />
            )}
            <div role="tablist" aria-label="Filter tracks" className="flex gap-1 px-6 pb-2">
              {FILTERS.map((item) => {
                const count = tracks.filter(item.matches).length
                if (item.value !== 'all' && count === 0 && filter !== item.value) return null
                const selected = filter === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setFilter(item.value)}
                    className={`cursor-pointer px-2 py-0.5 text-sm font-bold ${selected ? 'bg-hyper text-white' : 'hover:bg-white'}`}
                  >
                    {item.label} {count}
                  </button>
                )
              })}
            </div>
            <TrackTable tracks={visible} focusId={focusId} onOpen={setOpenId} />
          </main>
        </>
      ) : (
        <>
          <div className={`on-navy flex flex-col bg-navy px-16 text-cream ${connected ? 'flex-none pt-3 pb-6' : 'min-h-0 flex-1 pt-10 pb-12'}`}>
            <div className="relative z-10 flex h-9 items-center gap-3 pr-24">
              <Record size={26} />
              <span className="font-pixel text-xl font-semibold">BitCrate</span>
              <span className="flex-1" />
              {settingsButton}
            </div>
            <div className={`flex items-center justify-between gap-12 ${connected ? 'mt-2' : 'flex-1'}`}>
              <div className="min-w-0 flex-1">
                <h1 className={`font-pixel leading-[0.95] font-semibold ${connected ? 'text-5xl' : 'text-7xl'}`}>
                  Paste a playlist.
                  <br />
                  Get a crate.
                </h1>
                {!connected && (
                  <p className="mt-5 max-w-lg text-lg">
                    BitCrate finds every track from a Spotify playlist on YouTube Music, then saves it with its cover, artist and album.
                  </p>
                )}
                <div className={connected ? 'mt-4' : 'mt-7'}>{linkForm(true)}</div>
                <div className="no-drag mt-4 flex items-center gap-6">
                  {!connected && (
                    <button type="button" className="btn" onClick={() => setConnectOpen(true)}>
                      <ListMusic className="size-4" aria-hidden="true" />
                      Connect Spotify
                    </button>
                  )}
                  <button type="button" className="cursor-pointer font-bold underline underline-offset-4 hover:text-yellow" onClick={() => void openFile()}>
                    Or open a CSV or CSVMusic library
                  </button>
                </div>
              </div>
              <div className="flex-none">
                <Record size={connected ? 150 : 340} spinning />
              </div>
            </div>
          </div>
          <div className="dither" />
          {connected && (
            <section className="pixel-scroll min-h-0 flex-1 overflow-y-auto bg-cream px-16 pt-2 pb-8">
              <h2 className="font-pixel text-2xl font-semibold">Your playlists</h2>
              <PlaylistGrid playlists={playlists} loading={playlistsLoading} disabled={loading} onPick={pickPlaylist} />
            </section>
          )}
          {!connected && settings && settings.recent.length > 0 && (
            <section className="flex-none bg-cream px-16 pt-2 pb-8">
              <h2 className="font-pixel text-2xl font-semibold">Recent crates</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                {settings.recent.map((item) => (
                  <button key={item.link} type="button" className="btn" disabled={loading} onClick={() => void loadLink(item.link)}>
                    {item.name}
                    <span className="font-normal">{item.count} tracks</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <TrackSheet track={opened} onClose={() => setOpenId(null)} />
      {settings && (
        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          connected={connected}
          onOpenChange={setSettingsOpen}
          onChange={updateSettings}
          onConnect={() => {
            setSettingsOpen(false)
            setConnectOpen(true)
          }}
          onDisconnect={() => void window.api.spotifyDisconnect().then(refreshAccount)}
        />
      )}
      <ConnectDialog
        open={connectOpen}
        savedClientId={settings?.spotifyClientId}
        onOpenChange={setConnectOpen}
        onConnected={() => void refreshAccount()}
      />
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-2 border-navy bg-cream shadow-[6px_6px_0_var(--navy)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-pixel text-2xl font-semibold">Your playlists</DialogTitle>
            <DialogDescription className="sr-only">Choose a playlist to load</DialogDescription>
          </DialogHeader>
          <PlaylistGrid playlists={playlists} loading={playlistsLoading} disabled={loading || session.downloading} onPick={pickPlaylist} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!choices} onOpenChange={(open) => !open && setChoices(undefined)}>
        <DialogContent className="border-2 border-navy bg-cream shadow-[6px_6px_0_var(--navy)]">
          <DialogHeader>
            <DialogTitle className="font-pixel text-2xl font-semibold">Choose a playlist</DialogTitle>
            <DialogDescription>This file has {choices?.length} playlists in it.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {choices?.map((choice) => (
              <button
                key={choice.index}
                type="button"
                className="btn !justify-between"
                onClick={() => {
                  setChoices(undefined)
                  setFilter('all')
                  void window.api.loadChoice(choice.index)
                }}
              >
                {choice.name}
                <span className="font-normal">{choice.count} tracks</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
