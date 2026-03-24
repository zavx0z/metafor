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
 * Блок entanglement seeds без runtime-owned shared layout.
 *
 * @property index Стабильный индекс блока.
 * @property key Канонический ключ membership-группы.
 */
export interface SharedDbEntanglementSeedBlockRecord {
  /** Стабильный индекс блока. */
  index: number
  /** Канонический ключ membership-группы. */
  key: string
}

/**
 * Membership конкретной браны в entanglement block.
 *
 * @property index Стабильный индекс записи membership.
 * @property blockIndex Индекс entanglement block.
 * @property memberIndex Порядок браны внутри блока.
 * @property braneIndex Индекс браны-участника.
 */
export interface SharedDbEntanglementSeedBlockMemberRecord {
  /** Стабильный индекс записи membership. */
  index: number
  /** Индекс entanglement block. */
  blockIndex: number
  /** Порядок браны внутри блока. */
  memberIndex: number
  /** Индекс браны-участника. */
  braneIndex: number
}

/**
 * Shared field seed внутри entanglement block.
 *
 * Seed описывает только membership, semantic identity и provenance.
 * Финальные `sharedBlocks` и `sharedValues` остаются boundary-owned.
 *
 * @property index Стабильный индекс seed-поля.
 * @property blockIndex Индекс родительского блока.
 * @property blockFieldIndex Порядок shared-поля внутри блока.
 * @property semanticKey Канонический semantic identity seed.
 * @property fieldName Каноническое semantic field name.
 * @property provenance Краткое описание происхождения seed.
 * @property representativeDarkFieldId Поле-репрезентант для чтения shared value.
 * @property representativeBraneIndex Брана-репрезентант для чтения shared value.
 * @property payloadIds Идентификаторы upstream payload/source-membership.
 * @property semanticKeys Нормализованные semantic keys, из которых собран seed.
 */
export interface SharedDbEntanglementSeedFieldRecord {
  /** Стабильный индекс seed-поля. */
  index: number
  /** Индекс родительского блока. */
  blockIndex: number
  /** Порядок shared-поля внутри блока. */
  blockFieldIndex: number
  /** Канонический semantic identity seed. */
  semanticKey: string
  /** Каноническое semantic field name. */
  fieldName: string
  /** Краткое описание происхождения seed. */
  provenance: string
  /** Поле-репрезентант для чтения shared value. */
  representativeDarkFieldId: string
  /** Брана-репрезентант для чтения shared value. */
  representativeBraneIndex: number
  /** Идентификаторы upstream payload/source-membership. */
  payloadIds: string[]
  /** Нормализованные semantic keys, из которых собран seed. */
  semanticKeys: string[]
}

/**
 * Membership конкретного поля в shared field seed.
 *
 * Ссылка идёт через `darkFieldId`, а не через boundary/runtime index space.
 *
 * @property index Стабильный индекс записи membership.
 * @property entanglementFieldIndex Индекс родительского shared field seed.
 * @property memberIndex Порядок поля внутри membership.
 * @property braneIndex Индекс браны-владельца поля.
 * @property darkFieldId Идентификатор instance-поля в materialized `Dark`.
 */
export interface SharedDbEntanglementSeedFieldMemberRecord {
  /** Стабильный индекс записи membership. */
  index: number
  /** Индекс родительского shared field seed. */
  entanglementFieldIndex: number
  /** Порядок поля внутри membership. */
  memberIndex: number
  /** Индекс браны-владельца поля. */
  braneIndex: number
  /** Идентификатор instance-поля в materialized `Dark`. */
  darkFieldId: string
}

/**
 * Локальное состояние state graph seed для конкретной браны.
 *
 * @property index Стабильный индекс seed-state.
 * @property ownerBraneIndex Индекс браны, которой принадлежит graph.
 * @property stateIndex Локальный индекс состояния внутри graph этой браны.
 * @property name Каноническое имя состояния из upstream `Dark`.
 * @property initial Признак стартового runtime-state.
 */
export interface SharedDbStateSeedStateRecord {
  /** Стабильный индекс seed-state. */
  index: number
  /** Индекс браны, которой принадлежит graph. */
  ownerBraneIndex: number
  /** Локальный индекс состояния внутри graph этой браны. */
  stateIndex: number
  /** Каноническое имя состояния из upstream `Dark`. */
  name: string
  /** Признак стартового runtime-state. */
  initial: boolean
}

/**
 * Переход state graph seed для конкретной браны.
 *
 * @property index Стабильный индекс seed-transition.
 * @property ownerBraneIndex Индекс браны-владельца graph.
 * @property fromStateIndex Локальный индекс исходного состояния.
 * @property transitionIndex Порядок перехода внутри исходного состояния.
 * @property targetStateIndex Локальный индекс целевого состояния или `null` для terminal branch.
 */
export interface SharedDbStateSeedTransitionRecord {
  /** Стабильный индекс seed-transition. */
  index: number
  /** Индекс браны-владельца graph. */
  ownerBraneIndex: number
  /** Локальный индекс исходного состояния. */
  fromStateIndex: number
  /** Порядок перехода внутри исходного состояния. */
  transitionIndex: number
  /** Локальный индекс целевого состояния или `null` для terminal branch. */
  targetStateIndex: number | null
}

/**
 * Условие state graph seed.
 *
 * Поле условия ссылается на instance-field через `darkFieldId`, а не через
 * DB/runtime индексное пространство.
 *
 * @property index Стабильный индекс seed-condition.
 * @property transitionSeedIndex Индекс родительского seed-transition.
 * @property conditionIndex Порядок условия внутри перехода.
 * @property darkFieldId Идентификатор instance-поля materialized `Dark`.
 * @property condition Исходное условие из upstream superposition.
 */
export interface SharedDbStateSeedConditionRecord {
  /** Стабильный индекс seed-condition. */
  index: number
  /** Индекс родительского seed-transition. */
  transitionSeedIndex: number
  /** Порядок условия внутри перехода. */
  conditionIndex: number
  /** Идентификатор instance-поля materialized `Dark`. */
  darkFieldId: string
  /** Исходное условие из upstream superposition. */
  condition: unknown
}

/**
 * Flat runtime seeds, которые downstream-слой может materialize-ить в runtime.
 *
 * Здесь нет runtime-owned таблиц `Boundary`, только upstream seeds.
 */
export interface SharedDbRuntimeSeedData {
  /** Плоская таблица entanglement blocks. */
  entanglementBlocks: SharedDbEntanglementSeedBlockRecord[]
  /** Membership-таблица `entanglement block -> brane`. */
  entanglementBlockMembers: SharedDbEntanglementSeedBlockMemberRecord[]
  /** Плоская таблица shared field seeds внутри entanglement blocks. */
  entanglementFields: SharedDbEntanglementSeedFieldRecord[]
  /** Membership-таблица `shared field seed -> darkFieldId`. */
  entanglementFieldMembers: SharedDbEntanglementSeedFieldMemberRecord[]
  /** Плоская таблица состояний state graph seeds. */
  stateSeedStates: SharedDbStateSeedStateRecord[]
  /** Плоская таблица переходов state graph seeds. */
  stateSeedTransitions: SharedDbStateSeedTransitionRecord[]
  /** Плоская таблица условий state graph seeds. */
  stateSeedConditions: SharedDbStateSeedConditionRecord[]
}

/**
 * Каноническая табличная форма хранения общей DB-проекции.
 *
 * Это минимальный DB-shaped снимок, который backend обязан уметь хранить
 * и полностью заменять без знания runtime-структур доменов.
 *
 * @property branes Плоская таблица materialized `Wimp`.
 * @property fields Плоская таблица объектных `Field`.
 * @property fieldValues Плоская таблица текущих значений полей.
 * @property fieldSources Плоская таблица direct ordinary source-связей.
 */
export interface SharedDbTabularData extends SharedDbRuntimeSeedData {
  /** Плоская таблица materialized `Wimp`. */
  branes: SharedDbBraneRecord[]
  /** Плоская таблица объектных `Field`. */
  fields: SharedDbFieldRecord[]
  /** Плоская таблица текущих значений полей. */
  fieldValues: SharedDbFieldValueRecord[]
  /** Плоская таблица direct ordinary source-связей. */
  fieldSources: SharedDbFieldSourceRecord[]
}

/**
 * Производные индексы поверх канонической табличной формы.
 *
 * Эти структуры не являются частью backend-хранилища как такового, но могут
 * материализоваться в памяти для быстрого индексного доступа.
 *
 * @property rootBraneIndex Индекс корневой браны, выведенный из упорядоченных brane rows.
 * @property fieldWindowByBraneIndex Derived field range для последовательного чтения полей браны.
 * @property braneIndexByDarkId Индекс `Dark Wimp.id -> braneIndex`.
 * @property fieldIndexByDarkId Индекс `Dark Field.id -> fieldIndex`.
 * @property fieldIndexByBraneAndKey Индекс поиска поля по паре `(braneIndex, fieldKey)`.
 * @property fieldSourceByChildFieldIndex Быстрый доступ `childFieldIndex -> source-link`.
 * @property dependentFieldIndexesByParentFieldIndex Обратный индекс зависимых полей.
 */
export interface SharedDbProjectionIndexes {
  /** Индекс корневой браны, выведенный из упорядоченных brane rows. */
  rootBraneIndex: number
  /** Derived field range для последовательного чтения полей браны. */
  fieldWindowByBraneIndex: Array<{ fieldOffset: number; fieldCount: number }>
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

/**
 * Общая плоская DB-проекция из materialized `Dark`.
 *
 * Плоские массивы и индексы собираются один раз, чтобы downstream-код работал
 * с готовым DB-shaped снимком, а не повторно обходил объектный граф `Dark`.
 */
export interface SharedDbProjection extends SharedDbTabularData, SharedDbProjectionIndexes {}
