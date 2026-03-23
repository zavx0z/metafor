import type { FieldObjectInit } from "@dark/types/strong"

/**
 * Каноническая ORM-сущность поля внутри конкретного `Wimp`.
 *
 * Поле живёт не в глобальном хранилище, а прямо в локальном объектном графе владельца.
 */
export class Field {
  /** Уникальный идентификатор экземпляра поля. */
  readonly id: string
  /** Локальный ключ поля в схеме владельца. */
  key: FieldObjectInit["key"]
  /** `Wimp`, которому принадлежит это поле. */
  owner: FieldObjectInit["owner"]
  /** Локальная схема поля, закреплённая за владельцем. */
  schema: FieldObjectInit["schema"]
  /** Текущее значение поля. */
  value: unknown
  /** Прямая ссылка на поле родителя, если такая связь есть. */
  source: Field | null

  /**
   * Создаёт локальное ORM-поле для конкретного `Wimp`.
   *
   * @param init Полная инициализация поля: ключ, владелец, схема, значение и необязательная ссылка на поле-источник.
   */
  constructor(init: FieldObjectInit) {
    this.id = crypto.randomUUID()
    this.key = init.key
    this.owner = init.owner
    this.schema = structuredClone(init.schema)
    this.value = structuredClone(init.value)
    this.source = init.source ?? null
  }
}
