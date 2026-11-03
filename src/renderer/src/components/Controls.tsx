import { Folder, Minus, Plus } from 'lucide-react'
import type { Format, Settings } from '../../../shared/types'
import { PixelSwitch } from './PixelSwitch'

const FORMATS: { value: Format; label: string; help: string }[] = [
  { value: 'm4a', label: 'M4A', help: "YouTube's original audio, not re-encoded. The best choice for rekordbox." },
  { value: 'mp3', label: 'MP3', help: "Re-encoded to 320 kbps, for players that can't read M4A. It won't sound better than the M4A." },
  { value: 'both', label: 'Both', help: 'Saves an M4A and a 320 kbps MP3 of every track.' }
]

interface Props {
  settings: Settings
  ready: number
  downloading: boolean
  onChange: (patch: Partial<Settings>) => void
  onStart: () => void
  onStop: () => void
}

export function Controls({ settings, ready, downloading, onChange, onStart, onStop }: Props) {
  const chooseFolder = async () => {
    const folder = await window.api.chooseFolder()
    if (folder) onChange({ outDir: folder })
  }
  const help = FORMATS.find((format) => format.value === settings.format)?.help
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-6 pt-3 pb-4">
      <div className="w-[300px]">
        <div role="radiogroup" aria-label="Format" className="flex">
          {FORMATS.map((format) => {
            const selected = settings.format === format.value
            return (
              <button
                key={format.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={downloading}
                onClick={() => onChange({ format: format.value })}
                className={`-ml-0.5 cursor-pointer border-2 border-navy px-4 py-1 font-pixel text-lg first:ml-0 disabled:cursor-not-allowed ${selected ? 'bg-navy text-cream' : 'bg-white'}`}
              >
                {format.label}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{help}</p>
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 font-bold">
          <PixelSwitch
            checked={settings.splitByFormat}
            disabled={downloading}
            onCheckedChange={(splitByFormat) => onChange({ splitByFormat })}
          />
          Separate folders by format
        </label>
        <div className="flex items-center gap-2">
          <span className="font-bold">Downloads at once</span>
          <button
            type="button"
            aria-label="Fewer downloads at once"
            className="btn !p-1"
            disabled={downloading || settings.concurrency <= 1}
            onClick={() => onChange({ concurrency: settings.concurrency - 1 })}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="w-5 text-center font-pixel text-lg">{settings.concurrency}</span>
          <button
            type="button"
            aria-label="More downloads at once"
            className="btn !p-1"
            disabled={downloading || settings.concurrency >= 8}
            onClick={() => onChange({ concurrency: settings.concurrency + 1 })}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <button type="button" className="btn max-w-full" disabled={downloading} onClick={() => void chooseFolder()}>
          <Folder className="size-4 flex-none" aria-hidden="true" />
          <span className="truncate">Save to {settings.outDir}</span>
        </button>
      </div>

      {downloading ? (
        <button type="button" className="btn btn-go !bg-pink" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button type="button" data-testid="download" className="btn btn-go" disabled={ready === 0} onClick={onStart}>
          Download {ready} {ready === 1 ? 'track' : 'tracks'}
        </button>
      )}
    </div>
  )
}
