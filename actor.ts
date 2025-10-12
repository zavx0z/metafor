// actor.ts
import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"
import { checkTransition, type Conditions, type Transitions } from "./core/states"
import { processesFromSchema, type Process, type Processes } from "./core/processes"
import { reactionsFromSchema, type Reactions } from "./core/reactions"
import { ElectromagneticField } from "./core/electromagnetic"
export { Fields } from "./core/fields"
import type { Node as ParseNode } from "@zavx0z/template"
import type { Core, Snapshot, Message } from "./actor.t"
export type { Message }
import type { StatesConfig } from "./schema/states"
import type { Meta } from "./metafor"
import { Fields } from "./core/fields"

/**
 * Actor — основной класс актора MetaFor.
 *
 * Актор — изолированная единица с:
 * - собственным состоянием (state machine),
 * - контекстом (typed Context),
 * - обработкой процессов (actions),
 * - реакциями (наблюдение за сообщениями других акторов),
 * - рендер-деревом (template AST узлы, если применимо).
 *
 * Жизненный цикл:
 * - Перед созданием экземпляра внешним кодом резервируется позиция в `Fields` под его `id`
 *   (например, `Fields.get().reserveSibling(id, targetId, "after")` или `reserveByIndexPath`).
 * - В конструкторе базовый класс (`ElectromagneticField`) **прикрепляет** актора в дерево и шлёт
 *   системное `init`-сообщение (см. документацию к базе).
 * - После этого `Actor` запускает начальные переходы/процессы, если они определены.
 * - При уничтожении зовётся `destroy()`:
 *   - база шлёт системное `remove` и отключает транспорт,
 *   - `Actor` рекурсивно очищает ресурсы и удаляет себя из `Fields`.
 */
export class Actor extends ElectromagneticField {
  /** Внешний Core-объект, привязанный к актору, хранится вне экземпляра (slab) */
  private static coreWeakMap = new WeakMap<Actor, Core>()

  /**
   * Создать актор.
   *
   * @param id        Уникальный идентификатор актора.
   * @param name      Имя мета-схемы (используется в сообщениях).
   * @param desc      Описание (опционально, попадёт в snapshot).
   * @param ctx       Контекст (типизированный), см. `@zavx0z/context`.
   * @param state     Текущее состояние и словарь возможных состояний (Transitions).
   * @param processes Реестр процессов (действий) по состояниям.
   * @param reactions Реестр реакций на сообщения других акторов.
   * @param render    Узлы шаблона рендера (опционально).
   * @param core      Внешний Core (любой объект) для действий/реакций.
   *
   * @remarks
   * Базовый класс `ElectromagneticField` в своём конструкторе:
   *  - прикрепит актора в `Fields` (по ранее сделанной резервации либо в конец корня),
   *  - поднимет транспорт,
   *  - отправит `init`-сообщение с текущим snapshot.
   *
   * После вызова `super(id, name, () => this.snapshot)` ниже мы сразу запускаем
   * начальные переходы автомата состояний (если описаны).
   */
  constructor(
    public override id: string,
    public name: string,
    public desc: string | undefined,
    public ctx: Context<Schema>,
    public state: { current: string; states: StatesConfig },
    public processes: Processes,
    public reactions: Reactions,
    public render: ParseNode[],
    core?: Core
  ) {
    // база: attachReserved + initializeCommunication + init(add "/") с lazy snapshot
    super(id, name, () => this.snapshot)

    // биндинги удобства
    this.update = this.update.bind(this)
    this.destroy = this.destroy.bind(this)

    // core во внешнем WeakMap
    Actor.coreWeakMap.set(this, core || {})

    // Запуск стартового процесса/перехода (если есть)
    const transition = this.state.states[this.state.current]
    if (transition) {
      const process = this.processes.getProcess(this.state.current)
      if (process) {
        this.setProcess(true)
        this.executeAction(process)
        this.transition()
      } else {
        this.transition()
      }
    }
  }

  /** Доступ к внешнему Core (если установлен). */
  get core() {
    return Actor.coreWeakMap.get(this)!
  }
  set core(value: Core) {
    Actor.coreWeakMap.set(this, value)
  }

  // ---------- подписки на смену состояния ----------

  /** Набор подписчиков на смену текущего состояния. */
  stateListeners = new Set<(state: string) => void>()

  /** Установить текущее состояние и уведомить подписчиков. */
  setState(state: string) {
    this.state.current = state
    if (this.stateListeners.size > 0) {
      for (const listener of this.stateListeners) listener(state)
    }
  }

  /** Подписка на обновление состояния. Возвращает функцию отписки. */
  onStateChange(listener: (state: string) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.unsubscribeState(listener)
  }
  /** Отписать конкретного слушателя. */
  unsubscribeState(listener: (state: string) => void) {
    this.stateListeners.delete(listener)
  }

  // ---------- process runtime ----------

  /** Флаг «идёт процесс» — блокирует повторный запуск до завершения. */
  process = false

  /**
   * 1) Устанавливает состояние флага процесса.
   * 2) При отключении процесса инициирует автоматический переход (`transition()`).
   */
  setProcess(process: boolean) {
    if (this.process === process) return
    this.process = process
    if (!process) this.transition()
  }

  /**
   * Обновить контекст актра.
   * Рассылает дифф `updated` через сообщение `replace /context`.
   */
  update(context: Partial<Values<Schema>>): Partial<Values<Schema>> {
    const updated = this.ctx.update(context)
    if (Object.keys(updated).length > 0) {
      this.sendMessage(Actor.updateContextMessage(this.name, this.id, this.path, updated))
    }
    return updated
  }

  /**
   * Выполнить действие процесса.
   * - шлёт `stateBeforeAction` перед запуском,
   * - вызывает `process.action(...)`,
   * - по завершении (успех/ошибка) шлёт `stateAfterAction`,
   * - управляет флагом `process` (setProcess(false)).
   */
  executeAction(process: Process<any, any>) {
    try {
      this.sendMessage(Actor.stateBeforeActionMessage(this.name, this.id, this.path, this.state.current))

      const result = process.action({
        schema: this.ctx.schema,
        context: this.ctx.context,
        core: this.core,
        self: { meta: this.name, actor: this.id, path: this.path, destroy: this.destroy },
      })

      if (result instanceof Promise) {
        result
          .then((data) => {
            if (process.success) process.success({ update: this.update, data })
          })
          .catch((error) => {
            if (process.error) {
              if (error instanceof Error) process.error({ update: this.update, error })
              else if (typeof error === "string") process.error({ update: this.update, error: new Error(error) })
              else throw new Error(`Передан неизвестный тип ошибки в состоянии: ${this.state.current}`)
            } else {
              throw new Error(`Обработчик ошибки не найден для состояния: ${this.state.current}\n${String(error)}`)
            }
          })
          .finally(() => {
            this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
            this.setProcess(false)
          })
      } else {
        if (process.success) process.success({ update: this.update, data: result })
        this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
        this.setProcess(false)
      }
    } catch (error) {
      if (error instanceof Error) process.error?.({ update: this.update, error })
      else console.error(error)
      this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, this.state.current))
      this.setProcess(false)
    }
  }

  /**
   * Драйвер переходов:
   * - проверяет условия для исходящих переходов из текущего состояния,
   * - переключает состояние и, если есть процесс, запускает его,
   * - если процесса нет — шлёт `stateAfterAction` и рекурсивно продолжает переходы,
   * - пока `process` не станет `true` или пока переходы не исчерпаются.
   */
  transition() {
    const transition: Transitions | undefined = this.state.states[this.state.current]
    if (!transition) return

    for (const [state, conditions] of Object.entries(transition)) {
      if (checkTransition(conditions as Conditions, this.ctx.context)) {
        const process = this.processes.getProcess(state)
        if (this.process) return

        if (process) {
          this.setProcess(true)
          this.setState(state)
          this.executeAction(process)
        } else {
          this.setState(state)
          this.sendMessage(Actor.stateAfterActionMessage(this.name, this.id, this.path, state))
          if (!this.process) this.transition()
        }
        break
      }
    }
  }

  /** Снимок актора для системных сообщений (используется базой в init). */
  get snapshot(): Snapshot<Schema, string> {
    return {
      name: this.name,
      state: this.state.current,
      process: this.process,
      states: this.state.states,
      context: this.ctx.snapshot,
      ...(this.desc ? { desc: this.desc } : {}),
    }
  }

  // ---------- реакции (поддержка базы) ----------

  /** Есть ли у актора реакции (определяет «заряжённость» для базы). */
  protected hasReactions(): boolean {
    return this.reactions.hasReactions()
  }

  /** Доставка входящих сообщений для реакций. */
  protected handleReactionMessage(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Message>
    if (!this.reactions.hasReactions()) return
    if (data.actor === this.id) return

    for (const patch of data.patches) {
      this.reactions.run({
        context: this.ctx.context,
        core: this.core,
        meta: data.meta,
        actor: data.actor,
        timestamp: data.timestamp,
        patch,
        state: this.state.current,
        update: this.update,
        self: { meta: this.name, actor: this.id, path: this.path, destroy: this.destroy },
      })
    }
    this.transition() // TODO: можно оптимизировать по результату обновления контекста
  }

  // ---------- билдеры прикладных сообщений (не системные init/remove) ----------

  static updateContextMessage(meta: string, actor: string, path: string, updated: Partial<Values<Schema>>): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/context", value: updated }] }
  }

  static stateBeforeActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "test", path: "/state", value: state }] }
  }

  static stateAfterActionMessage(meta: string, actor: string, path: string, state: string): Message {
    return { meta, actor, path, timestamp: Date.now(), patches: [{ op: "replace", path: "/state", value: state }] }
  }

  // ---------- уничтожение и очистка ----------

  /**
   * Рекурсивно очищает core и ресурсы для актора и всех его детей,
   * без рассылки системных сообщений (используется внутри destroy()).
   */
  private destroyRecursive(fields: Fields) {
    const children = fields.getChildren(this.id)

    // Рекурсивно очищаем детей
    for (const childId of children) {
      const childActor = fields.getActor(childId)
      if (childActor) {
        // Важно: чистим без отправки remove (как и было ранее)
        ;(childActor as Actor).destroyRecursive(fields)
      }
    }

    // Очищаем ресурсы текущего актора
    // (транспорт уже выключен базой в super.destroy())
    Actor.coreWeakMap.delete(this)
    this.stateListeners.clear()
    this.ctx.clearSubscribers()
  }

  /**
   * Публичное уничтожение актора:
   * - база отправляет `remove` и выключает транспорт (`super.destroy()`),
   * - актор рекурсивно очищает ресурсы,
   * - удаляется из `Fields` (рекурсивно).
   */
  public override destroy() {
    // 1) база: remove + отключение транспорта
    super.destroy()

    // 2) локальная очистка
    const fields = Fields.get()
    this.destroyRecursive(fields)

    // 3) удаление из дерева
    fields.remove(this.id, true)
  }

  // ---------- фабрики ----------

  /**
   * Создать актор из meta-схемы.
   *
   * @param config.meta    Meta-схема.
   * @param config.id      Явный id (иначе будет сгенерирован).
   * @param config.core    Внешний Core (опц.).
   * @param config.context Начальные значения контекста (опц.).
   * @param config.path    Индекс-путь (опц.). Если указан — **резервирует** позицию;
   *                       если не указан — актор окажется в конце корня.
   */
  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Values<M["context"]>>
    path?: string
  }): Actor {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    const fields = Fields.get()

    // Если задан индекс-путь — резервируем слот заранее
    if (typeof path === "string" && path.length > 0) {
      fields.reserveByIndexPath(id, path)
    }

    // Готовим контекст
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    // Конструируем актора — база прикрепит и пошлёт init синхронно
    const actor = new Actor(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: "", destroy: () => {} }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )

    return actor
  }

  /**
   * Создать нового «брата» рядом с целевым актором.
   * @param targetId Идентификатор актора-ориентира (соседа).
   * @param meta     Meta-схема нового актора.
   * @param cfg.id      Уникальный id нового актора (если не задан — будет сгенерирован).
   * @param cfg.at      "before" | "after" (по умолчанию "after").
   * @param cfg.core    Core окружение (опц.).
   * @param cfg.context Начальные значения контекста (опц.).
   * @returns id созданного актора.
   *
   * @remarks
   * Резервация позиции делается **до** создания экземпляра, затем
   * базовый конструктор прикрепит актора в зарезервированную позицию и отправит init.
   */
  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Values<M["context"]>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    const fields = Fields.get()
    if (!fields.getActor(targetId)) throw new Error(`Актор-ориентир "${targetId}" не найден`)

    // Резервируем позицию под будущего актора по соседу
    fields.reserveSibling(id, targetId, at)

    // Готовим контекст/актор (база прикрепит и пошлёт init в конструкторе)
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    const actor = new Actor(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}, { meta: meta.name, actor: id, path: "", destroy: () => {} }),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )

    return actor.id
  }
}
