import { readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import type { Settings } from '../shared/types'

export const optionsSchema = z.object({
  outDir: z.string().min(1),
  format: z.enum(['m4a', 'mp3', 'both']),
  splitByFormat: z.boolean(),
  concurrency: z.number().int().min(1).max(8)
})

const settingsSchema = optionsSchema.extend({
  sound: z.boolean(),
  spotifyClientId: z.string().optional(),
  recent: z.array(z.object({ name: z.string(), link: z.string(), count: z.number() })).max(8)
})

const file = () => join(app.getPath('userData'), 'settings.json')

const defaults = (): Settings => ({
  outDir: join(app.getPath('music'), 'BitCrate'),
  format: 'm4a',
  splitByFormat: false,
  concurrency: 4,
  sound: true,
  recent: []
})

export function loadSettings(): Settings {
  try {
    return settingsSchema.parse({ ...defaults(), ...JSON.parse(readFileSync(file(), 'utf8')) })
  } catch {
    return defaults()
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const partial = `${file()}.part`
  await writeFile(partial, JSON.stringify(settings, null, 2))
  await rename(partial, file())
}
