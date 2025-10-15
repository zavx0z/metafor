import type { Actor, Message } from "../actor"
import { Fields } from "../fields"
import { Field } from "../field"
import type { Core } from "./gravity.t"

export type { Core }

export abstract class Gravity extends Field {
  // -------------------------- Жизненный цикл -----------------------------------------

  protected constructor(id: string, meta: string, core?: Core) {
    super(id, meta)
    Gravity.coreWeakMap.set(this, core || {})

    // Вклеиваемся в дерево (если резерва нет — окажемся в конце корня).
    Fields.get().attachReserved(this as unknown as Actor)
  }

  public override destroy(recursive = true) {
    Gravity.coreWeakMap.delete(this)
    super.destroy(recursive)
  }

  // ------------------------------------------------------------------------------------

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

  // ------------------------------- Ядро ---------------------------------------------

  private static coreWeakMap = new WeakMap<Gravity, Core>()

  public get core() {
    return Gravity.coreWeakMap.get(this)!
  }

  public set core(value: Core) {
    Gravity.coreWeakMap.set(this, value)
  }
}
