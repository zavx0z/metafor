import type { Atom } from "./atom"
import { Field } from "./field"
import type { AtomPayload } from "./gravity.t"
import type { Core } from "./gravity.t"

export type { Core }

export abstract class Gravity extends Field {
  protected constructor(_: unknown, id: string, meta: string, core?: Core) {
    super(_, id, meta)
    Gravity.coreWeakMap.set(this, core || {})
    // Вклеиваемся в дерево (если резерва нет — окажемся в конце корня).
    Field.fields.attachReserved(this as unknown as Atom)
  }

  public override destroy(recursive = true) {
    Gravity.coreWeakMap.delete(this)
    super.destroy(recursive)
  }

  get snapshot(): AtomPayload {
    return {
      path: String(this.path),
      state: this.state,
      context: { ...this.λ },
    }
  }

  // ------------------------------- Индексация -----------------------------------------

  public get path(): string {
    try {
      return Field.getPath(this.id)
    } catch {
      return ""
    }
  }

  static getAllAddresses() {
    return Field.atoms.map((atom) => atom.self)
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
