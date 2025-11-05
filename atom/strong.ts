import { Week } from "./week"
import type { Core } from "./gravity"
import type { Meta, Superposition } from "../meta/metafor"
import type { Process, Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Context } from "@zavx0z/context"
import { contextFromSchema } from "@zavx0z/context"
import { processesFromSchema } from "./src/processes"
import { reactionsFromSchema } from "./src/reactions"
import { Field, type Hidden, type Values } from "./field"
import { Atom } from "./atom"
import { decoherence, type Wave } from "./src/states"
import { EM, type Photon } from "./em"
import { ProcessType } from "../meta/process.t"
import { Initiator } from "./em"

export abstract class Strong extends Week {
  constructor(
    public override id: string,
    public override meta: string,
    public desc: string | undefined,
    hidden: Context<Values>,
    override eigenstates: Superposition,
    override processes: Processes,
    protected override reactions: Reactions,
    core?: Core
  ) {
    super(hidden, id, meta, core)

    this.evaluate = EM.bindWithOriginal(this.evaluate, this)
    this.destroy = EM.bindWithOriginal(this.destroy, this)
    this.up = EM.bindWithOriginal(this.up, this)
    this.down = EM.bindWithOriginal(this.down, this)
    this.connect()
    this.init()
  }

  @EM.it
  init(initiator = Initiator.Nothing) {
    const eigenstate = this.measurement(Object.getOwnPropertySymbols(this.eigenstates)[0] as unknown as string)
    eigenstate && this.collapse(eigenstate)
  }

  measurement(state: string): { state: string; process: Process | undefined } | undefined {
    if (this.process) return

    const eigenstates = this.eigenstates[state]
    if (!eigenstates) return

    const eigenstate = Object.entries(eigenstates).find(([_, Ψ]) => decoherence(Ψ as Wave, this.λ))?.[0]
    if (!eigenstate) return

    const process = this.processes.get(eigenstate)
    return { state: eigenstate, process }
  }

  setState(state: string) {
    this.state = state
    // const eigenstate = this.measurement(state)
    // if (eigenstate) {
    //   this.collapse(eigenstate)
    // }
  }

  collapse({ state, process }: { state: string; process: Process | undefined }) {
    if (!process) return this.transition(state)

    this.process = process
    switch (process.type) {
      case ProcessType.ACTION:
        this.action(state).then(this.up).catch(this.down)
        break
      case ProcessType.FINALLY:
        this.destroy()
        break
    }
  }

  @EM.it
  transition(state: string) {
    this.setState(state)
    const eigenstate = this.measurement(state)
    eigenstate && this.collapse(eigenstate)
  }

  @EM.it
  up() {
    if (this.result && this.process?.success) this.process.success({ update: this.evaluate, data: this.result })
    this.process = undefined
    this.result = undefined
    const eigenstate = this.measurement(this.state)
    eigenstate && this.collapse(eigenstate)
  }

  @EM.it
  down() {
    if (this.error && this.process?.error) this.process.error({ update: this.evaluate, error: this.error })
    this.process = undefined
    this.error = null
    const eigenstate = this.measurement(this.state)
    eigenstate && this.collapse(eigenstate)
  }

  /**
   * Обновляет контекст атома и возвращает обновленные значения.
   * @param values Обновляемые значения.
   * @returns Обновленные значения.
   */
  @EM.it
  evaluate(values: Partial<Hidden<Values>>): Partial<Hidden<Values>> {
    const updated = this.update(values)
    return updated
  }

  protected handleReaction({ data }: MessageEvent<Photon>) {
    if (!this.reactions.exists()) return
    if (data.atom === this.id) return

    for (const patch of data.impulses) {
      this.reactions.run({
        meta: data.meta,
        atom: data.atom,
        timestamp: data.timestamp,
        patch,
        context: this.λ,
        core: this.core,
        state: this.state,
        update: this.evaluate,
        self: this.self,
      })
    }
    this.measurement(this.state)
  }
  // ---------------------------------------------------------------------

  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Hidden<Values>>
    path?: string
  }): Atom {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    // если указан индекс-путь — заранее резервируем слот под id
    if (typeof path === "string" && path.length > 0) Field.fields.reserveByIndexPath(id, path)
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)
    return new Atom(
      id,
      meta.name,
      meta.desc,
      ctx,
      { [Symbol(undefined)]: { [Object.keys(meta.states)[0] as string]: {} }, ...meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      core
    )
  }

  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    if (!Field.getAtom(targetId)) throw new Error(`атом-ориентир "${targetId}" не найден`)

    // 1) Резервируем слот под будущий атом
    Field.fields.reserveSibling(id, targetId, at)
    // 2) Создаём атом в следующей макротаске — родитель «не ждёт»
    setTimeout(() => {
      try {
        const ctx = contextFromSchema(meta.context)
        ctx.update(context)

        // Конструктор сам прикрепит по резервации и разошлёт init
        // ВАЖНО: path в processes self можно оставить пустым — он читается геттером
        // после прикрепления.
        // eslint-disable-next-line no-new
        new Atom(
          id,
          meta.name,
          meta.desc,
          ctx,
          { [Symbol(undefined)]: { [Object.keys(meta.states)[0] as string]: {} }, ...meta.states },
          processesFromSchema(meta.processes ?? {}),
          reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
          core
        )
      } catch (e) {
        // Если что-то пойдёт не так — снимаем резервацию, чтобы не залипало
        try {
          Field.fields.cancelReservation(id)
        } catch {}
        console.error("createSibling async init failed:", e)
      }
    }, 0)

    // 3) Сразу отдаём id
    return id
  }

  static append<M extends Meta>(
    parentId: string | null,
    meta: M,
    cfg: { id?: string; core?: Core; context?: Partial<Hidden<Values>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {} } = cfg

    // валидация родителя (кроме корня)
    if (parentId !== null && !Field.getAtom(parentId)) {
      throw new Error(`Родитель "${parentId}" не найден`)
    }
    // строим индекс-путь в конец детей родителя
    const kids = Field.getChildren(parentId)
    const index = kids.length
    const parentPath = parentId === null ? null : Field.getPath(parentId)
    const path = parentPath ? `${parentPath}/${index}` : String(index)

    // резервируем позицию ПО ИНДЕКС-ПУТИ (конвертируется в orderKey и фиксирует parentId)
    Field.fields.reserveByIndexPath(id, path)

    // готовим контекст
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    // создаём атом на следующем тике:
    setTimeout(() => {
      // базовый конструктор прикрепит к зарезервированному слоту и отправит init
      new Atom(
        id,
        meta.name,
        meta.desc,
        ctx,
        { [Symbol(undefined)]: { [Object.keys(meta.states)[0] as string]: {} }, ...meta.states },
        processesFromSchema(meta.processes ?? {}),
        reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
        core
      )
    }, 0)

    return id
  }
}
