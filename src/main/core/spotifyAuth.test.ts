import { describe, expect, test } from 'vitest'
import { authorizeUrl, challengeFor, createPkce, exchangeCode, isClientId, parseCallback, refreshTokens, startAuthListener, type Tokens } from './spotifyAuth'

const CLIENT = '0123456789abcdef0123456789abcdef'
const REDIRECT = 'http://127.0.0.1:43827/callback'

describe('PKCE', () => {
  test('matches the worked example in the standard', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  test('makes a new verifier of a valid length each time', () => {
    const a = createPkce()
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(createPkce().verifier).not.toBe(a.verifier)
    expect(a.challenge).toBe(challengeFor(a.verifier))
  })
})

describe('isClientId', () => {
  test('accepts the 32 character id Spotify shows', () => {
    expect(isClientId(CLIENT)).toBe(true)
  })
  test('rejects anything else', () => {
    expect(isClientId('my app')).toBe(false)
  })
})

describe('authorizeUrl', () => {
  const url = new URL(authorizeUrl(CLIENT, REDIRECT, 'chal', 'st8'))
  test('goes to Spotify and asks only to read playlists', () => {
    expect(url.origin).toBe('https://accounts.spotify.com')
    expect(url.searchParams.get('scope')).toBe('playlist-read-private playlist-read-collaborative')
  })
  test('uses the PKCE code flow', () => {
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('state')).toBe('st8')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT)
  })
})

describe('parseCallback', () => {
  test('returns the code', () => {
    expect(parseCallback('/callback?code=abc&state=st8', 'st8')).toBe('abc')
  })
  test('rejects a mismatched state', () => {
    expect(() => parseCallback('/callback?code=abc&state=evil', 'st8')).toThrow(/did not match/i)
  })
  test('explains when access was denied', () => {
    expect(() => parseCallback('/callback?error=access_denied&state=st8', 'st8')).toThrow(/cancelled|denied/i)
  })
  test('explains a callback with no code', () => {
    expect(() => parseCallback('/callback?state=st8', 'st8')).toThrow(/no sign-in code/i)
  })
})

describe('exchangeCode', () => {
  test('sends the verifier and returns tokens with an expiry', async () => {
    let sent = ''
    const tokens = await exchangeCode(
      { code: 'abc', verifier: 'ver', clientId: CLIENT, redirectUri: REDIRECT, now: () => 1000 },
      async (_url, init) => {
        sent = String(init?.body)
        return Response.json({ access_token: 'A', refresh_token: 'R', expires_in: 3600 })
      }
    )
    const form = new URLSearchParams(sent)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code_verifier')).toBe('ver')
    expect(form.get('client_id')).toBe(CLIENT)
    expect(tokens).toEqual({ accessToken: 'A', refreshToken: 'R', expiresAt: 3601000 })
  })
  test('explains a rejected code', async () => {
    const fetcher = async () => Response.json({ error: 'invalid_grant', error_description: 'bad code' }, { status: 400 })
    await expect(exchangeCode({ code: 'x', verifier: 'v', clientId: CLIENT, redirectUri: REDIRECT }, fetcher)).rejects.toThrow(/bad code/)
  })
})

describe('refreshTokens', () => {
  const old: Tokens = { accessToken: 'A', refreshToken: 'R', expiresAt: 0 }
  test('stores a rotated refresh token', async () => {
    const fetcher = async () => Response.json({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600 })
    expect(await refreshTokens(old, CLIENT, fetcher)).toMatchObject({ accessToken: 'A2', refreshToken: 'R2' })
  })
  test('keeps the old refresh token when none comes back', async () => {
    const fetcher = async () => Response.json({ access_token: 'A2', expires_in: 3600 })
    expect((await refreshTokens(old, CLIENT, fetcher)).refreshToken).toBe('R')
  })
  test('fails clearly when Spotify revoked access', async () => {
    const fetcher = async () => Response.json({ error: 'invalid_grant' }, { status: 400 })
    await expect(refreshTokens(old, CLIENT, fetcher)).rejects.toThrow(/invalid_grant/)
  })
})

describe('startAuthListener', () => {
  const open = () => startAuthListener({ port: 0, state: 'st8', timeoutMs: 2000 })

  test('hands back the code and tells the browser it can close', async () => {
    const listener = await open()
    const page = await fetch(`http://127.0.0.1:${listener.port}/callback?code=abc&state=st8`)
    expect(page.status).toBe(200)
    expect(await page.text()).toMatch(/close this tab/i)
    await expect(listener.code).resolves.toBe('abc')
  })
  test('ignores other requests, such as the browser asking for an icon', async () => {
    const listener = await open()
    expect((await fetch(`http://127.0.0.1:${listener.port}/favicon.ico`)).status).toBe(404)
    await fetch(`http://127.0.0.1:${listener.port}/callback?code=abc&state=st8`)
    await expect(listener.code).resolves.toBe('abc')
  })
  test('rejects a forged callback', async () => {
    const listener = await open()
    const rejected = expect(listener.code).rejects.toThrow(/did not match/i)
    expect((await fetch(`http://127.0.0.1:${listener.port}/callback?code=abc&state=evil`)).status).toBe(400)
    await rejected
  })
  test('gives up after the timeout', async () => {
    const listener = await startAuthListener({ port: 0, state: 'st8', timeoutMs: 20 })
    await expect(listener.code).rejects.toThrow(/timed out/i)
  })
  test('explains when the port is already taken', async () => {
    const first = await open()
    await expect(startAuthListener({ port: first.port, state: 'x', timeoutMs: 100 })).rejects.toThrow(/already in use/i)
    first.close()
    await expect(first.code).rejects.toThrow()
  })
})
