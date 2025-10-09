import type { Message } from "./actor.t"

/**
 * Базовый класс для управления коммуникациями между акторами
 *
 * Отвечает за:
 * - Реестр акторов
 * - Управление BroadcastChannel
 * - Отправку сообщений через различные каналы
 * - Внутренний механизм коммуникации
 */
export abstract class ActorCommunication {
  /** Реестр всех активных акторов */
  protected static actorsRegistry = new Map<string, ActorCommunication>()

  /** Флаг управления BroadcastChannel */
  protected static useBroadcastChannel = true

  /** BroadcastChannel для межпотоковой коммуникации */
  protected static channel = new BroadcastChannel("actor-force")

  /** Уникальный идентификатор актора */
  public abstract readonly id: string

  /** Конструктор базового класса */
  constructor() {
    // Базовый конструктор
  }

  /**
   * Включает/выключает BroadcastChannel для межпотоковой коммуникации
   *
   * Внутренний механизм работает всегда.
   *
   * Когда BroadcastChannel включен (по умолчанию):
   * - Акторы подписываются на оба канала одновременно
   * - Внутренний реестр - для быстрой коммуникации в том же потоке
   * - BroadcastChannel - для получения сообщений из других потоков/воркеров
   * - Сообщения отправляются в оба канала
   *
   * Когда BroadcastChannel отключен:
   * - Акторы подписываются только на внутренний реестр
   * - Все коммуникация идет через внутренний реестр
   * - Нет межпотоковой коммуникации
   */
  static setBroadcastChannel(enabled: boolean) {
    ActorCommunication.useBroadcastChannel = enabled
  }

  /** Возвращает текущее состояние BroadcastChannel */
  static isBroadcastChannelEnabled(): boolean {
    return ActorCommunication.useBroadcastChannel
  }

  /** Отправляет сообщение через внутренний механизм всем зарегистрированным акторам */
  static #sendInternalMessage(message: Message) {
    for (const [actorId, actor] of ActorCommunication.actorsRegistry) {
      if (actorId !== message.actor && actor.hasReactions()) {
        // Имитируем событие MessageEvent для совместимости с существующим кодом
        const mockEvent = {
          data: message,
        } as MessageEvent
        actor.handleReactionMessage(mockEvent)
      }
    }
  }

  /**
   * Отправляет сообщение через доступные каналы коммуникации
   *
   * Отправляет через BroadcastChannel для межпотоковой коммуникации (если включен).
   * Всегда отправляет через внутренний реестр акторов.
   *
   * Это обеспечивает:
   * 1. BroadcastChannel - для межпотоковой коммуникации (если включен)
   * 2. Внутренний реестр - для быстрой коммуникации между акторами в том же потоке (всегда)
   */

  static #sendMessage(message: Message) {
    // Отправляем через BroadcastChannel если он включен
    if (ActorCommunication.useBroadcastChannel) {
      ActorCommunication.channel.postMessage(message)
    }

    // Всегда отправляем через внутренний механизм
    ActorCommunication.#sendInternalMessage(message)
  }

  /** Регистрирует актор в реестре */
  protected static registerActor(actor: ActorCommunication) {
    ActorCommunication.actorsRegistry.set(actor.id, actor)
  }

  /** Удаляет актор из реестра */
  protected static unregisterActor(actorId: string) {
    ActorCommunication.actorsRegistry.delete(actorId)
  }

  /** Возвращает количество зарегистрированных акторов */
  static getRegisteredActorsCount(): number {
    return ActorCommunication.actorsRegistry.size
  }

  /** Очищает реестр акторов (для тестирования) */
  static clearRegistry() {
    ActorCommunication.actorsRegistry.clear()
  }

  /** Инициализирует коммуникации для актора */
  protected initializeCommunication() {
    // Регистрируем актор в реестре
    ActorCommunication.registerActor(this)

    if (this.hasReactions()) {
      // Подписываемся на BroadcastChannel только если он включен
      if (ActorCommunication.useBroadcastChannel) {
        ActorCommunication.channel.addEventListener("message", this.handleReactionMessage.bind(this))
      }

      // Внутренний механизм работает автоматически через реестр (всегда)
    }
  }

  /** Очищает коммуникации для актора */
  protected destroyCommunication() {
    ActorCommunication.unregisterActor(this.id)
    if (this.hasReactions() && ActorCommunication.useBroadcastChannel) {
      // Отписываемся от BroadcastChannel только если он был включен
      ActorCommunication.channel.removeEventListener("message", this.handleReactionMessage.bind(this))
    }
  }

  /** Отправляет сообщение через доступные каналы */
  protected sendMessage(message: Message) {
    ActorCommunication.#sendMessage(message)
  }

  /** Проверяет, есть ли у актора реакции */
  protected abstract hasReactions(): boolean

  /** Обрабатывает входящие сообщения для реакций */
  protected abstract handleReactionMessage(ev: MessageEvent): void
}
