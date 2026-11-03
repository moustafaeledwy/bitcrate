import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES = 'playlist-read-private playlist-read-collaborative'

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export const isClientId = (text: string) => /^[0-9a-f]{32}$/i.test(text)

export const challengeFor = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString('base64url')
  return { verifier, challenge: challengeFor(verifier) }
}

export function authorizeUrl(clientId: string, redirectUri: string, challenge: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES
  })
  return `${AUTHORIZE_URL}?${query}`
}

export function parseCallback(url: string, state: string): string {
  const query = new URL(url, 'http://127.0.0.1').searchParams
  if (query.get('state') !== state) throw new Error('The sign-in response did not match this request. Try connecting again.')
  const error = query.get('error')
  if (error) throw new Error(error === 'access_denied' ? 'Connecting to Spotify was cancelled.' : `Spotify refused the sign-in: ${error}`)
  const code = query.get('code')
  if (!code) throw new Error('Spotify sent back no sign-in code. Try connecting again.')
  return code
}

async function requestTokens(form: Record<string, string>, fetcher: Fetcher, now: () => number, previousRefresh?: string): Promise<Tokens> {
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(20000)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Spotify refused the sign-in: ${data.error_description ?? data.error ?? response.status}`)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefresh,
    expiresAt: now() + data.expires_in * 1000
  }
}

export function exchangeCode(
  { code, verifier, clientId, redirectUri, now = Date.now }: { code: string; verifier: string; clientId: string; redirectUri: string; now?: () => number },
  fetcher: Fetcher = fetch
): Promise<Tokens> {
  return requestTokens({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }, fetcher, now)
}

export function refreshTokens(tokens: Tokens, clientId: string, fetcher: Fetcher = fetch, now: () => number = Date.now): Promise<Tokens> {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId }, fetcher, now, tokens.refreshToken)
}

const page = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>BitCrate</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#10162F;color:#FFF0E5;font:18px system-ui"><p>${message}</p>`

export interface AuthListener {
  port: number
  code: Promise<string>
  close(): void
}

// Waits on this computer only for Spotify to send the browser back with a sign-in code.
export function startAuthListener({ port, state, timeoutMs }: { port: number; state: string; timeoutMs: number }): Promise<AuthListener> {
  return new Promise((resolveListener, rejectListener) => {
    let finish: (error: Error | null, code?: string) => void = () => {}
    const code = new Promise<string>((resolve, reject) => {
      finish = (error, value) => {
        clearTimeout(timer)
        server.close()
        server.closeAllConnections()
        if (error) reject(error)
        else resolve(value!)
      }
    })
    // Callers await this later, so a rejection before then must not count as unhandled.
    code.catch(() => {})

    const server = createServer((request, response) => {
      const url = request.url ?? ''
      const headers = { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }
      if (!url.startsWith('/callback')) {
        response.writeHead(404, headers).end()
        return
      }
      try {
        const value = parseCallback(url, state)
        response.writeHead(200, headers).end(page('BitCrate is connected to Spotify. You can close this tab.'), () => finish(null, value))
      } catch (error) {
        response.writeHead(400, headers).end(page('BitCrate could not connect to Spotify. Go back to the app and try again.'), () => finish(error as Error))
      }
    })
    const timer = setTimeout(() => finish(new Error('Connecting to Spotify timed out. Try again.')), timeoutMs)

    server.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      rejectListener(new Error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close whatever is using it and try again.` : error.message))
    })
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolveListener({
        port: typeof address === 'object' && address ? address.port : port,
        code,
        close: () => finish(new Error('Cancelled'))
      })
    })
  })
}
