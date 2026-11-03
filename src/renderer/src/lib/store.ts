import { useEffect, useState } from 'react'
import type { RunSummary, Session, Settings } from '../../../shared/types'

const EMPTY: Session = { name: '', tracks: [], downloading: false }

export function useApp() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [session, setSession] = useState<Session>(EMPTY)
  const [summary, setSummary] = useState<RunSummary | null>(null)

  useEffect(() => {
    void window.api.getState().then((state) => {
      setSettings(state.settings)
      setSession(state.session)
    })
    const unsubscribe = [
      window.api.onSession((next) => {
        setSummary(null)
        setSession(next)
      }),
      window.api.onPatches((patches) => {
        const byId = new Map(patches.map(({ id, patch }) => [id, patch]))
        setSession((current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            const patch = byId.get(track.id)
            return patch ? { ...track, ...patch } : track
          })
        }))
      }),
      window.api.onDownloading((downloading) => {
        if (downloading) setSummary(null)
        setSession((current) => ({ ...current, downloading }))
      }),
      window.api.onDone(setSummary)
    ]
    return () => unsubscribe.forEach((stop) => stop())
  }, [])

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current))
    void window.api.saveSettings(patch)
  }

  return { settings, session, summary, setSummary, updateSettings }
}

export const errorText = (error: unknown) =>
  String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export function formatLength(ms?: number): string {
  if (!ms) return ''
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
