import type { Atom } from "./atom"
import { Field } from "./field"
import type { AtomSnapshot } from "./gravity.t"
import type { Core } from "./gravity.t"

export type { Core }

export abstract class Gravity extends Field {
  // -------------------------- Жизненный цикл -----------------------------------------

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

  // -------------------------- Снимок -----------------------------------------

  get snapshot(): AtomSnapshot {
    return {
      path: String(this.path),
      state: String(this.state.current),
      context: { ...this.λ },
    }
  }

  // ------------------------------- Индексация -----------------------------------------

  /** Актуальный индекс-путь вида `"0/1/2"` (или пустая строка, если атом ещё не в Fields). */
  public get path(): string {
    const a = Field.fields.getAtom(this.id)
    if (!a) return ""
    try {
      return Field.fields.getPath(this.id)
    } catch {
      return ""
    }
  }

  static getAllAddresses(): Array<{ atom: string; meta: string; path: string }> {
    const paths: Array<{ atom: string; meta: string; path: string }> = []
    if (!Field.fields) return paths
    // @ts-ignore
    for (const [key, atom] of Field.fields.atoms.entries()) {
      paths.push({ atom: key, meta: atom.meta, path: atom.path })
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
