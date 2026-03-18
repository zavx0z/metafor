import { afterEach, beforeEach, describe } from "bun:test"

export function installDeterministicIds(ids: string[]): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID")
  const originalRandomUUID = crypto.randomUUID.bind(crypto)
  let index = 0

  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => {
      const id = ids[index]
      if (!id) {
        throw new Error(`Недостаточно детерминированных id для теста: запрошен индекс ${index}`)
      }
      index += 1
      return id
    },
  })

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(crypto, "randomUUID", originalDescriptor)
    } else {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: originalRandomUUID,
      })
    }
  }
}

export function describeWithDeterministicIds(name: string, ids: string[], body: () => void): void {
  describe(name, () => {
    let restore: (() => void) | undefined

    beforeEach(() => {
      restore = installDeterministicIds(ids)
    })

    afterEach(() => {
      restore?.()
      restore = undefined
    })

    body()
  })
}

export async function withDeterministicIds<T>(ids: string[], run: () => Promise<T>): Promise<T> {
  const restore = installDeterministicIds(ids)
  try {
    return await run()
  } finally {
    restore()
  }
}
