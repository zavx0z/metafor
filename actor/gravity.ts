import type { Actor } from "./actor"
import { Field, type Hidden, type Values } from "./field"
import { Fields } from "./src/fields"
import type { ActorSnapshot } from "./gravity.t"
import type { Core } from "./gravity.t"
import type { Context } from "@zavx0z/context"

export type { Core }

export abstract class Gravity extends Field {
  // -------------------------- Жизненный цикл -----------------------------------------

  protected constructor(_: Context<Values>, id: string, meta: string, core?: Core) {
    super(_, id, meta)
    Gravity.coreWeakMap.set(this, core || {})

    // Вклеиваемся в дерево (если резерва нет — окажемся в конце корня).
    Fields.get().attachReserved(this as unknown as Actor)
  }

  public override destroy(recursive = true, src = "") {
    Gravity.coreWeakMap.delete(this)
    super.destroy(recursive, src)
  }

  // -------------------------- Снимок -----------------------------------------

  get snapshot(): ActorSnapshot {
    return {
      path: String(this.path),
      state: String(this.state.current),
      context: { ...this.ctx.context },
    }
  }

  // ------------------------------- Индексация -----------------------------------------

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

  static getAllAddresses(): Array<{ actor: string; meta: string; path: string }> {
    const fields = Fields.get()
    const paths: Array<{ actor: string; meta: string; path: string }> = []
    if (!fields) return paths
    // @ts-ignore
    for (const [key, actor] of fields.actors.entries()) {
      paths.push({ actor: key, meta: actor.meta, path: actor.path })
    }
    return paths
  }

  // ------------------------------- Ядро ---------------------------------------------

  private static coreWeakMap = new WeakMap<Gravity, Core>()

  public get core() {
    return Gravity.coreWeakMap.get(this)!
  }

  public set core(value: Core) {
    Gravity.coreWeakMap.set(this, value)
  }
}
