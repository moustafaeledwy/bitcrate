import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Settings } from '../../../shared/types'
import { errorText } from '../lib/store'
import { PixelSwitch } from './PixelSwitch'

interface Props {
  open: boolean
  settings: Settings
  connected: boolean
  onOpenChange: (open: boolean) => void
  onChange: (patch: Partial<Settings>) => void
  onConnect: () => void
  onDisconnect: () => void
}

export function SettingsDialog({ open, settings, connected, onOpenChange, onChange, onConnect, onDisconnect }: Props) {
  const [updating, setUpdating] = useState(false)
  const [result, setResult] = useState('')

  const update = async () => {
    setUpdating(true)
    setResult('')
    try {
      setResult(`Updated to yt-dlp ${await window.api.updateDownloader()}.`)
    } catch (error) {
      setResult(errorText(error))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-navy bg-cream shadow-[6px_6px_0_var(--navy)]">
        <DialogHeader>
          <DialogTitle className="font-pixel text-2xl font-semibold">Settings</DialogTitle>
          <DialogDescription className="sr-only">Sound and downloader settings</DialogDescription>
        </DialogHeader>
        <label className="flex cursor-pointer items-center gap-2 font-bold">
          <PixelSwitch checked={settings.sound} onCheckedChange={(sound) => onChange({ sound })} />
          Play a sound when a crate finishes
        </label>
        <section>
          <h3 className="font-bold">Spotify account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected ? 'BitCrate can read your playlists. It keeps the sign-in encrypted on this PC.' : 'Connect to see your playlists here and get every track in the ones you own.'}
          </p>
          <button type="button" className="btn mt-3" onClick={connected ? onDisconnect : onConnect}>
            {connected ? 'Disconnect Spotify' : 'Connect Spotify'}
          </button>
        </section>
        <section>
          <h3 className="font-bold">Update the downloader</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            YouTube changes often. If downloads start failing, get the latest yt-dlp from its GitHub page.
          </p>
          <button type="button" className="btn mt-3" disabled={updating} onClick={() => void update()}>
            {updating ? 'Updating' : 'Update yt-dlp'}
          </button>
          {result && <p className="mt-2 text-sm font-bold">{result}</p>}
        </section>
      </DialogContent>
    </Dialog>
  )
}
