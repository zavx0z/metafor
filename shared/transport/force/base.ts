import type {ForceMessage, ForceMessageInput} from "../../protocol/force/message.ts"
import {forceCheckpointSideband} from "./checkpoint.ts"

export type ForceTransportOptions = {
  id?: string
  parameters?: Readonly<Record<string, string>>
}

/**
 * Общий публичный контракт транспортного клиента Force.
 *
 * Домен создаёт один `Force`, назначает обработчики lifecycle и отправляет одну
 * Particle через `impulse()`. Bun- и browser-adapter сохраняют тот же контракт,
 * но сами выбирают физический WebSocket endpoint и обслуживают его lifecycle.
 * Relay центрального Force находится отдельно в `force.ts` и этого класса не
 * использует.
 *
 * Identity `domain/id` передаётся серверу во время HTTP Upgrade. После открытия
 * WebSocket по каналу идут только `{parts: [particle]}`: register, readiness и
 * другие служебные payload отсутствуют.
 */
export abstract class ForceBase {
  #connected = false
  #onConnectionChange: ((connected: boolean) => void) | undefined
  #onImpulse: ((impulse: ForceMessage) => void | Promise<void>) | undefined
  #pendingImpulses: ForceMessage[] = []
  #receiving: Promise<void> = Promise.resolve()

  /** Домен transport client, например `matrix`, `bulk` или `energy`. */
  abstract readonly domain: string

  /** Локальный идентификатор физического соединения. */
  abstract readonly id: string

  /** Текущее состояние физического transport-а. */
  get connected(): boolean {
    return this.#connected
  }

  /**
   * Handler изменения состояния transport-а.
   *
   * При назначении handler немедленно получает текущее состояние, поэтому
   * поздний подписчик не теряет уже состоявшееся подключение.
   */
  get onConnectionChange(): (connected: boolean) => void {
    return this.#onConnectionChange ?? (() => {})
  }

  set onConnectionChange(handler: (connected: boolean) => void) {
    this.#onConnectionChange = handler
    this.#notifyConnection(handler, this.#connected)
  }

  /**
   * Handler входящей Particle.
   *
   * Transport может открыться раньше, чем домен назначит handler. Ранние
   * Particle сохраняются и передаются после назначения handler без потери
   * порядка.
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

  /** Отправляет одну Particle в transport. */
  abstract impulse(message: ForceMessageInput): void

  /** Передаёт transport message доменному обработчику с сохранением порядка. */
  protected emitImpulse(impulse: ForceMessage): void {
    const handler = this.#onImpulse
    if (!handler) {
      this.#pendingImpulses.push(impulse)
      return
    }
    this.#enqueue(handler, impulse)
  }

  /** Обновляет transport status независимо от Particle-потока. */
  protected emitConnection(connected: boolean): void {
    if (this.#connected === connected) return
    this.#connected = connected
    const handler = this.#onConnectionChange
    if (handler) this.#notifyConnection(handler, connected)
  }

  /** Records one domain-originated Particle in the sideband ordinal only. */
  protected checkpointOutgoing(): void {
    forceCheckpointSideband(this.domain)?.trackOutgoing()
  }

  /** Binds the domain control-plane drain to this transport's sequential input queue. */
  protected bindCheckpointDrain(): void {
    forceCheckpointSideband(this.domain)?.bindDrain(async () => await this.#receiving)
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
    const checkpoint = forceCheckpointSideband(this.domain)
    this.#receiving = this.#receiving.then(async () => {
      if (checkpoint) {
        await checkpoint.processIncoming(impulse, handler)
      } else {
        await handler(impulse)
      }
    }).catch((error) => {
      console.error(`[${this.domain}] Force onImpulse failed`, error)
    })
  }
}
