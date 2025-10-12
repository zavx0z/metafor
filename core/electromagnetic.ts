// core/electromagnetic.ts
import type { Message, Snapshot } from "../actor.t"
import { Fields } from "./fields"

/**
 * ElectromagneticField — базовый «калибровочный» слой обмена сообщениями между акторами.
 *
 * Роль класса:
 * - Управляет подключением/отключением «заряжённых» акторов (имеющих реакции).
 * - Гарантирует корректную точку жизни актора в дереве (`Fields`):
 *   - В конструкторе **вклеивает** актора в заранее **зарезервированное** место
 *     (см. `Fields.reserve*` → `Fields.attachReserved`), затем
 *   - Поднимает транспорт и **рассылает сообщение о создании** (init).
 * - Предоставляет общий геттер `path` — всегда актуальный индекс-путь актора в дереве.
 * - В `destroy()` **сам** рассылает сообщение удаления, потом разрывает транспорт.
 *
 * Требования к наследнику (обычно `Actor`):
 * - Должен реализовать:
 *   - `hasReactions()` — есть ли реакции на входящие сообщения,
 *   - `handleReactionMessage(ev)` — обработка входящих сообщений для реакций.
 * - Должен передать в `super(...)`:
 *   - `id` — уникальный идентификатор актора,
 *   - `metaName` — имя мета-схемы (попадает в сообщения),
 *   - `snapshotFn` — функция, возвращающая актуальный `Snapshot` для init-сообщения.
 *
 * Порядок использования:
 * 1) Сначала внешний код резервирует позицию под `id`:
 *    `Fields.get().reserveSibling(id, targetId, "after")` (или другой reserve*).
 * 2) Затем конструируется наследник: `new Actor(...)`
 *    — внутри `super(...)` произойдёт `attachReserved` + init-сообщение.
 * 3) Для удаления: вызвать `actor.destroy()`
 *    — база пошлёт remove-сообщение и выключит транспорт,
 *      после чего наследник может очистить дерево `Fields` и ресурсы.
 */
export abstract class ElectromagneticField {
  // -------- статическая шина для «локальных» акторов (в одном контексте JS) --------

  /** Включать ли BroadcastChannel для меж-контекстной доставки (вкладки/воркеры). */
  protected static useBroadcastChannel = true

  /** Общий BroadcastChannel для всех акторов процесса (если доступен в окружении). */
  protected static channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("actor-force") : null

  /** Множество «заряжённых» акторов — тех, у кого есть реакции. */
  private static chargedActors = new Set<ElectromagneticField>()

  /**
   * Переключить использование BroadcastChannel.
   * Если `false` — доставка пойдёт только по локальной шине (in-memory Set).
   */
  static setBroadcastChannel(enabled: boolean) {
    ElectromagneticField.useBroadcastChannel = enabled
  }

  /** Признак, используется ли сейчас BroadcastChannel. */
  static isBroadcastChannelEnabled(): boolean {
    return ElectromagneticField.useBroadcastChannel
  }

  // -------- экземплярные поля --------

  /** Уникальный идентификатор актора. */
  public readonly id: string

  /**
   * Имя мета-схемы, используется в системных сообщениях (init/remove).
   * Например: `"meta-builder"`, `"canvas"`, и т.д.
   */
  protected readonly metaName: string

  /**
   * Ленивая функция снимка состояния актора.
   * Вызывается непосредственно перед отправкой init-сообщения, чтобы срез был актуальным.
   */
  private readonly snapshotFn: () => Snapshot<any, string>

  /** Флаг, что транспорт уже поднят и actor зарегистрирован в chargedActors (если нужно). */
  private wired = false

  /** Обработчик события из BroadcastChannel (хранится для корректного removeEventListener). */
  private _onBCMessage?: (ev: MessageEvent<Message>) => void

  /**
   * Создание базовой части актора.
   *
   * @param id        Уникальный идентификатор актора.
   * @param metaName  Имя мета-схемы для системных сообщений.
   * @param snapshot  Функция, возвращающая актуальный Snapshot (включая context/state и т.п.).
   *
   * @remarks
   * Конструктор выполняет три шага:
   * 1) `Fields.attachReserved(this)` — актор «вклеивается» в дерево в ранее зарезервированное место.
   *    Если резервации нет, попадёт в конец корня (см. реализацию `Fields.attachReserved`).
   * 2) `initializeCommunication()` — подключение к транспортам доставки (локальная шина и/или BC).
   * 3) Отправка init-сообщения (`op: "add"`, `path: "/"`) с текущим `snapshot`.
   */
  constructor(id: string, metaName: string, snapshot: () => Snapshot<any, string>) {
    this.id = id
    this.metaName = metaName
    this.snapshotFn = snapshot

    // 1) Вклеиваемся в дерево (позиция определяется ранее — через reserve*)
    Fields.get().attachReserved(this as any)

    // 2) Поднимаем транспорт
    this.initializeCommunication()

    // 3) Рассылаем системное сообщение о создании
    this.sendMessage(this.buildInitMessage())
  }

  // -------- путь актора в дереве --------

  /**
   * Актуальный индекс-путь актора, вида `"0/1/2"`.
   * Всегда вычисляется на основании текущей витрины `Fields`.
   *
   * @remarks
   * Если по какой-то причине актор ещё не зарегистрирован в `Fields` (что маловероятно при текущем
   * жизненном цикле), геттер вернёт пустую строку.
   */
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

  // -------- транспорт и доставка сообщений --------

  /**
   * Подключить актор к транспортам доставки (локальная шина + при необходимости BroadcastChannel).
   * Вызывается один раз из конструктора.
   */
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

  /**
   * Отключить актор от транспортов доставки.
   * Вызывается из {@link destroy} после отправки remove-сообщения.
   */
  protected destroyCommunication() {
    if (!this.wired) return
    this.wired = false

    ElectromagneticField.chargedActors.delete(this)

    if (this._onBCMessage && ElectromagneticField.channel) {
      ElectromagneticField.channel.removeEventListener("message", this._onBCMessage as EventListener)
    }
  }

  /**
   * Отправить сообщение всем «заряжённым» (реактивным) акторам локально
   * и, при включённом режиме, через BroadcastChannel.
   *
   * @param message Сообщение для доставки.
   */
  protected sendMessage(message: Message) {
    // Локальная шина — доставляем всем «заряжённым» (кроме себя)
    for (const actor of ElectromagneticField.chargedActors) {
      if (actor === this) continue
      if (actor.id !== message.actor && actor.hasReactions()) {
        actor.handleReactionMessage({ data: message } as MessageEvent<Message>)
      }
    }

    // BroadcastChannel — для меж-контекстной доставки (вкладки/воркеры)
    if (ElectromagneticField.useBroadcastChannel && ElectromagneticField.channel) {
      ElectromagneticField.channel.postMessage(message)
    }
  }

  // -------- системный жизненный цикл --------

  /**
   * Корректное завершение жизненного цикла базовой части:
   * 1) Сформировать и отправить системное remove-сообщение (пока путь ещё «живой»),
   * 2) Отключить транспорт доставки сообщений.
   *
   * @remarks
   * Наследник (например, `Actor`) обычно переопределяет публичный `destroy()` **поверх**:
   * вызывает `super.destroy()`, затем выполняет свою очистку (удаление из `Fields`, рекурсивный
   * `destroy` детей, чистка подписчиков и т.п.).
   */
  public destroy() {
    // 1) Сообщаем об удалении (путь ещё доступен)
    this.sendMessage(this.buildRemoveMessage())
    // 2) Гасим транспорт
    this.destroyCommunication()
  }

  // -------- абстрактные методы для наследника --------

  /** Присутствуют ли реакции на входящие сообщения (если да — актор считается «заряжённым»). */
  protected abstract hasReactions(): boolean

  /** Обработчик входящих сообщений (в т.ч. полученных по BroadcastChannel). */
  protected abstract handleReactionMessage(ev: MessageEvent<Message>): void

  // -------- внутренние билдеры системных сообщений --------

  /** Сформировать init-сообщение о создании актора (op: "add", path: "/"). */
  private buildInitMessage(): Message {
    return {
      meta: this.metaName,
      actor: this.id,
      path: this.path,
      timestamp: Date.now(),
      patches: [{ op: "add", path: "/", value: this.snapshotFn() }],
    }
  }

  /** Сформировать remove-сообщение об удалении актора (op: "remove", path: "/"). */
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
