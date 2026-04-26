import type { SQL } from "bun"
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
 * Скаляры (`name`, `desc`, `mass`, `bulk`) — методы (async, без кеша).
 * Коллекции (`fields`, `superposition`, `processes`, `reactions`, `matter`) —
 * Django-style managers с `.all() / .get(filter) / .count() / .exists()`.
 *
 * Каждое обращение — отдельный SELECT в БД; никакого in-memory кеша внутри
 * инстанса. Свежесть данных гарантирована.
 */
export class Meta {
  readonly fields: Fields
  readonly superposition: Superposition
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter

  constructor(
    private readonly sql: SQL,
    readonly src: string,
  ) {
    this.fields = new Fields(sql, src)
    this.superposition = new Superposition(sql, src, this.fields)
    this.processes = new Processes(sql, src, this.fields)
    this.reactions = new Reactions(sql, src, this.fields)
    this.matter = new Matter(sql, src)
  }

  /** Имя меты (или последний сегмент `src`, если name не задан). */
  async name(): Promise<string> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.name ?? this.src.split("/").pop() ?? this.src
  }

  /** Описание меты или `undefined`. */
  async desc(): Promise<string | undefined> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.desc ?? undefined
  }

  /** Mass-словарь меты или `undefined`. */
  async mass(): Promise<MetaDSL["mass"]> {
    return getMass(this.sql, this.src)
  }

  /** Bulk (CSS) или `undefined`. */
  async bulk(): Promise<MetaDSL["bulk"]> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.view_css ? ({ view: row.view_css } as MetaDSL["bulk"]) : undefined
  }

  /** Удаляет эту мету из БД. Каскад FK снимет всё дерево декларации. */
  async delete(): Promise<void> {
    await metaDelete(this.sql, this.src)
  }

  /**
   * Идемпотентно перезаписывает декларацию меты по `src` (DELETE-then-INSERT).
   * Возвращает новый Meta-инстанс.
   */
  static async create(sql: SQL, src: string, dsl: MetaDSL): Promise<Meta> {
    await metaCreate(sql, src, dsl)
    return new Meta(sql, src)
  }

  /** Возвращает Meta-инстанс, либо `null` если меты с таким `src` нет. */
  static async get(sql: SQL, src: string): Promise<Meta | null> {
    return (await getMetaRow(sql, src)) === null ? null : new Meta(sql, src)
  }

  /** Удаляет мету по `src` (без создания инстанса). */
  static async delete(sql: SQL, src: string): Promise<void> {
    await metaDelete(sql, src)
  }
}
