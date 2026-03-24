import type { MetaFieldInit } from "@dark/types/strong"

/**
 * Каноническое meta-поле, принадлежащее `Meta`.
 *
 * Это meta-level сущность: `key` и `schema` живут здесь как source of truth,
 * а instance-поля лишь ссылаются на неё.
 */
export class MetaField {
  /** Уникальный идентификатор meta-поля. */
  readonly id: string
  /** Каноническая Meta-владелица этого поля. */
  readonly ownerMeta: MetaFieldInit["ownerMeta"]
  /** Локальный ключ поля внутри схемы меты. */
  readonly key: MetaFieldInit["key"]
  /** Каноническое содержимое meta-поля. */
  readonly schema: MetaFieldInit["schema"]

  constructor(init: MetaFieldInit) {
    this.id = crypto.randomUUID()
    this.ownerMeta = init.ownerMeta
    this.key = init.key
    this.schema = structuredClone(init.schema)
  }
}
