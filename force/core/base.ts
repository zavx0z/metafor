import type {ForceMessage, ForceMessageInput} from "@metafor/types/force/message"

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
 * - публичный surface: `domain`, `id`, `connected`, `onConnectionChange`,
 *   `onImpulse`, `onDestroy`, `impulse()`.
 */
export abstract class ForceBase {
  #connected = false
  #onConnectionChange: ((connected: boolean) => void) | undefined
  #onImpulse: ((impulse: ForceMessage) => void | Promise<void>) | undefined
  #pendingImpulses: ForceMessage[] = []
  #receiving: Promise<void> = Promise.resolve()

  /** Домен runtime-а, например `matrix`, `bulk` или `energy`. */
  abstract readonly domain: string

  /** Runtime-local идентификатор соединения, формируется adapter-ом. */
  abstract readonly id: string

  /** Текущее состояние регистрации transport-а в Force. */
  get connected(): boolean {
    return this.#connected
  }

  /**
   * Handler изменения состояния transport-а.
   *
   * При назначении handler немедленно получает текущее состояние, поэтому
   * поздно созданный HUD не пропускает уже состоявшееся подключение.
   */
  get onConnectionChange(): (connected: boolean) => void {
    return this.#onConnectionChange ?? (() => {})
  }

  set onConnectionChange(handler: (connected: boolean) => void) {
    this.#onConnectionChange = handler
    this.#notifyConnection(handler, this.#connected)
  }

  /**
   * Handler входящего чистого ForceMessage `{parts: [particle]}`.
   *
   * Transport может открыться раньше, чем runtime закончит конструирование и
   * назначит handler. Такие стартовые replay-импульсы сохраняются и передаются
   * после назначения handler без потери порядка.
   */
  get onImpulse(): (impulse: ForceMessage) => void | Promise<void> {
    return this.#onImpulse ?? (() => {})
  }

  set onImpulse(handler: (impulse: ForceMessage) => void | Promise<void>) {
    this.#onImpulse = handler
    for (const impulse of this.#pendingImpulses.splice(0)) this.#enqueue(handler, impulse)
  }

  /** Handler завершения transport lifecycle для cleanup ресурсов домена. */
  abstract onDestroy?: () => void | Promise<void>

  /** Отправляет один чистый ForceMessage в transport. */
  abstract impulse(message: ForceMessageInput): void

  /** Передаёт transport message runtime-обработчику с сохранением порядка. */
  protected emitImpulse(impulse: ForceMessage): void {
    const handler = this.#onImpulse
    if (!handler) {
      this.#pendingImpulses.push(impulse)
      return
    }
    this.#enqueue(handler, impulse)
  }

  /** Обновляет transport status независимо от causal impulse-потока. */
  protected emitConnection(connected: boolean): void {
    if (this.#connected === connected) return
    this.#connected = connected
    const handler = this.#onConnectionChange
    if (handler) this.#notifyConnection(handler, connected)
  }

  #notifyConnection(handler: (connected: boolean) => void, connected: boolean): void {
    try {
      handler(connected)
    } catch (error) {
      console.error(`[${this.domain}] Force onConnectionChange failed`, error)
    }
  }

  #enqueue(
    handler: (impulse: ForceMessage) => void | Promise<void>,
    impulse: ForceMessage,
  ): void {
    this.#receiving = this.#receiving.then(() => handler(impulse)).catch((error) => {
      console.error(`[${this.domain}] Force onImpulse failed`, error)
    })
  }
}
