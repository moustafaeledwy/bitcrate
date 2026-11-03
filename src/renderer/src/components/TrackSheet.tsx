import { ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { TrackState } from '../../../shared/types'
import { formatLength } from '../lib/store'
import { PixelCover } from './PixelCover'
import { StatusChip } from './TrackTable'

function Fact({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '') return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  )
}

interface Props {
  track: TrackState | undefined
  onClose: () => void
}

export function TrackSheet({ track, onClose }: Props) {
  return (
    <Sheet open={!!track} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="!top-9 !h-[calc(100%-36px)] w-[480px] overflow-y-auto border-t-2 border-l-2 border-navy bg-cream p-0 sm:max-w-[480px]">
        {track && (
          <>
            <SheetHeader className="flex-row gap-4 bg-navy p-5 pr-12 text-cream">
              <span className="block h-24 w-24 flex-none border-2 border-cream">
                <PixelCover url={track.coverUrl} resolution="full" emptyClass="dither-tile" />
              </span>
              <span className="min-w-0">
                <SheetTitle className="font-pixel text-2xl leading-tight font-semibold text-cream">{track.title}</SheetTitle>
                <SheetDescription className="mt-1 text-cream">{track.artists.join(', ')}</SheetDescription>
                <span className="mt-2 block text-navy">
                  <StatusChip status={track.status} />
                </span>
              </span>
            </SheetHeader>

            <div className="space-y-6 p-5">
              {track.error && (
                <div className="border-2 border-navy bg-white p-3">
                  <p className="font-bold text-red">{track.error}</p>
                  <button type="button" className="btn mt-3" onClick={() => void window.api.retry(track.id)}>
                    Try again
                  </button>
                </div>
              )}

              <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-sm">
                <Fact label="Album" value={track.album} />
                <Fact label="Year" value={track.year} />
                <Fact label="Track" value={track.trackNumber} />
                <Fact label="Disc" value={track.discNumber} />
                <Fact label="Length" value={formatLength(track.durationMs)} />
                <Fact label="BPM" value={track.bpm} />
                <Fact label="ISRC" value={track.isrc} />
              </dl>

              {track.files.length > 0 && (
                <section>
                  <h3 className="font-pixel text-lg font-semibold">{track.status === 'have' ? 'Already in your folder' : 'Saved to'}</h3>
                  <ul className="mt-1 space-y-1 text-sm break-all">
                    {track.files.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                  {track.status === 'have' && (
                    <button type="button" className="btn mt-3" onClick={() => void window.api.downloadAgain(track.id)}>
                      Download again
                    </button>
                  )}
                </section>
              )}

              <section>
                <h3 className="font-pixel text-lg font-semibold">Where it comes from</h3>
                {track.candidates.length === 0 && track.status === 'have' && <p className="mt-2 text-sm">Your own file, so BitCrate didn't search for it.</p>}
                {track.candidates.length === 0 && track.status !== 'searching' && track.status !== 'have' && (
                  <div className="mt-2">
                    <p className="text-sm">YouTube Music had no results for this track.</p>
                    {!track.error && (
                      <button type="button" className="btn mt-3" onClick={() => void window.api.retry(track.id)}>
                        Search again
                      </button>
                    )}
                  </div>
                )}
                <ul className="mt-2 space-y-2">
                  {track.candidates.slice(0, 8).map((candidate) => {
                    const chosen = candidate.videoId === track.chosenVideoId
                    return (
                      <li key={`${candidate.kind}-${candidate.videoId}`} className={`border-2 border-navy p-3 ${chosen ? 'bg-lime' : 'bg-white'}`}>
                        <p className="font-bold">{candidate.title}</p>
                        <p className="text-sm">{candidate.artists.join(', ')}</p>
                        <p className="text-sm text-navy/70">
                          {candidate.kind === 'song' ? 'YouTube Music song' : 'YouTube video'}
                          {candidate.durationS ? `, ${formatLength(candidate.durationS * 1000)}` : ''}, {candidate.score}% match
                        </p>
                        <div className="mt-2 flex gap-2">
                          {chosen ? (
                            <span className="px-1 py-1.5 font-bold">In use</span>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              disabled={track.status === 'downloading'}
                              onClick={() => void window.api.choose(track.id, candidate.videoId)}
                            >
                              Use this one
                            </button>
                          )}
                          <button type="button" className="btn" onClick={() => void window.api.openVideo(candidate.videoId)}>
                            <ExternalLink className="size-4" aria-hidden="true" />
                            Listen
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
