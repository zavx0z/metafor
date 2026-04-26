import type { SQL } from "bun"
import { generateUuid } from "./_helpers.ts"

/**
 * Связывает актор-поле с существующей записью value (entanglement).
 * Если у actor-поля уже была запись и она orphan-нулась — удаляется (каскад
 * снимет данные из всех типизированных value_<kind> и value_list_item_*).
 */
export const shareValue = async (sql: SQL, actor: string, field: string, value: string): Promise<void> => {
  await sql.begin(async (tx) => {
    const oldRows = await tx<Array<{ value: string }>>`
      SELECT value FROM actor_value WHERE actor = ${actor} AND field = ${field}
    `
    const oldRow = oldRows[0] ?? null
    const oldValueId = oldRow?.value
    await tx`
      INSERT INTO actor_value (actor, field, value) VALUES (${actor}, ${field}, ${value})
      ON CONFLICT (actor, field) DO UPDATE SET value = excluded.value
    `
    if (oldValueId !== undefined && oldValueId !== value) {
      await tx`
        DELETE FROM value WHERE uuid = ${oldValueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)
      `
    }
  })
}

/**
 * Расщепляет shared value: создаёт новую копию записи value (со всеми
 * типизированными подтаблицами и list-item-ами) под одного актор-поле,
 * остальные акторы продолжают делить старую. Возвращает новый uuid value.
 */
export const forkValue = async (sql: SQL, actor: string, field: string): Promise<string> => {
  const newUuid = generateUuid()

  await sql.begin(async (tx) => {
    const sharedRows = await tx<Array<{ value: string }>>`
      SELECT value FROM actor_value WHERE actor = ${actor} AND field = ${field}
    `
    const sharedRow = sharedRows[0] ?? null
    if (!sharedRow) {
      throw new Error(`actor_value (${actor}, ${field}) not found — cannot fork`)
    }
    const sourceUuid = sharedRow.value

    // копируем корневую value-запись
    const rootRows = await tx<Array<{ kind: string }>>`SELECT kind FROM value WHERE uuid = ${sourceUuid}`
    const rootRow = rootRows[0] ?? null
    if (!rootRow) throw new Error(`source value ${sourceUuid} missing`)
    await tx`INSERT INTO value (uuid, kind) VALUES (${newUuid}, ${rootRow.kind})`

    // копируем содержимое типизированной подтаблицы (если она есть для kind)
    switch (rootRow.kind) {
      case "boolean": {
        const r = (await tx<Array<{ boolean: number }>>`SELECT boolean FROM value_boolean WHERE value = ${sourceUuid}`)[0] ?? null
        if (r) await tx`INSERT INTO value_boolean (value, boolean) VALUES (${newUuid}, ${r.boolean})`
        break
      }
      case "number": {
        const r = (await tx<Array<{ number: number }>>`SELECT number FROM value_number WHERE value = ${sourceUuid}`)[0] ?? null
        if (r) await tx`INSERT INTO value_number (value, number) VALUES (${newUuid}, ${r.number})`
        break
      }
      case "string": {
        const r = (await tx<Array<{ text: string }>>`SELECT text FROM value_string WHERE value = ${sourceUuid}`)[0] ?? null
        if (r) await tx`INSERT INTO value_string (value, text) VALUES (${newUuid}, ${r.text})`
        break
      }
      case "enum": {
        const r = (await tx<Array<{ variant: string }>>`SELECT variant FROM value_enum WHERE value = ${sourceUuid}`)[0] ?? null
        if (r) await tx`INSERT INTO value_enum (value, variant) VALUES (${newUuid}, ${r.variant})`
        break
      }
      case "list": {
        // копируем все list-item записи (плоская таблица, item_value TEXT)
        const items = await tx<Array<{ position: number; item_value: string }>>`
          SELECT position, item_value FROM value_list_item WHERE value = ${sourceUuid}
        `
        for (const item of items) {
          await tx`
            INSERT INTO value_list_item (value, position, item_value) VALUES (${newUuid}, ${item.position}, ${item.item_value})
          `
        }
        break
      }
      // для 'null' дополнительная подтаблица отсутствует
    }

    // переключаем actor_value на новую запись
    await tx`UPDATE actor_value SET value = ${newUuid} WHERE actor = ${actor} AND field = ${field}`
  })

  return newUuid
}
