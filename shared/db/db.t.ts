import type { FieldKey } from "@metafor/ast"

/**
 * Краткая схема поля, достаточная для общей плоской DB-проекции.
 *
 * Это снимок схемы поля из materialized `Dark`, пригодный для табличного чтения
 * и индексного доступа в downstream-слоях.
 *
 * @property type Исходный тип поля из схемы `Dark`.
 * @property required Признак обязательного поля.
 * @property topology Признак topology-поля (`enum` или `array`).
 * @property label Подпись поля, если она есть в схеме.
 * @property values Список допустимых значений, если схема его задаёт.
 */
export interface SharedDbFieldSchemaRecord {
  /** Исходный тип поля из схемы `Dark`. */
  type: string
  /** Признак обязательного поля. */
  required: boolean
  /** Признак topology-поля (`enum` или `array`). */
  topology: boolean
  /** Подпись поля, если она есть в схеме. */
  label?: string
  /** Список допустимых значений, если схема его задаёт. */
  values?: Array<string | number>
}

/**
 * Запись браны в общей плоской DB-проекции.
 *
 * Одна materialized `Wimp` даёт ровно одну brane-запись.
 *
 * @property index Стабильный индекс браны внутри плоской таблицы.
 * @property darkWimpId Идентификатор исходного `Dark Wimp`.
 * @property src SRC-адрес меты.
 * @property name Имя меты, если оно уже загружено в `Dark`.
 * @property fieldOffset Смещение первого поля этой браны в общей таблице полей.
 * @property fieldCount Количество полей, принадлежащих бране.
 */
export interface SharedDbBraneRecord {
  /** Стабильный индекс браны внутри плоской таблицы. */
  index: number
  /** Идентификатор исходного `Dark Wimp`. */
  darkWimpId: string
  /** SRC-адрес меты. */
  src: string
  /** Имя меты, если оно уже загружено в `Dark`. */
  name?: string
  /** Смещение первого поля этой браны в общей таблице полей. */
  fieldOffset: number
  /** Количество полей, принадлежащих бране. */
  fieldCount: number
}

/**
 * Запись поля в общей плоской DB-проекции.
 *
 * @property index Стабильный индекс поля внутри плоской таблицы.
 * @property darkFieldId Идентификатор исходного `Dark Field`.
 * @property ownerBraneIndex Индекс браны-владельца.
 * @property key Локальный ключ поля внутри владельца.
 * @property schema Краткий снимок схемы поля.
 */
export interface SharedDbFieldRecord {
  /** Стабильный индекс поля внутри плоской таблицы. */
  index: number
  /** Идентификатор исходного `Dark Field`. */
  darkFieldId: string
  /** Индекс браны-владельца. */
  ownerBraneIndex: number
  /** Локальный ключ поля внутри владельца. */
  key: FieldKey
  /** Краткий снимок схемы поля. */
  schema: SharedDbFieldSchemaRecord
}

/**
 * Запись текущего значения поля.
 *
 * @property fieldIndex Индекс поля в плоской таблице полей.
 * @property value Текущее значение поля из `Dark`.
 */
export interface SharedDbFieldValueRecord {
  /** Индекс поля в плоской таблице полей. */
  fieldIndex: number
  /** Текущее значение поля из `Dark`. */
  value: unknown
}

/**
 * Прямая ordinary source-связь между двумя полями.
 *
 * Topology-поля не попадают в эту таблицу, даже если downstream-пакеты
 * используют их как обычные записи поля и значения.
 *
 * @property childFieldIndex Индекс дочернего поля.
 * @property parentFieldIndex Индекс родительского поля-источника.
 */
export interface SharedDbFieldSourceRecord {
  /** Индекс дочернего поля. */
  childFieldIndex: number
  /** Индекс родительского поля-источника. */
  parentFieldIndex: number
}

/**
 * Общая плоская DB-проекция из materialized `Dark`.
 *
 * Плоские массивы и индексы собираются один раз, чтобы downstream-код работал
 * с готовым DB-shaped снимком, а не повторно обходил объектный граф `Dark`.
 *
 * @property rootBraneIndex Индекс корневой браны, из которой началась проекция.
 * @property branes Плоская таблица materialized `Wimp`.
 * @property fields Плоская таблица объектных `Field`.
 * @property fieldValues Плоская таблица текущих значений полей.
 * @property fieldSources Плоская таблица direct ordinary source-связей.
 * @property braneIndexByDarkId Индекс `Dark Wimp.id -> braneIndex`.
 * @property fieldIndexByDarkId Индекс `Dark Field.id -> fieldIndex`.
 * @property fieldIndexByBraneAndKey Индекс поиска поля по паре `(braneIndex, fieldKey)`.
 * @property fieldSourceByChildFieldIndex Быстрый доступ `childFieldIndex -> source-link`.
 * @property dependentFieldIndexesByParentFieldIndex Обратный индекс зависимых полей.
 */
export interface SharedDbProjection {
  /** Индекс корневой браны, из которой началась проекция. */
  rootBraneIndex: number
  /** Плоская таблица materialized `Wimp`. */
  branes: SharedDbBraneRecord[]
  /** Плоская таблица объектных `Field`. */
  fields: SharedDbFieldRecord[]
  /** Плоская таблица текущих значений полей. */
  fieldValues: SharedDbFieldValueRecord[]
  /** Плоская таблица direct ordinary source-связей. */
  fieldSources: SharedDbFieldSourceRecord[]
  /** Индекс `Dark Wimp.id -> braneIndex`. */
  braneIndexByDarkId: Map<string, number>
  /** Индекс `Dark Field.id -> fieldIndex`. */
  fieldIndexByDarkId: Map<string, number>
  /** Индекс поиска поля по паре `(braneIndex, fieldKey)`. */
  fieldIndexByBraneAndKey: Map<number, Map<FieldKey, number>>
  /** Быстрый доступ `childFieldIndex -> source-link`. */
  fieldSourceByChildFieldIndex: Array<SharedDbFieldSourceRecord | undefined>
  /** Обратный индекс зависимых полей. */
  dependentFieldIndexesByParentFieldIndex: Map<number, number[]>
}
