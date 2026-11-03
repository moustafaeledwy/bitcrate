import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage, shell } from 'electron'
import { SPOTIFY_REDIRECT_PORT, SPOTIFY_REDIRECT_URI } from '../shared/spotify'
import { authorizeUrl, createPkce, exchangeCode, isClientId, refreshTokens, startAuthListener, type AuthListener, type Tokens } from './core/spotifyAuth'

const SIGN_IN_TIMEOUT = 5 * 60 * 1000
const REFRESH_MARGIN = 60 * 1000

const tokenFile = () => join(app.getPath('userData'), 'spotify-token.bin')

let tokens: Tokens | null = null
let tokenClientId = ''
let refreshing: Promise<Tokens> | null = null
let listener: AuthListener | null = null

function loadTokens(): Tokens | null {
  if (tokens || !existsSync(tokenFile()) || !safeStorage.isEncryptionAvailable()) return tokens
  try {
    tokens = JSON.parse(safeStorage.decryptString(readFileSync(tokenFile())))
  } catch {
    tokens = null
  }
  return tokens
}

// Encrypted with Windows' per-user storage. Without it the sign-in simply lasts until the app closes.
async function saveTokens(next: Tokens): Promise<void> {
  tokens = next
  if (safeStorage.isEncryptionAvailable()) await writeFile(tokenFile(), safeStorage.encryptString(JSON.stringify(next)))
}

export const isConnected = () => loadTokens() !== null

export function setClientId(clientId: string | undefined): void {
  tokenClientId = clientId ?? ''
}

// Opens the normal browser, where Spotify handles the password, Google sign-in and any captcha.
export async function connect(clientId: string): Promise<void> {
  const id = clientId.trim()
  if (!isClientId(id)) throw new Error('That is not a Client ID. It should be 32 letters and numbers, from your app page on Spotify.')
  listener?.close()
  const { verifier, challenge } = createPkce()
  const state = randomBytes(16).toString('hex')
  const current = await startAuthListener({ port: SPOTIFY_REDIRECT_PORT, state, timeoutMs: SIGN_IN_TIMEOUT })
  listener = current
  try {
    await shell.openExternal(authorizeUrl(id, SPOTIFY_REDIRECT_URI, challenge, state))
    const code = await current.code
    await saveTokens(await exchangeCode({ code, verifier, clientId: id, redirectUri: SPOTIFY_REDIRECT_URI }))
    tokenClientId = id
  } finally {
    if (listener === current) listener = null
  }
}

export async function disconnect(): Promise<void> {
  tokens = null
  await rm(tokenFile(), { force: true })
}

export async function getAccessToken(): Promise<string> {
  const current = loadTokens()
  if (!current) throw new Error('Connect Spotify first.')
  if (current.expiresAt - Date.now() > REFRESH_MARGIN) return current.accessToken
  // Spotify replaces the refresh token on use, so parallel requests must share one refresh.
  refreshing ??= refreshTokens(current, tokenClientId)
    .then(async (next) => {
      await saveTokens(next)
      return next
    })
    .catch(async (error) => {
      await disconnect()
      throw new Error(`Your Spotify connection has expired. Connect Spotify again. (${error.message})`)
    })
    .finally(() => {
      refreshing = null
    })
  return (await refreshing).accessToken
}
