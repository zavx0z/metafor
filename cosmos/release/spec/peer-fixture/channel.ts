import type {ReleaseDataChannelPort} from "../../server/peer/index.ts"

type Handlers = Parameters<ReleaseDataChannelPort["subscribe"]>[0]

/** Только детерминированные protocol failure cases; реальный RTC проверяется отдельно. */
export function channelPair(maxMessageSize = 1024) {
  const handlers = [new Set<Handlers>(), new Set<Handlers>()]
  const buffered = [0, 0]
  let state = "open"
  const frames: Uint8Array[] = []
  const ports = [0, 1].map(index => ({
    get readyState() { return state },
    get bufferedAmount() { return buffered[index]! },
    maxMessageSize,
    send(message: Uint8Array) {
      if (state !== "open") throw new Error("Fixture channel closed")
      const bytes = Uint8Array.from(message)
      frames.push(bytes)
      buffered[index] = buffered[index]! + bytes.byteLength
      queueMicrotask(() => {
        buffered[index] = buffered[index]! - bytes.byteLength
        if (state === "open") for (const listener of handlers[1 - index]!) listener.message(bytes)
        for (const listener of handlers[index]!) listener.bufferedAmountLow()
      })
    },
    subscribe(listener: Handlers) {
      handlers[index]!.add(listener)
      return () => { handlers[index]!.delete(listener) }
    },
  } satisfies ReleaseDataChannelPort))
  return {
    left: ports[0]!,
    right: ports[1]!,
    frames,
    disconnect() {
      state = "closed"
      for (const listeners of handlers) for (const listener of [...listeners]) listener.close()
    },
    subscriptions: () => handlers.reduce((sum, listeners) => sum + listeners.size, 0),
  }
}
