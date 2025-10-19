import type { Superposition } from "../meta/states"
import { type Context, type Update } from "@zavx0z/context"
import { Fields } from "./src/fields"
import type { Atom } from "./atom"
import type { ChunkPatches, AtomSnapshot } from "./gravity.t"
import { applyPatchesToSnapshot } from "./src/snapshot"
import { Initiator, type Photon } from "./em"
import type { Hidden, Values, Destroy } from "./field.t"
import type { Self } from "../meta/metafor"

export type { Hidden, Values, Destroy }

export abstract class Field {
  public abstract get self(): Self

  public readonly id: string
  public readonly meta: string
  protected abstract eigenstates: Superposition
  protected state: string = undefined as unknown as string

  public readonly λ: Hidden<Values>
  public fields: Values
  static get fields(): Fields {
    return Fields.get()
  }
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

  protected abstract emitEvolution(context: Partial<Hidden<Values>>, initiator: Initiator): boolean

  /**
   * Обновляет контекст атома и возвращает обновленные значения.
   * @param values Обновляемые значения.
   * @param source Источник обновления.
   * @returns Обновленные значения.
   */
  evaluate(values: Partial<Hidden<Values>>, source: Initiator = Initiator.Nothing): Partial<Hidden<Values>> {
    const updated = this.#eval(values)
    if (Object.keys(updated).length > 0) {
      if (!this.emitEvolution(updated, source)) return {}
    }
    return updated
  }

  // ---------------------------------------------------------------------

  protected static get atoms() {
    return Array.from(Field.fields.atoms.values())
  }

  protected static getAtom(id: string): Atom {
    if (!Field.fields) throw new Error("Fields not found")
    const atom = Field.fields.getAtom(id)
    if (!atom) throw new Error("Atom not found")
    return atom
  }

  protected static getPath(id: string): string {
    return Field.fields.getPath(id)
  }

  protected static getChildren(parentId: string | null): readonly string[] {
    return Field.fields.getChildren(parentId)
  }

  public destroy(recursive: boolean) {
    if (recursive) {
      while (true) {
        const children = Field.fields.getChildren(this.id)
        if (children.length === 0) break
        const childId = children[0]! // Берем первого ребенка
        const childAtom = Field.fields.getAtom(childId)
        if (childAtom) childAtom.destroy(true)
        else break // Если атом не найден, выходим из цикла
      }
    } // false, так как мы уже обработали детей
    Field.fields.remove(this.id, false)
  }
  // -------------------------- История атомов -----------------------------------------
  private static readonly MAX_PATCHES = 1000
  private static readonly MAX_CHECKPOINTS = 10
  protected static histories: ChunkPatches[] = []
  protected static checkpoints: Array<{
    index: number
    snapshots: Map<string, AtomSnapshot>
    timestamp: number
  }> = []

  /** Последний сохраненный снапшот (метаданные) */
  private static lastSaved: { atom: string; snapshot: AtomSnapshot; timestamp: number } | null = null

  static propagation(photon: Photon) {
    if (!photon) return false
    for (const patch of photon.patches) {
      if (patch.path === "/" && patch.op === "add") {
        Field.saveAtomSnapshot(photon.atom, patch.value)
      } else {
        Field.histories.push(photon)
        if (Field.histories.length >= Field.MAX_PATCHES) Field.createCheckpoint()
      }
    }
  }

  protected rollbackContext() {
    const snapshot = Field.getSnapshotByLastMessage()
    if (!snapshot) throw new Error("Snapshot not found")
    this.#eval(snapshot?.context)
  }

  protected rollbackState() {
    const snapshot = Field.getSnapshotByLastMessage()
    if (!snapshot) throw new Error("Snapshot not found")
    this.state = snapshot.state
  }

  // -------------------------- Методы для работы с глобальной историей -----------------------------------------

  protected static pushPatches(chunk: ChunkPatches): void {
    Field.histories.push(chunk)
    if (Field.histories.length >= Field.MAX_PATCHES) Field.createCheckpoint()
  }

  protected static saveAtomSnapshot(atomId: string, snapshot: AtomSnapshot): void {
    if (Field.checkpoints.length === 0) {
      // Если нет чекпоинтов, создаем первый
      Field.createCheckpoint()
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!
    lastCheckpoint.snapshots.set(atomId, snapshot)
    Field.lastSaved = { atom: atomId, snapshot, timestamp: Date.now() }
  }

  /** Создает чекпоинт всех атомов и очищает старые патчи */
  protected static createCheckpoint(): void {
    const fields = Fields.get()
    if (!fields) return

    const snapshots = new Map<string, AtomSnapshot>()
    for (const atom of fields.getAllAtoms()) snapshots.set(atom.id, atom.snapshot)

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

    for (const [atomId, snapshot] of checkpoint.snapshots) {
      const atom = fields.getAtom(atomId)
      if (atom) {
        // Восстанавливаем снапшот атома (нужно будет реализовать в gravity)
        // atom.restoreSnapshot(snapshot)
      }
    }

    // Применяем патчи от чекпоинта до целевого времени
    const patchesToApply = Field.histories.slice(checkpoint.index).filter((chunk) => chunk.timestamp <= targetTimestamp)

    for (const chunk of patchesToApply) {
      const atom = fields.getAtom(chunk.atom)
      if (atom) {
        // Применяем патчи к атому (нужно будет реализовать в gravity)
        // atom.applyPatches(chunk.patches)
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

  /** Получает снапшот атома на основе последнего сообщения в истории */
  protected static getSnapshotByLastMessage(): AtomSnapshot | null {
    // Берем последнее сообщение в истории
    if (Field.histories.length === 0) {
      return null
    }

    const lastMessage = Field.histories[Field.histories.length - 1]!
    const atomId = lastMessage.atom

    // Находим последний чекпоинт
    if (Field.checkpoints.length === 0) {
      return null
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!

    // Берем снапшот атома из последнего чекпоинта
    const baseSnapshot = lastCheckpoint.snapshots.get(atomId)
    if (!baseSnapshot) {
      return null
    }

    // Применяем все патчи от последнего чекпоинта до конца истории
    let snapshot = { ...baseSnapshot }
    const patchesToApply = Field.histories.slice(lastCheckpoint.index)

    for (const chunk of patchesToApply) {
      if (chunk.atom === atomId) {
        // Применяем патчи к снапшоту
        snapshot = applyPatchesToSnapshot(snapshot, chunk.patches)
      }
    }

    return snapshot
  }

  /** Получает снапшот атома из последнего чекпоинта */
  protected static getAtomSnapshotFromCheckpoint(atomId: string): AtomSnapshot | null {
    if (Field.checkpoints.length === 0) {
      return null
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!
    return lastCheckpoint.snapshots.get(atomId) || null
  }

  /** Возвращает последний сохраненный снапшот (без вычислений) */
  protected static getLastSavedSnapshot(): AtomSnapshot | null {
    return Field.lastSaved ? Field.lastSaved.snapshot : null
  }
}
