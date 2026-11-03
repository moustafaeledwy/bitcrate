// Draws the app icon, a pixel-art record, with no image libraries.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const GRID = 32
const SCALE = 16
const NAVY = [16, 22, 47, 255]
const GROOVE = [58, 16, 229, 255]
const SHINE = [249, 102, 255, 255]
const LABEL = [255, 211, 0, 255]
const CREAM = [255, 240, 229, 255]
const CLEAR = [0, 0, 0, 0]

function pixel(x, y) {
  const dx = x + 0.5 - GRID / 2
  const dy = y + 0.5 - GRID / 2
  const r = Math.hypot(dx, dy)
  if (r > 15.5) return CLEAR
  if (r < 1.8) return CREAM
  if (r < 5.5) return LABEL
  if (dx > 0 && dy < 0 && r > 7 && r < 13 && Math.abs(dx + dy) < 2.5) return SHINE
  if (Math.floor(r) === 8 || Math.floor(r) === 11) return GROOVE
  return NAVY
}

const size = GRID * SCALE
const raw = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1)
  raw[row] = 0
  for (let x = 0; x < size; x++) {
    Buffer.from(pixel(Math.floor(x / SCALE), Math.floor(y / SCALE))).copy(raw, row + 1 + x * 4)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc(body))
  return Buffer.concat([length, body, check])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header.set([8, 6, 0, 0, 0], 8)

const folder = join(import.meta.dirname, '..', 'build')
mkdirSync(folder, { recursive: true })
writeFileSync(
  join(folder, 'icon.png'),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
)
