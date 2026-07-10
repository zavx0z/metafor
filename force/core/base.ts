import type {ForceMessage} from "@metafor/types/force/message"

/**
 * Абстрактный публичный контракт Force.
 *
 * После register adapter запрашивает адресный replay, последовательно применяет
 * его обычными одночастичными messages и только после replay/end выпускает
 * накопленный live outbox.
 */
export abstract class ForceBase {
  abstract readonly domain: string
  abstract readonly id: string
  abstract onImpulse: (impulse: ForceMessage) => void | Promise<void>

  /** Вызывается перед первым replay particle данного reconnect. */
  abstract onReplayStart?: (requestPath: string) => void | Promise<void>

  /** Вызывается после применения последнего replay particle. */
  abstract onReady?: () => void | Promise<void>

  abstract onDestroy?: () => void | Promise<void>
  abstract impulse(message: ForceMessage): void
}
