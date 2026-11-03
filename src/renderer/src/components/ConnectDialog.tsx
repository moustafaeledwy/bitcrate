import { Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SPOTIFY_REDIRECT_URI } from '../../../shared/spotify'
import { errorText } from '../lib/store'

interface Props {
  open: boolean
  savedClientId?: string
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

export function ConnectDialog({ open, savedClientId, onOpenChange, onConnected }: Props) {
  const [clientId, setClientId] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setClientId(savedClientId ?? '')
      setError('')
      setCopied(false)
    }
  }, [open, savedClientId])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWaiting(true)
    setError('')
    try {
      await window.api.spotifyConnect(clientId)
      onConnected()
      onOpenChange(false)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setWaiting(false)
    }
  }

  const copy = async () => {
    await window.api.copyRedirectUri()
    setCopied(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-2 border-navy bg-cream shadow-[6px_6px_0_var(--navy)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-pixel text-2xl font-semibold">Connect Spotify</DialogTitle>
          <DialogDescription className="text-navy">
            This shows your playlists here and reads every track in the ones you own. You only do it once, and you'll need Spotify Premium.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-5">
          <li>
            <h3 className="font-bold">1. Open Spotify's developer dashboard</h3>
            <p className="text-sm text-muted-foreground">Log in there with your normal Spotify account, including Google if you use it.</p>
            <button type="button" className="btn mt-2" onClick={() => void window.api.openSpotifyDashboard()}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open dashboard
            </button>
          </li>
          <li>
            <h3 className="font-bold">2. Create an app</h3>
            <p className="text-sm text-muted-foreground">
              Click Create app and name it anything, such as BitCrate. Check Web API. Paste this as the Redirect URI, click Add, then save.
            </p>
            <div className="mt-2 flex gap-3">
              <input readOnly value={SPOTIFY_REDIRECT_URI} aria-label="Redirect URI" className="min-w-0 flex-1 border-2 border-navy bg-white px-2 py-1 text-sm" />
              <button type="button" className="btn" onClick={() => void copy()}>
                <Copy className="size-4" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </li>
          <li>
            <h3 className="font-bold">3. Paste the Client ID</h3>
            <p className="text-sm text-muted-foreground">It's on your new app's page. Your browser then asks you to approve access. BitCrate can only read your playlists.</p>
            <form onSubmit={(event) => void submit(event)} className="mt-2 flex gap-3">
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                aria-label="Client ID"
                placeholder="Client ID"
                className="min-w-0 flex-1 border-2 border-navy bg-white px-2 py-1 text-sm"
              />
              <button type="submit" className="btn btn-go !py-1" disabled={waiting || !clientId.trim()}>
                {waiting ? 'Waiting' : 'Connect'}
              </button>
            </form>
            {waiting && <p className="mt-2 text-sm font-bold">Approve access in your browser, then come back here.</p>}
            {error && <p className="mt-2 text-sm font-bold text-red">{error}</p>}
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}
