import type { StatesConfig } from "../meta/states"
import { type Context, type Update } from "@zavx0z/context"
import { Fields } from "./src/fields"
import type { Actor } from "./actor"
import type { ChunkPatches, ActorSnapshot } from "./gravity.t"
import { applyPatchesToSnapshot } from "./src/snapshot"
import { Source } from "./electromagnetic"
import type { Hidden, Values } from "./field.t"

export type { Hidden, Values }

export abstract class Field {
  public readonly id: string
  public readonly meta: string
  protected abstract state: { current: string; states: StatesConfig }

  public readonly λ: Hidden<Values>
  public fields: Values
  #eval: Update<Values>

  protected constructor(_: unknown, id: string, meta: string) {
    this.id = id
    this.meta = meta
    const hidden = _ as Context<Values>
    this.#eval = hidden.update
    this.fields = hidden.schema
    this.λ = hidden.context
  }

  // ------------------------------ скрытые параметры ----------------------------------------

  protected abstract requestUpdateContext(context: Partial<Hidden<Values>>, src: Source): boolean

  update(values: Partial<Hidden<Values>>, source: Source = Source.Nothing): Partial<Hidden<Values>> {
    const updated = this.#eval(values)
    if (Object.keys(updated).length > 0) {
      if (!this.requestUpdateContext(updated, source)) return {}
    }
    return updated
  }

  protected rollbackContext() {
    const snapshot = Field.getSnapshotByLastMessage()
    if (!snapshot) throw new Error("Snapshot not found")
    this.#eval(snapshot?.context)
  }

  protected rollbackState() {
    const snapshot = Field.getSnapshotByLastMessage()
    if (!snapshot) throw new Error("Snapshot not found")
    this.state.current = snapshot.state
  }

  // ---------------------------------------------------------------------

  protected static getActor(id: string): Actor {
    const fields = Fields.get()
    if (!fields) throw new Error("Fields not found")
    const actor = fields.getActor(id)
    if (!actor) throw new Error("Actor not found")
    return actor
  }

  public destroy(recursive: boolean) {
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
    } // false, так как мы уже обработали детей
    fields.remove(this.id, false)
  }
  // -------------------------- История акторов -----------------------------------------

  protected static histories: ChunkPatches[] = []
  protected static checkpoints: Array<{
    index: number
    snapshots: Map<string, ActorSnapshot>
    timestamp: number
  }> = []

  /** Последний сохраненный снапшот (метаданные) */
  private static lastSaved: { actor: string; snapshot: ActorSnapshot; timestamp: number } | null = null

  private static readonly MAX_PATCHES = 1000
  private static readonly MAX_CHECKPOINTS = 10

  // -------------------------- Методы для работы с глобальной историей -----------------------------------------

  protected static pushPatches(chunk: ChunkPatches): void {
    Field.histories.push(chunk)
    if (Field.histories.length >= Field.MAX_PATCHES) Field.createCheckpoint()
  }

  protected static saveActorSnapshot(actorId: string, snapshot: ActorSnapshot): void {
    if (Field.checkpoints.length === 0) {
      // Если нет чекпоинтов, создаем первый
      Field.createCheckpoint()
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!
    lastCheckpoint.snapshots.set(actorId, snapshot)
    Field.lastSaved = { actor: actorId, snapshot, timestamp: Date.now() }
  }

  /** Создает чекпоинт всех акторов и очищает старые патчи */
  protected static createCheckpoint(): void {
    const fields = Fields.get()
    if (!fields) return

    const snapshots = new Map<string, ActorSnapshot>()
    const allActors = fields.getAllActors()
    for (const actor of allActors) snapshots.set(actor.id, actor.snapshot)

    const checkpoint = { index: Field.histories.length, snapshots, timestamp: Date.now() }
    Field.checkpoints.push(checkpoint)

    // Очищаем старые чекпоинты
    if (Field.checkpoints.length > Field.MAX_CHECKPOINTS) {
      const toRemove = Field.checkpoints.length - Field.MAX_CHECKPOINTS
      Field.checkpoints.splice(0, toRemove)
    }

    // Очищаем старые патчи до последнего чекпоинта
    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]
    if (lastCheckpoint) {
      Field.histories.splice(0, lastCheckpoint.index)
    }
  }

  /** Откатывает всю систему к указанному времени */
  protected static rollbackSystem(targetTimestamp: number): boolean {
    // Находим ближайший чекпоинт
    const checkpoint = Field.findCheckpoint(targetTimestamp)
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
    const patchesToApply = Field.histories.slice(checkpoint.index).filter((chunk) => chunk.timestamp <= targetTimestamp)

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
  private static findCheckpoint(timestamp: number): (typeof Field.checkpoints)[0] | null {
    let closest = null
    let closestDiff = Infinity

    for (const checkpoint of Field.checkpoints) {
      const diff = Math.abs(checkpoint.timestamp - timestamp)
      if (diff < closestDiff) {
        closest = checkpoint
        closestDiff = diff
      }
    }

    return closest
  }

  /** Возвращает последний объект чекпоинта */
  protected static getLastCheckpoint(): (typeof Field.checkpoints)[0] | null {
    if (Field.checkpoints.length === 0) return null
    return Field.checkpoints[Field.checkpoints.length - 1]!
  }

  /** Очищает всю глобальную историю */
  protected static clearGlobalHistory(): void {
    Field.histories = []
    Field.checkpoints = []
    Field.lastSaved = null
  }

  /** Получает снапшот актора на основе последнего сообщения в истории */
  protected static getSnapshotByLastMessage(): ActorSnapshot | null {
    // Берем последнее сообщение в истории
    if (Field.histories.length === 0) {
      return null
    }

    const lastMessage = Field.histories[Field.histories.length - 1]!
    const actorId = lastMessage.actor

    // Находим последний чекпоинт
    if (Field.checkpoints.length === 0) {
      return null
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!

    // Берем снапшот актора из последнего чекпоинта
    const baseSnapshot = lastCheckpoint.snapshots.get(actorId)
    if (!baseSnapshot) {
      return null
    }

    // Применяем все патчи от последнего чекпоинта до конца истории
    let snapshot = { ...baseSnapshot }
    const patchesToApply = Field.histories.slice(lastCheckpoint.index)

    for (const chunk of patchesToApply) {
      if (chunk.actor === actorId) {
        // Применяем патчи к снапшоту
        snapshot = applyPatchesToSnapshot(snapshot, chunk.patches)
      }
    }

    return snapshot
  }

  /** Получает снапшот актора из последнего чекпоинта */
  protected static getActorSnapshotFromCheckpoint(actorId: string): ActorSnapshot | null {
    if (Field.checkpoints.length === 0) {
      return null
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!
    return lastCheckpoint.snapshots.get(actorId) || null
  }

  /** Возвращает последний сохраненный снапшот (без вычислений) */
  protected static getLastSavedSnapshot(): ActorSnapshot | null {
    return Field.lastSaved ? Field.lastSaved.snapshot : null
  }
}
