import { describe, expect, test } from 'vitest'
import { createPool, spaced } from './pool'

const tick = () => new Promise((r) => setTimeout(r, 2))

describe('createPool', () => {
  test('never runs more than the limit at once', async () => {
    const pool = createPool(3)
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 12 }, () =>
        pool.run(async () => {
          active++
          peak = Math.max(peak, active)
          await tick()
          active--
        })
      )
    )
    expect(peak).toBe(3)
  })
  test('a failed job does not stop the others', async () => {
    const pool = createPool(1)
    const failed = pool.run(async () => {
      throw new Error('boom')
    })
    const ok = pool.run(async () => 'fine')
    await expect(failed).rejects.toThrow('boom')
    await expect(ok).resolves.toBe('fine')
  })
  test('clear drops waiting jobs without running them', async () => {
    const pool = createPool(1)
    let ran = 0
    const first = pool.run(async () => {
      await tick()
      ran++
    })
    const second = pool.run(async () => {
      ran++
    })
    const rejected = expect(second).rejects.toThrow(/cancelled/i)
    pool.clear()
    await first
    await rejected
    expect(ran).toBe(1)
  })
  test('raising the limit starts waiting jobs', async () => {
    const pool = createPool(1)
    let active = 0
    let peak = 0
    const jobs = Array.from({ length: 4 }, () =>
      pool.run(async () => {
        active++
        peak = Math.max(peak, active)
        await tick()
        active--
      })
    )
    pool.setLimit(4)
    await Promise.all(jobs)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('spaced', () => {
  test('starts calls at least the given time apart', async () => {
    const starts: number[] = []
    const limited = spaced(async () => {
      starts.push(Date.now())
    }, 60)
    await Promise.all([limited(), limited(), limited()])
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(40)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(40)
  })
})
