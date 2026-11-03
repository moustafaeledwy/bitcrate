// Clicks with the real Windows mouse, because in-app test clicks skip the window's drag regions.
// Usage: node scripts/real-click-check.mjs <work folder> <spotify playlist link>
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

const [work, link] = process.argv.slice(2)
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
const app = await electron.launch({ args: ['.'], env: { ...env, BITCRATE_USER_DATA: join(work, 'ud') } })
const page = await app.firstWindow()
await page.getByRole('heading', { name: /Paste a playlist/ }).waitFor()

const mouseClick = (x, y) =>
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Add-Type -Name M -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);'; [W.M]::SetCursorPos(${x},${y}); Start-Sleep -Milliseconds 150; [W.M]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [W.M]::mouse_event(4,0,0,0,0)`
  ])

async function realClick(locator) {
  const box = await locator.boundingBox()
  const point = await app.evaluate(({ BrowserWindow, screen }, { x, y }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setAlwaysOnTop(true)
    win.focus()
    const bounds = win.getContentBounds()
    return screen.dipToScreenPoint({ x: bounds.x + x, y: bounds.y + y })
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await page.waitForTimeout(250)
  mouseClick(Math.round(point.x), Math.round(point.y))
  await page.waitForTimeout(500)
}

const report = async (name, passed) => console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)

await realClick(page.getByRole('button', { name: 'Connect Spotify' }))
const dialogOpened = await page.getByLabel('Redirect URI').isVisible()
await report('opens the Connect dialog', dialogOpened)

if (!dialogOpened) await page.getByRole('button', { name: 'Connect Spotify' }).click()
await page.getByLabel('Redirect URI').waitFor()
await page.waitForTimeout(300)

await realClick(page.getByRole('button', { name: 'Copy' }))
await report('Copy button inside the dialog', await page.getByRole('button', { name: 'Copied' }).isVisible())

await realClick(page.getByLabel('Client ID'))
await report('Client ID box takes focus', await page.getByLabel('Client ID').evaluate((el) => el === document.activeElement))

await realClick(page.getByRole('button', { name: 'Close' }))
await report('closes the dialog', !(await page.getByLabel('Redirect URI').isVisible()))

// With a playlist loaded: the header sits inside the window-moving strip, and each popup must still work.
await page.getByLabel('Spotify playlist or album link').fill(link)
await page.getByRole('button', { name: 'Load crate' }).click()
await page.getByTestId('track-row').first().waitFor({ timeout: 60000 })
await page.waitForTimeout(500)

await realClick(page.getByRole('button', { name: 'Settings' }))
await report('header Settings button', await page.getByRole('heading', { name: 'Settings' }).isVisible())
await realClick(page.getByRole('switch').last())
await report('switch inside Settings', (await page.getByRole('switch').last().getAttribute('aria-checked')) === 'false')
await realClick(page.getByRole('button', { name: 'Close' }))
await report('closes Settings', !(await page.getByRole('heading', { name: 'Settings' }).isVisible()))

await realClick(page.getByLabel('Spotify playlist or album link'))
await report('link box in the header takes focus', await page.getByLabel('Spotify playlist or album link').evaluate((el) => el === document.activeElement))

await realClick(page.getByTestId('track-row').first())
const sheet = page.locator('[data-slot="sheet-content"]')
await report('track details panel opens', await sheet.isVisible())
await realClick(sheet.getByRole('button', { name: 'Close' }))
await page.waitForTimeout(500)
await report('track details panel closes and the app stays open', !(await sheet.isVisible()))

const position = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().x)
const before = await position()
const grab = await app.evaluate(({ BrowserWindow, screen }) => {
  const bounds = BrowserWindow.getAllWindows()[0].getContentBounds()
  // An empty part of the strip. The top few pixels of a window are its resize border.
  return screen.dipToScreenPoint({ x: bounds.x + 800, y: bounds.y + 20 })
})
execFileSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  `Add-Type -Name D -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,int e);'; [W.D]::SetCursorPos(${Math.round(grab.x)},${Math.round(grab.y)}); Start-Sleep -Milliseconds 150; [W.D]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 150; for ($i=1; $i -le 10; $i++) { [W.D]::mouse_event(1,([uint32]::MaxValue-11),0,0,0); Start-Sleep -Milliseconds 40 }; Start-Sleep -Milliseconds 100; [W.D]::mouse_event(4,0,0,0,0)`
])
await page.waitForTimeout(400)
await report('top strip moves the window', (await position()) !== before)

await app.close()
