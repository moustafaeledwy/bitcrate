// Drives the real app against a real playlist and saves screenshots.
// Usage: node scripts/live-check.mjs <spotify link> <work folder> [format] [concurrency] [split]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const [link, work, format = 'm4a', concurrency = '4', split = 'false'] = process.argv.slice(2)
const shots = join(work, 'shots')
const userData = join(work, 'user-data')
const music = join(work, 'music')
mkdirSync(shots, { recursive: true })
mkdirSync(userData, { recursive: true })
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({ outDir: music, format, splitByFormat: split === 'true', concurrency: Number(concurrency), sound: false, recent: [] })
)

const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
// Set BITCRATE_EXE to test the packaged app instead of the source.
const target = process.env.BITCRATE_EXE ? { executablePath: process.env.BITCRATE_EXE, args: [] } : { args: ['.'] }
const app = await electron.launch({ ...target, env: { ...env, BITCRATE_USER_DATA: userData } })
const page = await app.firstWindow()
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message))
await page.setViewportSize({ width: 1280, height: 860 }).catch(() => {})
const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`) })
const statuses = () =>
  page.evaluate(async () => {
    const { session } = await window.api.getState()
    const counts = {}
    for (const track of session.tracks) counts[track.status] = (counts[track.status] ?? 0) + 1
    return { counts, total: session.tracks.length, name: session.name, warning: session.warning, downloading: session.downloading }
  })

await page.getByRole('heading', { name: /Paste a playlist/ }).waitFor()
await shot('1-landing')

let t = Date.now()
await page.getByLabel('Spotify playlist or album link').fill(link)
await page.getByRole('button', { name: 'Load crate' }).click()
await page.getByTestId('wall').waitFor({ timeout: 240000 })
console.log(`Playlist loaded in ${Date.now() - t}ms`)
for (;;) {
  const { counts, total } = await statuses()
  if (total > 0 && !counts.searching) break
  await page.waitForTimeout(100)
}
console.log(`Search finished in ${Date.now() - t}ms`, JSON.stringify(await statuses()))
await page.waitForTimeout(600)
await shot('2-searched')

// Set SEARCH_ONLY=1 to stop before downloading anything.
if (process.env.SEARCH_ONLY) {
  const { warning, total } = await statuses()
  const filled = await page.evaluate(async () => {
    const { session } = await window.api.getState()
    const has = (key) => session.tracks.filter((track) => track[key]).length
    return { length: has('durationMs'), album: has('album'), cover: has('coverUrl') }
  })
  console.log(`Tracks ${total}`, JSON.stringify(filled), warning ?? 'no warning')
  await app.close()
  process.exit(0)
}

t = Date.now()
await page.getByTestId('download').click()
await page.waitForTimeout(6000)
await shot('3-downloading')
await page.getByTestId('summary').waitFor({ timeout: 560000 })
console.log(`Downloads finished in ${Date.now() - t}ms`, JSON.stringify(await statuses()))
await page.waitForTimeout(800)
await shot('4-done')

const failures = await page.evaluate(async () => {
  const { session } = await window.api.getState()
  return session.tracks
    .filter((track) => ['failed', 'missing', 'review'].includes(track.status))
    .map((track) => `${track.status}: ${track.artists.join(', ')} - ${track.title} [${track.candidates[0]?.score ?? 'none'}] ${track.candidates[0]?.title ?? ''} | ${track.candidates[0]?.artists?.join(', ') ?? ''} ${track.error ?? ''}`)
})
console.log(failures.join('\n'))

await page.getByTestId('track-row').first().click()
await page.waitForTimeout(400)
await shot('5-sheet')
await app.close()
