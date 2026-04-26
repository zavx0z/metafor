import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../metafor.t.ts"
import { getMass, getMetaRow, metaCreate, metaDelete } from "./sqlite"
import { Fields } from "./fields.ts"
import { Superposition } from "./superposition.ts"
import { Processes } from "./processes.ts"
import { Reactions } from "./reactions.ts"
import { Matter } from "./matter.ts"

/**
 * Один инстанс декларации меты — корневой ORM-объект пакета `@store/meta`.
 *
 * Скаляры (`name`, `mass`, `bulk`, `desc`) — ленивые getter-ы.
 * Коллекции (`fields`, `superposition`, `processes`, `reactions`, `matter`) —
 * Django-style managers с `.all() / .get(filter) / .count() / .exists()`.
 */
export class Meta {
  readonly fields: Fields
  readonly superposition: Superposition
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter

  constructor(
    private readonly db: Database,
    readonly src: string,
  ) {
    this.fields = new Fields(db, src)
    this.superposition = new Superposition(db, src, this.fields)
    this.processes = new Processes(db, src, this.fields)
    this.reactions = new Reactions(db, src, this.fields)
    this.matter = new Matter(db, src)
  }

  /** Имя меты (или последний сегмент `src`, если name не задан). */
  get name(): string {
    return getMetaRow(this.db, this.src)?.name ?? this.src.split("/").pop() ?? this.src
  }

  /** Описание меты или `undefined`. */
  get desc(): string | undefined {
    return getMetaRow(this.db, this.src)?.desc ?? undefined
  }

  /** Mass-словарь меты или `undefined`. */
  get mass(): MetaDSL["mass"] {
    return getMass(this.db, this.src)
  }

  /** Bulk (CSS) или `undefined`. */
  get bulk(): MetaDSL["bulk"] {
    const row = getMetaRow(this.db, this.src)
    return row?.view_css ? ({ view: row.view_css } as MetaDSL["bulk"]) : undefined
  }

  /** Удаляет эту мету из БД. Каскад FK снимет всё дерево декларации. */
  delete(): void {
    metaDelete(this.db, this.src)
  }

  /**
   * Идемпотентно перезаписывает декларацию меты по `src` (DELETE-then-INSERT).
   * Возвращает новый Meta-инстанс.
   */
  static create(db: Database, src: string, dsl: MetaDSL): Meta {
    metaCreate(db, src, dsl)
    return new Meta(db, src)
  }

  /** Возвращает Meta-инстанс, либо `null` если меты с таким `src` нет. */
  static get(db: Database, src: string): Meta | null {
    return getMetaRow(db, src) === null ? null : new Meta(db, src)
  }

  /** Удаляет мету по `src` (без создания инстанса). */
  static delete(db: Database, src: string): void {
    metaDelete(db, src)
  }
}
