import { Fields } from "./actor"
import { type Context, type Schema } from "@zavx0z/context"

export abstract class Field {
  public readonly meta: string
  public readonly id: string
  protected abstract ctx: Context<Schema>

  // -------------------------- Жизненный цикл -----------------------------------------
  protected abstract connected(): void
  protected abstract disconnected(): void

  protected constructor(id: string, meta: string) {
    this.id = id
    this.meta = meta
  }

  private destroyRecursive(fields: Fields) {
    const children = fields.getChildren(this.id)
    for (const childId of children) {
      const childActor = fields.getActor(childId)
      if (childActor) childActor.destroyRecursive(fields)
    }
  }

  public destroy(recursive: boolean, src = "") {
    const fields = Fields.get()
    if (recursive) {
      while (true) {
        const children = fields.getChildren(this.id)
        if (children.length === 0) break
        const childId = children[0]! // Берем первого ребенка
        const childActor = fields.getActor(childId)
        if (childActor) childActor.destroy(true)
        else break // Если актор не найден, выходим из цикла
      }
    }
    fields.remove(this.id, false) // false, так как мы уже обработали детей
  }
  // -------------------------- Жизненный цикл -----------------------------------------
  static get all(): Array<{ actor: string; meta: string; path: string }> {
    const fields = Fields.get()
    const paths: Array<{ actor: string; meta: string; path: string }> = []
    if (!fields) return paths
    // @ts-ignore
    for (const [key, actor] of fields.actors.entries()) {
      paths.push({ actor: key, meta: actor.meta, path: actor.path })
    }
    return paths
  }
}
