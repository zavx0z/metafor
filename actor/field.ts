import type { StatesConfig } from "../meta/states.t"
import { type Context, type Schema } from "@zavx0z/context"
import { Fields } from "./fields"
import type { Actor } from "./actor"

export abstract class Field {
  public readonly meta: string
  public readonly id: string
  protected abstract ctx: Context<Schema>
  protected abstract state: { current: string; states: StatesConfig }

  // -------------------------- Жизненный цикл -----------------------------------------
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
  // -------------------------------------------------------------------
  
  protected static getActor(id: string): Actor | null {
    const fields = Fields.get()
    if (!fields) return null
    return fields.getActor(id)
  }
}
