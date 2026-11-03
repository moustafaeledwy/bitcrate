import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { expect, test } from 'vitest'

test('the app opens on the paste screen and rejects a bad link', async () => {
  // VS Code terminals set ELECTRON_RUN_AS_NODE, which would make Electron run as plain Node.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
  const app = await electron.launch({
    args: [join(__dirname, '..')],
    env: { ...(env as Record<string, string>), BITCRATE_USER_DATA: mkdtempSync(join(tmpdir(), 'bitcrate-smoke-')) }
  })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: /Paste a playlist/ }).waitFor()
  await page.getByLabel('Spotify playlist or album link').fill('https://example.com/nope')
  await page.getByRole('button', { name: 'Load crate' }).click()
  await page.getByText(/Paste a Spotify playlist or album link/).waitFor()
  expect(await page.getByRole('heading', { name: /Paste a playlist/ }).isVisible()).toBe(true)

  await page.getByRole('button', { name: 'Connect Spotify' }).click()
  expect(await page.getByLabel('Redirect URI').inputValue()).toBe('http://127.0.0.1:43827/callback')
  await page.getByLabel('Client ID').fill('not an id')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByText(/not a Client ID/).waitFor()

  // Windows sends clicks on a drag region to the title bar, even with a popup on top. Test clicks miss
  // this, so check the styles directly. scripts/real-click-check.mjs tests it with the real mouse.
  const region = (selector: string) =>
    page.evaluate((target) => getComputedStyle(document.querySelector(target)!).getPropertyValue('-webkit-app-region'), selector)
  expect(await region('[data-slot="dialog-content"]')).toBe('no-drag')
  expect(await region('[data-slot="dialog-overlay"]')).toBe('no-drag')
  const dragHeights = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region') === 'drag')
      .map((element) => element.getBoundingClientRect().height)
  )
  expect(dragHeights.every((height) => height <= 36)).toBe(true)
  await app.close()
})
