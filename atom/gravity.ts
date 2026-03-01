import type { Atom } from "./atom"
import { Field } from "./field"
import type { AtomPayload } from "./gravity.t"
import type { Mass } from "./gravity.t"

export type { Mass }

export abstract class Gravity extends Field {
  protected constructor(_: unknown, id: string, meta: string, mass?: Mass) {
    super(_, id, meta)
    Gravity.massWeakMap.set(this, mass || {})
    // Вклеиваемся в дерево (если резерва нет — окажемся в конце корня).
    Field.fields.attachReserved(this as unknown as Atom)
  }

  public override destroy() {
    Gravity.massWeakMap.delete(this)
    super.destroy()
  }

  get snapshot(): AtomPayload {
    return {
      path: String(this.path),
      state: this.state,
      fields: { ...this.λ },
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

  // ------------------------------- Масса ---------------------------------------------

  private static massWeakMap = new WeakMap<Gravity, Mass>()

  public get mass() {
    return Gravity.massWeakMap.get(this)!
  }

  public set mass(value: Mass) {
    Gravity.massWeakMap.set(this, value)
  }
}
