# BitCrate

Turn a Spotify playlist into a folder of tagged music files. Paste a link, and BitCrate searches every track at once on YouTube Music, shows where each one comes from, and saves it with its cover, artist and album.

## Download

**[Download BitCrate for Windows](https://github.com/moustafaeledwy/bitcrate/releases/latest/download/BitCrate-Setup.exe)** (about 220 MB)

1. Run `BitCrate-Setup.exe`. It replaces any older version and keeps your settings.
2. Windows may warn you because the app isn't code-signed. Click **More info**, then **Run anyway**.
3. Open BitCrate and paste a Spotify playlist or album link.

Playlists over 100 tracks also need **Connect Spotify**, which requires Spotify Premium. See [Getting the whole playlist](#getting-the-whole-playlist).

## Formats

| Format | What you get |
|---|---|
| M4A | YouTube's original AAC audio, about 130 kbps, not re-encoded |
| MP3 | Re-encoded to a constant 320 kbps, for players that can't read M4A. It won't sound better than the M4A. |
| Both | One of each, optionally in separate folders |

YouTube only has lossy audio, so BitCrate doesn't offer WAV. A WAV made from YouTube audio would be a fake WAV.

## Getting the whole playlist

Without an account, Spotify only shows the first 100 tracks of a playlist. **Connect Spotify** fixes that using Spotify's official sign-in in your normal browser, and lists your playlists in the app. It needs Spotify Premium and a one-time setup, which the app walks you through: create a free app on Spotify's developer dashboard and paste its Client ID. BitCrate asks only for permission to read playlists, and keeps the sign-in encrypted on this PC.

Spotify only gives full track lists for playlists you own or collaborate on. Playlists you just follow still stop at 100 tracks.

Deezer's public API fills in missing tags where it finds the track.

Without connecting, or for playlists you only follow, you can open one of these instead:

- A CSV from [exportify.net](https://exportify.net), which has every track and full metadata.
- A CSVMusic `library.json`, found in `%APPDATA%\CSVMusic`.

## Tracks you already have

BitCrate scans your whole save folder, including subfolders, when a playlist loads and again when you press Download. Tracks it finds are marked **Already have** and skipped, in any audio format. It matches on the artist and title in the file name, so a file called only `Layla.mp3` won't count, and an extended mix won't pass for the normal version. To replace a file, open the track and choose **Download again**.

## How matching works

Each result gets a score from title, artist and length.

| Score | Status | What happens |
|---|---|---|
| 80 and up | Found | Downloads |
| 55 to 79 | Check match | Downloads, and stays flagged after saving |
| Below 55 | Not found | Doesn't download. Open the track to choose a result by hand. |

If a video can't be downloaded, such as an age-restricted one, BitCrate tries up to two other good matches.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app with hot reload |
| `npm test` | Runs unit tests |
| `npm run smoke` | Opens a real window and checks it responds |
| `npm run dist` | Builds the installer, copying yt-dlp, FFmpeg and Deno from this PC into it |
| `node scripts/live-check.mjs <link> <folder>` | Runs a real playlist end to end and saves screenshots |
| `node scripts/real-click-check.mjs <folder> <link>` | Tests popups with the real mouse, which moves on its own while it runs |

When YouTube changes something and downloads start failing, use **Settings > Update yt-dlp**.

## Build it yourself

You need Windows and Node.js, plus the tools the app bundles:

```
winget install yt-dlp.yt-dlp yt-dlp.FFmpeg DenoLand.Deno
npm install
npm run dev
```

## Legal

BitCrate isn't affiliated with Spotify, YouTube, Deezer or Codecademy. Downloading from YouTube may break its terms of service, so only download what you have the right to. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the software included in the installer.
