import { Fields } from "../actor"
import { contextFromSchema, type Context, type Schema, type Values } from "@zavx0z/context"

export abstract class Field {
  protected abstract ctx: Context<Schema>

  // -------------------------- Жизненный цикл -----------------------------------------
  protected constructor(id: string, meta: string) {
    this.id = id
    this.meta = meta
  }

  protected abstract connected(): void
  protected abstract disconnected(): void

  private destroyRecursive(fields: Fields) {
    const children = fields.getChildren(this.id)
    for (const childId of children) {
      const childActor = fields.getActor(childId)
      if (childActor) childActor.destroyRecursive(fields)
    }
  }

  public destroy(recursive: boolean) {
    // Рекурсивно уничтожаем детей если нужно
    const fields = Fields.get()
    if (recursive) {
      while (true) {
        const children = fields.getChildren(this.id)
        if (children.length === 0) break
        const childId = children[0]! // Берем первого ребенка
        const childActor = fields.getActor(childId)
        if (childActor) {
          childActor.destroy(true)
        } else {
          break // Если актор не найден, выходим из цикла
        }
      }
    }
    // Удаляем актор из Fields в конце
    fields.remove(this.id, false) // false, так как мы уже обработали детей
  }
  // -------------------------- Жизненный цикл -----------------------------------------

  /** Имя мета-схемы (попадает в системные сообщения). */
  public readonly meta: string

  public readonly id: string
}
