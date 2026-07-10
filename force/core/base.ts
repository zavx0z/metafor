import type {ForceMessage} from "@metafor/types/force/message"

/**
 * Абстрактный публичный контракт Force.
 *
 * Force связывает runtime домена с внешним Force transport endpoint-ом. Домен
 * создает один экземпляр `Force`, назначает обработчики lifecycle и отправляет
 * сообщения через `impulse()`. Конкретный runtime-adapter решает, где находится
 * endpoint, как устроен reconnect, очередь до открытия соединения и shutdown.
 *
 * `ForceBase` не реализует WebSocket, очередь, process hooks или browser
 * lifecycle. Он фиксирует только публичный API и поведение, одинаковое для
 * server/Bun и browser/Bulk реализаций.
 *
 * ## Lifecycle
 *
 * 1. `new Force(domain)` создает доменный transport instance.
 * 2. Runtime регистрирует соединение как `domain/id`.
 * 3. Служебный payload `{type: "create", snapshot}` вызывает
 *    `onCreate(snapshot)`.
 * 4. Чистый ForceMessage `{parts: [...]}` вызывает `onImpulse(message)`.
 * 5. Закрытие runtime transport-а вызывает `onDestroy`, если adapter
 *    поддерживает такой lifecycle.
 *
 * ## Протокол
 *
 * Обязательные сообщения transport-а:
 *
 * - `{type: "create", snapshot}` - bootstrap/create payload;
 * - `{parts: [...]}` - чистый ForceMessage без transport metadata.
 *
 * ## Гарантии порядка
 *
 * - `onImpulse` не вызывается до завершения активного `onCreate`;
 * - импульсы передаются в порядке получения transport-ом;
 * - `onDestroy` не является публичным close API;
 * - публичный surface: `domain`, `id`, `onCreate`, `onImpulse`, `onDestroy`,
 *   `impulse()`.
 */
export abstract class ForceBase {
  /** Домен runtime-а, например `matrix`, `bulk` или `energy`. */
  abstract readonly domain: string

  /** Runtime-local идентификатор соединения, формируется adapter-ом. */
  abstract readonly id: string

  /**
   * Handler bootstrap/create payload-а. Пока он выполняется, входящие
   * ForceMessage должны ждать и не попадать в `onImpulse`.
   */
  abstract onCreate: (snapshot: any) => void | Promise<void>

  /** Handler входящего чистого ForceMessage `{parts: [...]}`. */
  abstract onImpulse: (impulse: ForceMessage) => void | Promise<void>

  /** Handler завершения transport lifecycle для cleanup ресурсов домена. */
  abstract onDestroy?: () => void | Promise<void>

  /** Отправляет control payload или чистый ForceMessage в transport. */
  abstract impulse(message: unknown): void
}
