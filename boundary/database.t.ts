import type { FieldKey } from "@metafor/ast"

/**
 * Снимок схемы поля внутри boundary-базы.
 *
 * Это уже не shared ORM-контракт, а собственная запись слоя доступа к базе.
 *
 * @property type Исходный тип поля.
 * @property required Признак обязательного поля.
 * @property topology Признак topology-поля.
 * @property label Подпись поля, если она была в схеме.
 * @property values Список допустимых значений, если он был в схеме.
 */
export interface BoundaryDatabaseFieldSchemaRecord {
  /** Исходный тип поля. */
  type: string
  /** Признак обязательного поля. */
  required: boolean
  /** Признак topology-поля. */
  topology: boolean
  /** Подпись поля, если она была в схеме. */
  label?: string
  /** Список допустимых значений, если он был в схеме. */
  values?: Array<string | number>
}

/**
 * Запись браны в boundary-базе.
 *
 * @property index Стабильный индекс браны.
 * @property darkWimpId Идентификатор исходного `Dark Wimp`.
 * @property src SRC-адрес меты.
 * @property name Имя меты, если оно было материализовано.
 * @property fieldOffset Смещение первого поля браны.
 * @property fieldCount Количество полей браны.
 */
export interface BoundaryDatabaseBraneRecord {
  /** Стабильный индекс браны. */
  index: number
  /** Идентификатор исходного `Dark Wimp`. */
  darkWimpId: string
  /** SRC-адрес меты. */
  src: string
  /** Имя меты, если оно было материализовано. */
  name?: string
  /** Смещение первого поля браны. */
  fieldOffset: number
  /** Количество полей браны. */
  fieldCount: number
}

/**
 * Запись поля в boundary-базе.
 *
 * @property index Стабильный индекс поля.
 * @property darkFieldId Идентификатор исходного `Dark Field`.
 * @property ownerBraneIndex Индекс браны-владельца.
 * @property key Ключ поля внутри браны.
 * @property schema Краткий снимок схемы поля.
 */
export interface BoundaryDatabaseFieldRecord {
  /** Стабильный индекс поля. */
  index: number
  /** Идентификатор исходного `Dark Field`. */
  darkFieldId: string
  /** Индекс браны-владельца. */
  ownerBraneIndex: number
  /** Ключ поля внутри браны. */
  key: FieldKey
  /** Краткий снимок схемы поля. */
  schema: BoundaryDatabaseFieldSchemaRecord
}

/**
 * Запись текущего значения поля в boundary-базе.
 *
 * @property fieldIndex Индекс поля.
 * @property value Текущее значение поля.
 */
export interface BoundaryDatabaseFieldValueRecord {
  /** Индекс поля. */
  fieldIndex: number
  /** Текущее значение поля. */
  value: unknown
}

/**
 * Прямая source-связь между полями в boundary-базе.
 *
 * @property childFieldIndex Индекс дочернего поля.
 * @property parentFieldIndex Индекс поля-источника.
 */
export interface BoundaryDatabaseFieldSourceRecord {
  /** Индекс дочернего поля. */
  childFieldIndex: number
  /** Индекс поля-источника. */
  parentFieldIndex: number
}

/**
 * Плоское состояние boundary-базы.
 *
 * @property rootBraneIndex Индекс корневой браны исходной проекции.
 * @property branes Плоская таблица бран.
 * @property fields Плоская таблица полей.
 * @property fieldValues Плоская таблица текущих значений.
 * @property fieldSources Плоская таблица ordinary source-связей.
 */
export interface BoundaryDatabaseData {
  /** Индекс корневой браны исходной проекции. */
  rootBraneIndex: number
  /** Плоская таблица бран. */
  branes: BoundaryDatabaseBraneRecord[]
  /** Плоская таблица полей. */
  fields: BoundaryDatabaseFieldRecord[]
  /** Плоская таблица текущих значений. */
  fieldValues: BoundaryDatabaseFieldValueRecord[]
  /** Плоская таблица ordinary source-связей. */
  fieldSources: BoundaryDatabaseFieldSourceRecord[]
}

/**
 * Открытая boundary-база с готовыми индексами и операциями доступа.
 *
 * Публичный API остаётся базо-ориентированным: handle работает с индексами,
 * таблицами и записями базы, а не возвращает наружу объектную модель `Dark`.
 *
 * @property braneIndexByDarkId Индекс `Dark Wimp.id -> braneIndex`.
 * @property fieldIndexByDarkId Индекс `Dark Field.id -> fieldIndex`.
 * @property fieldIndexByBraneAndKey Индекс поиска поля по паре `(braneIndex, fieldKey)`.
 * @property fieldSourceByChildFieldIndex Быстрый доступ `childFieldIndex -> source-link`.
 * @property dependentFieldIndexesByParentFieldIndex Обратный индекс зависимых полей.
 */
export interface BoundaryDatabase extends BoundaryDatabaseData {
  /** Индекс `Dark Wimp.id -> braneIndex`. */
  braneIndexByDarkId: Map<string, number>
  /** Индекс `Dark Field.id -> fieldIndex`. */
  fieldIndexByDarkId: Map<string, number>
  /** Индекс поиска поля по паре `(braneIndex, fieldKey)`. */
  fieldIndexByBraneAndKey: Map<number, Map<FieldKey, number>>
  /** Быстрый доступ `childFieldIndex -> source-link`. */
  fieldSourceByChildFieldIndex: Array<BoundaryDatabaseFieldSourceRecord | undefined>
  /** Обратный индекс зависимых полей. */
  dependentFieldIndexesByParentFieldIndex: Map<number, number[]>

  /** Сбрасывает базу к пустому состоянию. */
  reset(): void

  /**
   * Полностью заменяет состояние базы готовыми данными.
   *
   * @param data Новое плоское состояние базы.
   */
  restore(data: BoundaryDatabaseData): void

  /**
   * Возвращает brane-запись по индексу.
   *
   * @param braneIndex Индекс браны.
   * @returns Запись браны или `undefined`, если индекс не найден.
   */
  getBrane(braneIndex: number): BoundaryDatabaseBraneRecord | undefined

  /**
   * Возвращает brane-запись по исходному `Dark Wimp.id`.
   *
   * @param darkWimpId Идентификатор исходного `Dark Wimp`.
   * @returns Запись браны или `undefined`, если `Wimp` не был загружен в базу.
   */
  getBraneByDarkId(darkWimpId: string): BoundaryDatabaseBraneRecord | undefined

  /**
   * Возвращает запись поля по индексу.
   *
   * @param fieldIndex Индекс поля.
   * @returns Запись поля или `undefined`, если индекс не найден.
   */
  getField(fieldIndex: number): BoundaryDatabaseFieldRecord | undefined

  /**
   * Возвращает запись поля по исходному `Dark Field.id`.
   *
   * @param darkFieldId Идентификатор исходного `Dark Field`.
   * @returns Запись поля или `undefined`, если поле не найдено.
   */
  getFieldByDarkId(darkFieldId: string): BoundaryDatabaseFieldRecord | undefined

  /**
   * Возвращает запись поля по паре `(braneIndex, fieldKey)`.
   *
   * @param braneIndex Индекс браны-владельца.
   * @param fieldKey Ключ поля внутри браны.
   * @returns Запись поля или `undefined`, если поле не найдено.
   */
  getFieldByKey(braneIndex: number, fieldKey: FieldKey): BoundaryDatabaseFieldRecord | undefined

  /**
   * Возвращает запись текущего значения поля.
   *
   * @param fieldIndex Индекс поля.
   * @returns Запись значения или `undefined`, если индекс не найден.
   */
  getFieldValue(fieldIndex: number): BoundaryDatabaseFieldValueRecord | undefined

  /**
   * Возвращает direct ordinary source-связь дочернего поля.
   *
   * @param childFieldIndex Индекс дочернего поля.
   * @returns Source-связь или `undefined`, если её нет.
   */
  getFieldSource(childFieldIndex: number): BoundaryDatabaseFieldSourceRecord | undefined

  /**
   * Возвращает все зависимые дочерние поля для данного источника.
   *
   * @param parentFieldIndex Индекс поля-источника.
   * @returns Список записей зависимых полей.
   */
  getDependentFields(parentFieldIndex: number): BoundaryDatabaseFieldRecord[]

  /**
   * Обновляет текущее значение поля внутри базы.
   *
   * @param fieldIndex Индекс поля.
   * @param value Новое значение поля.
   */
  setFieldValue(fieldIndex: number, value: unknown): void
}
