import type { FieldObjectInit } from "@dark/types/strong"

/**
 * Каноническая instance-level ORM-сущность поля внутри конкретного `Wimp`.
 *
 * Значение и `source` живут на instance-level, а `key`/`schema`
 * читаются через ссылку на канонический `MetaField`.
 */
export class InstanceField {
  /** Уникальный идентификатор экземпляра поля. */
  readonly id: string
  /** `Wimp`, которому принадлежит это поле. */
  readonly owner: FieldObjectInit["owner"]
  /** Каноническое meta-поле, описывающее это instance field. */
  readonly metaField: FieldObjectInit["metaField"]
  /** Текущее значение поля. */
  value: unknown
  /** Прямая ссылка на поле родителя, если такая связь есть. */
  source: InstanceField | null

  /**
   * Создаёт instance-level ORM-поле для конкретного `Wimp`.
   *
   * @param init Полная инициализация поля: владелец, meta-field, значение и необязательная ссылка на поле-источник.
   */
  constructor(init: FieldObjectInit) {
    this.id = crypto.randomUUID()
    this.owner = init.owner
    this.metaField = init.metaField
    this.value = structuredClone(init.value)
    this.source = init.source ?? null
  }

  /**
   * Удобный ORM-доступ к локальному ключу через `MetaField`.
   */
  get key() {
    return this.metaField.key
  }

  /**
   * Удобный ORM-доступ к схеме через `MetaField`.
   */
  get schema() {
    return this.metaField.schema
  }
}

export { InstanceField as Field }
