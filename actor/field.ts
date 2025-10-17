import type { StatesConfig } from "../meta/states.t"
import { type Context, type Schema } from "@zavx0z/context"
import { Fields } from "./src/fields"
import type { Actor } from "./actor"
import type { HistoryEntry } from "./field.t"
import type { ChunkPatches, ActorSnapshot } from "./gravity.t"

export abstract class Field {
  public readonly meta: string
  public readonly id: string
  protected abstract ctx: Context<Schema>
  protected abstract state: { current: string; states: StatesConfig }

  // -------------------------- История акторов -----------------------------------------

  protected static histories: ChunkPatches[] = []
  protected static checkpoints: Array<{
    index: number
    snapshots: Map<string, ActorSnapshot>
    timestamp: number
  }> = []

  private static readonly MAX_PATCHES = 1000
  private static readonly MAX_CHECKPOINTS = 10

  // -------------------------- Методы для работы с глобальной историей -----------------------------------------

  /** Добавляет патчи в глобальную историю */
  protected static pushPatches(chunk: ChunkPatches): void {
    this.histories.push(chunk)

    if (this.histories.length >= this.MAX_PATCHES) {
      this.createCheckpoint()
    }
  }

  /** Создает чекпоинт всех акторов и очищает старые патчи */
  protected static createCheckpoint(): void {
    const fields = Fields.get()
    if (!fields) return

    const snapshots = new Map<string, ActorSnapshot>()
    const allActors = fields.getAllActors()
    for (const actor of allActors) snapshots.set(actor.id, actor.snapshot)

    const checkpoint = { index: this.histories.length, snapshots, timestamp: Date.now() }
    this.checkpoints.push(checkpoint)

    // Очищаем старые чекпоинты
    if (this.checkpoints.length > this.MAX_CHECKPOINTS) {
      const toRemove = this.checkpoints.length - this.MAX_CHECKPOINTS
      this.checkpoints.splice(0, toRemove)
    }

    // Очищаем старые патчи до последнего чекпоинта
    const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1]
    if (lastCheckpoint) {
      this.histories.splice(0, lastCheckpoint.index)
    }
  }

  /** Откатывает всю систему к указанному времени */
  protected static rollbackSystem(targetTimestamp: number): boolean {
    // Находим ближайший чекпоинт
    const checkpoint = this.findCheckpoint(targetTimestamp)
    if (!checkpoint) return false

    // Восстанавливаем снапшоты из чекпоинта
    const fields = Fields.get()
    if (!fields) return false

    for (const [actorId, snapshot] of checkpoint.snapshots) {
      const actor = fields.getActor(actorId)
      if (actor) {
        // Восстанавливаем снапшот актора (нужно будет реализовать в gravity)
        // actor.restoreSnapshot(snapshot)
      }
    }

    // Применяем патчи от чекпоинта до целевого времени
    const patchesToApply = this.histories.slice(checkpoint.index).filter((chunk) => chunk.timestamp <= targetTimestamp)

    for (const chunk of patchesToApply) {
      const actor = fields.getActor(chunk.actor)
      if (actor) {
        // Применяем патчи к актору (нужно будет реализовать в gravity)
        // actor.applyPatches(chunk.patches)
      }
    }

    return true
  }

  /** Находит ближайший чекпоинт к указанному времени */
  private static findCheckpoint(timestamp: number): (typeof this.checkpoints)[0] | null {
    let closest = null
    let closestDiff = Infinity

    for (const checkpoint of this.checkpoints) {
      const diff = Math.abs(checkpoint.timestamp - timestamp)
      if (diff < closestDiff) {
        closest = checkpoint
        closestDiff = diff
      }
    }

    return closest
  }

  /** Очищает всю глобальную историю */
  protected static clearGlobalHistory(): void {
    this.histories = []
    this.checkpoints = []
  }

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
