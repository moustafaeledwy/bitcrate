// Spotify only allows plain http for loopback addresses, and rejects the word "localhost".
export const SPOTIFY_REDIRECT_PORT = 43827
export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/callback`
