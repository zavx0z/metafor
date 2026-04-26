/**
 * Сущность `actor_value` — связь (actor, field) → value.
 *
 * Entanglement выражен через разделение записи `value`: если две строки
 * `actor_value` указывают на один `value.uuid`, акторы запутаны автоматически.
 *
 * Якорный файл сущности — под ним группируются:
 * - `actor_value.sql` — DDL (actor FK CASCADE, field FK→field.uuid CASCADE,
 *   value FK→value.uuid RESTRICT; PK (actor, field))
 * - `actor_value.U.ts` — Update (shareValue связать с другой записью, forkValue
 *   расщепить shared)
 *
 * ORM-класс `ActorFieldValue` — в этом файле; `share()`/`fork()` делегируют
 * в `actor_value.U.ts` (это сложные транзакции).
 */

import type { SQL } from "bun"
import type { ValueKind } from "./value.t.ts"
import { Value } from "./value.ts"
import { forkValue, shareValue } from "./actor_value.U.ts"

/**
 * ORM-инстанс связи `actor_value` (одно поле одного актора).
 *
 * Линк = пара (actor, field), указывающая на конкретный `value.uuid`.
 * `share()` подменяет указатель (entanglement), `fork()` расщепляет (создаёт
 * собственную копию `value`).
 */
export class ActorFieldValue {
  constructor(
    private readonly sql: SQL,
    readonly actor: string,
    readonly field: string,
  ) {}

  /** Текущий `Value` (точный подкласс) под этим линком. Бросает, если линк исчез. */
  async value(): Promise<Value> {
    const row = (
      await this.sql<Array<{ value: string; kind: string }>>`
        SELECT av.value AS value, v.kind AS kind
        FROM actor_value av
        INNER JOIN value v ON v.uuid = av.value
        WHERE av.actor = ${this.actor} AND av.field = ${this.field}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor_value (${this.actor}, ${this.field}) not found`)
    const found = await Value.get(this.sql, String(row.value))
    if (!found) throw new Error(`value ${row.value} missing for (${this.actor}, ${this.field}) [kind=${row.kind as ValueKind}]`)
    return found
  }

  /** Привязать актор-поле к существующей записи value (entanglement). */
  async share(valueUuid: string): Promise<void> {
    await shareValue(this.sql, this.actor, this.field, valueUuid)
  }

  /** Расщепить shared value: создаётся новая копия записи под этого актора. */
  async fork(): Promise<Value> {
    const newUuid = await forkValue(this.sql, this.actor, this.field)
    const found = await Value.get(this.sql, newUuid)
    if (!found) throw new Error(`forked value ${newUuid} not visible after commit`)
    return found
  }

  /** Возвращает инстанс или `null`, если линк отсутствует. */
  static async get(sql: SQL, actor: string, field: string): Promise<ActorFieldValue | null> {
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor_value WHERE actor = ${actor} AND field = ${field} LIMIT 1
      `
    )[0]
    return row ? new ActorFieldValue(sql, actor, field) : null
  }
}
