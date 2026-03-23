import type { FieldObjectInit } from "@dark/types/strong"

/**
 * Каноническая ORM-сущность поля внутри конкретного `Wimp`.
 *
 * Поле живёт не в глобальном store, а прямо в локальном object graph владельца.
 */
export class Field {
  /** Уникальный runtime-идентификатор field instance. */
  readonly id: string
  /** Локальный ключ поля в схеме владельца. */
  key: FieldObjectInit["key"]
  /** `Wimp`, которому принадлежит это поле. */
  owner: FieldObjectInit["owner"]
  /** Локальная schema поля, закреплённая за владельцем. */
  schema: FieldObjectInit["schema"]
  /** Текущее runtime-значение поля. */
  value: unknown
  /** Прямой ordinary-source link на field родителя, если он есть. */
  source: Field | null

  constructor(init: FieldObjectInit) {
    this.id = crypto.randomUUID()
    this.key = init.key
    this.owner = init.owner
    this.schema = structuredClone(init.schema)
    this.value = structuredClone(init.value)
    this.source = init.source ?? null
  }
}
