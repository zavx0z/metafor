import { Week } from "./week"
import type { Core } from "./gravity"
import type { Meta, Superposition } from "../meta/metafor"
import type { Processes } from "./src/processes"
import type { Reactions } from "./src/reactions"
import type { Context } from "@zavx0z/context"
import { contextFromSchema } from "@zavx0z/context"
import { processesFromSchema } from "./src/processes"
import { reactionsFromSchema } from "./src/reactions"
import { Field, type Hidden, type Values } from "./field"
import { Atom } from "./atom"
import { decoherence, type Wave } from "./src/states"
import { type Photon } from "./em"

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
    this.evaluate = this.evaluate.bind(this)
    this.destroy = this.destroy.bind(this)
    this.up = this.up.bind(this)
    this.down = this.down.bind(this)
    this.connect()
    this.measurement()
  }

  measurement() {
    if (this.process) return

    const eigenstates = this.eigenstates[this.state ?? Object.getOwnPropertySymbols(this.eigenstates)[0]]
    if (!eigenstates) return

    const eigenstate = Object.entries(eigenstates).find(([_, Ψ]) => decoherence(Ψ as Wave, this.λ))?.[0]
    if (!eigenstate) return

    if ((this.process = this.processes.getProcess(eigenstate))) {
      if (!this.emitProcess(eigenstate)) return

      this.state = eigenstate
      this.action().then(this.up).catch(this.down)
    } else if (!this.emitMeasure(eigenstate)) return

    this.state = eigenstate
    this.measurement()
  }

  up() {
    if (this.result && this.process?.success) this.process.success({ update: this.evaluate, data: this.result })
    if (!this.emitUp()) return
    this.process = undefined
    this.measurement()
  }

  down() {
    if (this.error && this.process?.error) this.process.error({ update: this.evaluate, error: this.error })
    if (!this.emitDown()) return
    this.error = null
    this.process = undefined
    this.measurement()
  }

  protected handleReaction(ev: MessageEvent) {
    const { data } = ev as MessageEvent<Photon>
    if (!this.hasReactions()) return
    if (data.atom === this.id) return

    for (const patch of data.patches) {
      this.reactions.run({
        meta: data.meta,
        atom: data.atom,
        timestamp: data.timestamp,
        patch,
        context: this.λ,
        core: this.core,
        state: this.state,
        update: this.evaluate,
        destroy: this.destroy,
        self: this.self,
      })
    }
    this.measurement()
  }

  // ---------------------------------------------------------------------

  /** Создаёт атома */
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

    // создаём атома на следующем тике:
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
