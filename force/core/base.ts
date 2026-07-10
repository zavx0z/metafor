import type {ForceMessage} from "@metafor/types/force/message"

/**
 * Абстрактный публичный контракт Force.
 *
 * Force связывает runtime домена с внешним transport endpoint-ом. После
 * register adapter запрашивает адресный replay, применяет его обычными
 * одночастичными messages и только после replay/end выпускает накопленный live
 * outbox. `onReady` означает, что локальная проекция восстановлена и домен может
 * отвечать на replay других consumers.
 */
export abstract class ForceBase {
  /** Домен runtime-а, например `matrix`, `bulk` или `energy`. */
  abstract readonly domain: string

  /** Runtime-local идентификатор соединения, формируется adapter-ом. */
  abstract readonly id: string

  /** Handler входящего чистого ForceMessage `{parts: [particle]}`. */
  abstract onImpulse: (impulse: ForceMessage) => void | Promise<void>

  /** Вызывается после адресного replay/end или сразу для ownerless Dark. */
  abstract onReady?: () => void | Promise<void>

  /** Handler завершения transport lifecycle для cleanup ресурсов домена. */
  abstract onDestroy?: () => void | Promise<void>

  /** Отправляет один чистый ForceMessage в transport. */
  abstract impulse(message: ForceMessage): void
}
