import type { Superposition } from "../dsl/meta/states.t";
import { type Context, type Update } from "@zavx0z/context";
import { Fields } from "./src/fields";
import type { Atom } from "./atom";
import type { ImpulsesChunk, AtomPayload } from "./gravity.t";
import { applyPatchesToSnapshot } from "./src/snapshot";
import type { Hidden, Values, Destroy } from "./field.t";
import type { Self } from "../dsl/meta/metafor.t";
import { type Photon } from "./em";

export type { Hidden, Values, Destroy };

export abstract class Field {
  public abstract get self(): Self;

  public readonly id: string;
  public readonly meta: string;
  protected abstract eigenstates: Superposition;
  protected state: string = undefined as unknown as string;

  public readonly λ: Hidden<Values>;
  public fields: Values;
  static get fields(): Fields {
    return Fields.get();
  }
  update: Update<Values>;

  protected constructor(_: unknown, id: string, meta: string) {
    this.id = id;
    this.meta = meta;
    const hidden = _ as Context<Values>;
    this.update = hidden.update;
    this.fields = hidden.schema;
    this.λ = hidden.context;
  }

  // ---------------------------------------------------------------------

  protected static get atoms() {
    return Array.from(Field.fields.atoms.values());
  }

  protected static getAtom(id: string): Atom {
    if (!Field.fields) throw new Error("Fields not found");
    const atom = Field.fields.getAtom(id);
    if (!atom) throw new Error("Atom not found");
    return atom;
  }

  protected static getPath(id: string): string {
    return Field.fields.getPath(id);
  }

  protected static getChildren(parentId: string | null): readonly string[] {
    return Field.fields.getChildren(parentId);
  }

  public destroy() {
    Field.fields.remove(this.id, false);
  }
  // -------------------------- История атомов -----------------------------------------
  private static readonly MAX_PATCHES = 1000;
  private static readonly MAX_CHECKPOINTS = 10;
  protected static histories: ImpulsesChunk[] = [];
  protected static checkpoints: Array<{
    index: number;
    snapshots: Map<string, AtomPayload>;
    timestamp: number;
  }> = [];

  /** Последний сохраненный снапшот (метаданные) */
  private static lastSaved: {
    atom: string;
    snapshot: AtomPayload;
    timestamp: number;
  } | null = null;

  static propagation(photon: Photon) {
    if (!photon) return false;
    for (const patch of photon.impulses) {
      if (patch.path === "/" && patch.op === "add") {
        Field.saveAtomSnapshot(photon.atom, patch.value);
      } else {
        Field.histories.push(photon);
        if (Field.histories.length >= Field.MAX_PATCHES)
          Field.createCheckpoint();
      }
    }
  }

  protected rollbackContext() {
    const snapshot = Field.getSnapshotByLastMessage();
    if (!snapshot) throw new Error("Snapshot not found");
    this.update(snapshot?.context);
  }

  protected rollbackState() {
    const snapshot = Field.getSnapshotByLastMessage();
    if (!snapshot) throw new Error("Snapshot not found");
    this.state = snapshot.state;
  }

  // -------------------------- Методы для работы с глобальной историей -----------------------------------------

  protected static pushPatches(chunk: ImpulsesChunk): void {
    Field.histories.push(chunk);
    if (Field.histories.length >= Field.MAX_PATCHES) Field.createCheckpoint();
  }

  protected static saveAtomSnapshot(
    atomId: string,
    snapshot: AtomPayload,
  ): void {
    if (Field.checkpoints.length === 0) {
      // Если нет чекпоинтов, создаем первый
      Field.createCheckpoint();
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!;
    lastCheckpoint.snapshots.set(atomId, snapshot);
    Field.lastSaved = { atom: atomId, snapshot, timestamp: Date.now() };
  }

  /** Создает чекпоинт всех атомов и очищает старые патчи */
  protected static createCheckpoint(): void {
    const fields = Fields.get();
    if (!fields) return;

    const snapshots = new Map<string, AtomPayload>();
    for (const atom of fields.getAllAtoms())
      snapshots.set(atom.id, atom.snapshot);

    const checkpoint = {
      index: Field.histories.length,
      snapshots,
      timestamp: Date.now(),
    };
    Field.checkpoints.push(checkpoint);

    // Очищаем старые чекпоинты
    if (Field.checkpoints.length > Field.MAX_CHECKPOINTS) {
      const toRemove = Field.checkpoints.length - Field.MAX_CHECKPOINTS;
      Field.checkpoints.splice(0, toRemove);
    }

    // Очищаем старые патчи до последнего чекпоинта
    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1];
    if (lastCheckpoint) {
      Field.histories.splice(0, lastCheckpoint.index);
    }
  }

  protected static historyChunks(): readonly ImpulsesChunk[] {
    return Field.histories.slice();
  }

  /** Откатывает всю систему к указанному времени */
  protected static rollbackSystem(targetTimestamp: number): boolean {
    // Находим ближайший чекпоинт
    const checkpoint = Field.findCheckpoint(targetTimestamp);
    if (!checkpoint) return false;

    // Восстанавливаем снапшоты из чекпоинта
    const fields = Fields.get();
    if (!fields) return false;

    for (const [atomId, snapshot] of checkpoint.snapshots) {
      const atom = fields.getAtom(atomId);
      if (atom) {
        // Восстанавливаем снапшот атома (нужно будет реализовать в gravity)
        // atom.restoreSnapshot(snapshot)
      }
    }

    // Применяем патчи от чекпоинта до целевого времени
    const patchesToApply = Field.histories
      .slice(checkpoint.index)
      .filter((chunk) => chunk.timestamp <= targetTimestamp);

    for (const chunk of patchesToApply) {
      const atom = fields.getAtom(chunk.atom);
      if (atom) {
        // Применяем патчи к атому (нужно будет реализовать в gravity)
        // atom.applyPatches(chunk.patches)
      }
    }

    return true;
  }

  /** Находит ближайший чекпоинт к указанному времени */
  private static findCheckpoint(
    timestamp: number,
  ): (typeof Field.checkpoints)[0] | null {
    let closest = null;
    let closestDiff = Infinity;

    for (const checkpoint of Field.checkpoints) {
      const diff = Math.abs(checkpoint.timestamp - timestamp);
      if (diff < closestDiff) {
        closest = checkpoint;
        closestDiff = diff;
      }
    }

    return closest;
  }

  /** Возвращает последний объект чекпоинта */
  protected static getLastCheckpoint(): (typeof Field.checkpoints)[0] | null {
    if (Field.checkpoints.length === 0) return null;
    return Field.checkpoints[Field.checkpoints.length - 1]!;
  }

  /** Очищает всю глобальную историю */
  protected static clearGlobalHistory(): void {
    Field.histories = [];
    Field.checkpoints = [];
    Field.lastSaved = null;
  }

  /** Получает снапшот атома на основе последнего сообщения в истории */
  protected static getSnapshotByLastMessage(): AtomPayload | null {
    // Берем последнее сообщение в истории
    if (Field.histories.length === 0) {
      return null;
    }

    const lastMessage = Field.histories[Field.histories.length - 1]!;
    const atomId = lastMessage.atom;

    // Находим последний чекпоинт
    if (Field.checkpoints.length === 0) {
      return null;
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!;

    // Берем снапшот атома из последнего чекпоинта
    const baseSnapshot = lastCheckpoint.snapshots.get(atomId);
    if (!baseSnapshot) {
      return null;
    }

    // Применяем все патчи от последнего чекпоинта до конца истории
    let snapshot = { ...baseSnapshot };
    const patchesToApply = Field.histories.slice(lastCheckpoint.index);

    for (const chunk of patchesToApply) {
      if (chunk.atom === atomId) {
        // Применяем патчи к снапшоту
        snapshot = applyPatchesToSnapshot(snapshot, chunk.impulses);
      }
    }

    return snapshot;
  }

  /** Получает снапшот атома из последнего чекпоинта */
  protected static getAtomSnapshotFromCheckpoint(
    atomId: string,
  ): AtomPayload | null {
    if (Field.checkpoints.length === 0) {
      return null;
    }

    const lastCheckpoint = Field.checkpoints[Field.checkpoints.length - 1]!;
    return lastCheckpoint.snapshots.get(atomId) || null;
  }

  /** Возвращает последний сохраненный снапшот (без вычислений) */
  protected static getLastSavedSnapshot(): AtomPayload | null {
    return Field.lastSaved ? Field.lastSaved.snapshot : null;
  }
}
