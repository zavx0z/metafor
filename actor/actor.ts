import { contextFromSchema, type Schema } from "@zavx0z/context"
import { processesFromSchema } from "./processes"
import { reactionsFromSchema } from "./reactions"

import type { Meta } from "../meta/metafor"
import { Fields } from "./fields"
import { Strong } from "./force/strong"
import { MsgSrc } from "./force/electromagnetic"
import type { Core } from "./force/gravity"

import type { Snapshot } from "./actor.t"

/** Actor — логическая единица существования */
export class Actor extends Strong {
  /** Выполняет действие */
  protected action(): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (!this.process?.action) return reject(new Error("Нечего делать!"))
      try {
        const result = this.process.action({
          self: { meta: this.meta, actor: this.id, path: this.path, destroy: this.destroy },
          context: this.ctx.context,
          schema: this.ctx.schema,
          core: this.core,
        })
        if (result instanceof Promise) result.then((result) => resolve(result)).catch((error) => reject(error))
        else resolve(result)
      } catch (error) {
        if (error instanceof Error) return reject(error)
        if (typeof error === "string") error = new Error(error)
        else console.error(`В состоянии: ${this.state.current} - не понятно что произошло!`)
        reject(error)
      }
    })
  }

  /**
   * Умирает
   *
   * Может вымереть весь род (если есть генетические заболевания) 😎
   */
  public override destroy(recursive = true, src = MsgSrc.Nothing) {
    this.ctx.clearSubscribers()
    super.destroy(recursive, src)
  }

  override get snapshot(): Snapshot<Schema, string> {
    return {
      name: this.meta,
      state: this.state.current,
      states: this.state.states,
      context: this.ctx.snapshot,
      ...(this.desc ? { desc: this.desc } : {}),
      core: Object.keys(this.core),
    }
  }

  /** Создаёт актора */
  static fromSchema<M extends Meta>(config: {
    meta: M
    id?: string
    core?: Core
    context?: Partial<Values<M["context"]>>
    path?: string
  }): Actor {
    const { meta, id = crypto.randomUUID(), core, context = {}, path } = config
    const fields = Fields.get()

    // если указан индекс-путь — заранее резервируем слот под id
    if (typeof path === "string" && path.length > 0) {
      fields.reserveByIndexPath(id, path)
    }

    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    const actor = new Actor(
      id,
      meta.name,
      meta.desc,
      ctx,
      { current: Object.keys(meta.states)[0] as string, states: meta.states },
      processesFromSchema(meta.processes ?? {}),
      reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
      meta.render ?? [],
      core
    )
    return actor
  }

  static createSibling<M extends Meta>(
    targetId: string,
    meta: M,
    cfg: { id?: string; at?: "before" | "after"; core?: Core; context?: Partial<Values<M["context"]>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {}, at = "after" } = cfg
    const fields = Fields.get()
    if (!fields.getActor(targetId)) throw new Error(`Актор-ориентир "${targetId}" не найден`)

    // 1) Резервируем слот под будущий актор
    fields.reserveSibling(id, targetId, at)

    // 2) Создаём актора в следующей макротаске — родитель «не ждёт»
    setTimeout(() => {
      try {
        const ctx = contextFromSchema(meta.context)
        ctx.update(context)

        // Конструктор сам прикрепит по резервации и разошлёт init
        // (как у тебя уже реализовано в базовом классе/Actor)
        // ВАЖНО: path в processes self можно оставить пустым — он читается геттером
        // после прикрепления.
        // eslint-disable-next-line no-new
        new Actor(
          id,
          meta.name,
          meta.desc,
          ctx,
          { current: Object.keys(meta.states)[0] as string, states: meta.states },
          processesFromSchema(meta.processes ?? {}),
          reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
          meta.render ?? [],
          core
        )
      } catch (e) {
        // Если что-то пойдёт не так — снимаем резервацию, чтобы не залипало
        try {
          Fields.get().cancelReservation(id)
        } catch {}
        console.error("createSibling async init failed:", e)
      }
    }, 0)

    // 3) Сразу отдаём id
    return id
  }

  static appendChild<M extends Meta>(
    parentId: string | null,
    meta: M,
    cfg: { id?: string; core?: Core; context?: Partial<Values<M["context"]>> } = {}
  ): string {
    const { id = crypto.randomUUID(), core, context = {} } = cfg
    const fields = Fields.get()

    // валидация родителя (кроме корня)
    if (parentId !== null && !fields.getActor(parentId)) {
      throw new Error(`Родитель "${parentId}" не найден`)
    }

    // строим индекс-путь в конец детей родителя
    const kids = fields.getChildren(parentId)
    const index = kids.length
    const parentPath = parentId === null ? null : fields.getPath(parentId)
    const path = parentPath ? `${parentPath}/${index}` : String(index)

    // резервируем позицию ПО ИНДЕКС-ПУТИ (конвертируется в orderKey и фиксирует parentId)
    fields.reserveByIndexPath(id, path)

    // готовим контекст
    const ctx = contextFromSchema(meta.context)
    ctx.update(context)

    // создаём актора на следующем тике:
    setTimeout(() => {
      // базовый конструктор прикрепит к зарезервированному слоту и отправит init
      new Actor(
        id,
        meta.name,
        meta.desc,
        ctx,
        { current: Object.keys(meta.states)[0] as string, states: meta.states },
        processesFromSchema(meta.processes ?? {}),
        reactionsFromSchema(meta.reactions ?? { reactions: {}, states: {} }),
        meta.render ?? [],
        core
      )
    }, 0)

    return id
  }
}
