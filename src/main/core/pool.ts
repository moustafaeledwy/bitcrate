interface Job {
  start: () => void
  cancel: () => void
}

export interface Pool {
  run<T>(fn: () => Promise<T>): Promise<T>
  setLimit(limit: number): void
  clear(): void
}

export function createPool(initialLimit: number): Pool {
  let limit = initialLimit
  let active = 0
  let waiting: Job[] = []

  const drain = () => {
    while (active < limit && waiting.length) waiting.shift()!.start()
  }

  return {
    run<T>(fn: () => Promise<T>) {
      return new Promise<T>((resolve, reject) => {
        waiting.push({
          start: () => {
            active++
            fn()
              .then(resolve, reject)
              .finally(() => {
                active--
                drain()
              })
          },
          cancel: () => reject(new Error('Cancelled'))
        })
        drain()
      })
    },
    setLimit(next) {
      limit = next
      drain()
    },
    clear() {
      const dropped = waiting
      waiting = []
      dropped.forEach((job) => job.cancel())
    }
  }
}

// Keeps calls a minimum time apart, for services with a published rate limit.
export function spaced<A extends unknown[], R>(fn: (...args: A) => Promise<R>, gapMs: number): (...args: A) => Promise<R> {
  let next = 0
  return async (...args) => {
    const now = Date.now()
    const at = Math.max(now, next)
    next = at + gapMs
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now))
    return fn(...args)
  }
}
