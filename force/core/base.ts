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
 * 3. После регистрации runtime отправляет обычный `z/test` replay marker.
 * 4. Каждый чистый ForceMessage `{parts: [particle]}` вызывает
 *    `onImpulse(message)`.
 * 5. Закрытие runtime transport-а вызывает `onDestroy`, если adapter
 *    поддерживает такой lifecycle.
 *
 * ## Протокол
 *
 * Обязательные сообщения transport-а:
 *
 * - `{type: "register", domain, id}` - единственный служебный payload;
 * - `{parts: [particle]}` - чистый одночастичный ForceMessage.
 *
 * ## Гарантии порядка
 *
 * - импульсы передаются в порядке получения transport-ом;
 * - reconnect не очищает локальную проекцию домена;
 * - cold start запрашивает replay обычным particle-потоком, без snapshot;
 * - `onDestroy` не является публичным close API;
 * - публичный surface: `domain`, `id`, `onImpulse`, `onDestroy`,
 *   `impulse()`.
 */
export abstract class ForceBase {
  /** Домен runtime-а, например `matrix`, `bulk` или `energy`. */
  abstract readonly domain: string

  /** Runtime-local идентификатор соединения, формируется adapter-ом. */
  abstract readonly id: string

  /** Handler входящего чистого ForceMessage `{parts: [particle]}`. */
  abstract onImpulse: (impulse: ForceMessage) => void | Promise<void>

  /** Handler завершения transport lifecycle для cleanup ресурсов домена. */
  abstract onDestroy?: () => void | Promise<void>

  /** Отправляет один чистый ForceMessage в transport. */
  abstract impulse(message: ForceMessage): void
}
