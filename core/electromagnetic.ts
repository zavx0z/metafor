// core/electromagnetic.ts
import type { Message, Snapshot } from "../actor.t"
import { Fields } from "./fields"

/**
 * ElectromagneticField — базовый «калибровочный» слой обмена сообщениями между акторами.
 *
 * Назначение:
 * - Поднимает/гасит транспорт сообщений для «заряжённых» акторов (имеющих реакции).
 * - Даёт общий геттер `path` (актуальный индекс-путь из Fields).
 * - Умеет сформировать и отправить системные сообщения init/remove (но НЕ делает этого в конструкторе).
 *
 * Жизненный цикл (важно):
 * 1) Внешний код (или фабрика Actor) СНАЧАЛА резервирует позицию под id в Fields (reserve*),
 * 2) Создаётся наследник (Actor): присваивает себе `reactions`, `processes`, …,
 * 3) Наследник вызывает `attachAndAnnounceCreate()`:
 *    - Fields.attachReserved(this) — вклеивает в заранее зарезервированное место (или в конец корня),
 *    - initializeCommunication() — подключает транспорт, если есть реакции,
 *    - sendMessage(init) — рассылает сообщение создания.
 * 4) При уничтожении наследник зовёт `super.destroy()`:
 *    - sendMessage(remove) → destroyCommunication().
 */
export abstract class ElectromagneticField {
  // -------- статическая шина для «локальных» акторов (в одном контексте JS) --------

  /** Включать ли BroadcastChannel для меж-контекстной доставки. */
  protected static useBroadcastChannel = true

  /** Общий BroadcastChannel для процесса (если доступен). */
  protected static channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("actor-force") : null

  /** Множество «заряжённых» акторов (у кого есть реакции). */
  private static chargedActors = new Set<ElectromagneticField>()

  /** Переключить использование BroadcastChannel. */
  static setBroadcastChannel(enabled: boolean) {
    ElectromagneticField.useBroadcastChannel = enabled
  }
  static isBroadcastChannelEnabled(): boolean {
    return ElectromagneticField.useBroadcastChannel
  }

  /** Получить количество зарегистрированных акторов. */
  static getRegisteredActorsCount(): number {
    return ElectromagneticField.chargedActors.size
  }

  // -------- экземпляр --------

  /** Уникальный идентификатор актора. */
  public readonly id: string

  /** Имя мета-схемы (попадает в системные сообщения). */
  protected readonly metaName: string

  /** Ленивая функция получения Snapshot — вызывается непосредственно перед init. */
  private readonly snapshotFn: () => Snapshot<any, string>

  /** Флаг, что транспорт поднят и актор подключён к шинам. */
  private wired = false

  /** Обработчик BC для корректного removeEventListener. */
  private _onBCMessage?: (ev: MessageEvent<Message>) => void

  /**
   * Конструктор БЕЗ сайд-эффектов.
   * @param id        Идентификатор актора.
   * @param metaName  Имя мета-схемы (для сообщений).
   * @param snapshot  Функция снапшота.
   *
   * ВАЖНО: ни Fields.attachReserved, ни init-сообщение здесь НЕ вызываются.
   * Наследник обязан сделать это в удобный момент через `attachAndAnnounceCreate()`.
   */
  constructor(id: string, metaName: string, snapshot: () => Snapshot<any, string>) {
    this.id = id
    this.metaName = metaName
    this.snapshotFn = snapshot
  }

  // -------- путь актора в дереве --------

  /** Актуальный индекс-путь вида `"0/1/2"` (или пустая строка, если актор ещё не в Fields). */
  public get path(): string {
    const f = Fields.get()
    const a = f.getActor(this.id)
    if (!a) return ""
    try {
      return f.getPath(this.id)
    } catch {
      return ""
    }
  }

  // -------- публичные шаги жизненного цикла --------

  /**
   * Присоединить актора к ранее зарезервированному месту в Fields и разослать init.
   * Вызывать ОДИН раз, после того как наследник установил все свои поля (в т.ч. reactions).
   */
  protected attachAndAnnounceCreate() {
    // 1) Вклеиваемся в дерево (если резерва нет — окажемся в конце корня).
    Fields.get().attachReserved(this as any)

    // 2) Подключаем транспорт (только если есть реакции).
    this.initializeCommunication()

    // 3) Системное init-сообщение.
    this.sendMessage(this.buildInitMessage())
  }

  /**
   * Корректное завершение базовой части:
   * 1) отправить системное remove (путь ещё живой),
   * 2) погасить транспорт.
   *
   * Наследник может переопределить `destroy()`, но должен вызывать `super.destroy()`.
   */
  public destroy() {
    this.sendMessage(this.buildRemoveMessage())
    this.destroyCommunication()
  }

  // -------- транспорт --------

  /** Подключить актор к транспортам (локальная шина + BC). */
  protected initializeCommunication() {
    if (this.hasReactions()) {
      this.wired = true
      ElectromagneticField.chargedActors.add(this)

      if (ElectromagneticField.useBroadcastChannel && ElectromagneticField.channel) {
        this._onBCMessage ??= (ev: MessageEvent<Message>) => this.handleReactionMessage(ev)
        ElectromagneticField.channel.addEventListener("message", this._onBCMessage as EventListener)
      }
    }
  }

  /** Отключить актор от транспортов. */
  protected destroyCommunication() {
    if (!this.wired) return
    this.wired = false

    ElectromagneticField.chargedActors.delete(this)

    if (this._onBCMessage && ElectromagneticField.channel) {
      ElectromagneticField.channel.removeEventListener("message", this._onBCMessage as EventListener)
    }
  }

  /** Доставка сообщения локально и (опционально) через BroadcastChannel. */
  protected sendMessage(message: Message) {
    // локально всем «заряжённым», кроме себя
    for (const actor of ElectromagneticField.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions()) {
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
      }
    }
    // через BC
    if (ElectromagneticField.useBroadcastChannel && ElectromagneticField.channel) {
      ElectromagneticField.channel.postMessage(message)
    }
  }

  // -------- абстрактные (реализует наследник) --------

  /** Есть ли реакции на входящие сообщения. */
  protected abstract hasReactions(): boolean
  /** Обработчик входящих сообщений. */
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void

  // -------- служебные билдеры системных сообщений --------

  private buildInitMessage(): Message {
    return {
      meta: this.metaName,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "add", path: "/", value: this.snapshotFn() }],
    }
  }

  private buildRemoveMessage(): Message {
    return {
      meta: this.metaName,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "remove", path: "/" }],
    }
  }
}
