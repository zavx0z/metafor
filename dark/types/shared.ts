import type { MetaAST } from "@metafor/ast"

/**
 * Базовый тип идентификатора частицы в скрытом графе `Dark`.
 *
 * Не фиксирует конкретную форму идентификатора как UUID.
 * Это позволяет в дальнейшем перейти на адресные или иные схемы
 * идентификации без смены доменного имени типа.
 */
export type ParticleID = string

/**
 * Идентификатор частицы `Wimp`.
 */
export type WimpID = ParticleID

/**
 * Идентификатор частицы `Fuzzy`.
 */
export type FuzzyID = ParticleID

/**
 * Идентификатор частицы `Macho`.
 */
export type MachoID = ParticleID

/**
 * Идентификатор частицы `Axion`.
 */
export type AxionID = ParticleID

/**
 * StaticBinding — статическая привязка значения.
 *
 * Используется, когда значение уже известно на этапе формирования
 * DarkMatter и не зависит от runtime-basis.
 *
 * @typeParam T Тип статического значения.
 *
 * @example
 * ```ts
 * const src: StaticBinding<string> = {
 *   mode: "static",
 *   value: "zavx0z/git-error",
 * }
 * ```
 */
export type StaticBinding<T = unknown> = {
  /**
   * Режим привязки.
   *
   * Значение уже задано напрямую и не требует вычисления.
   */
  mode: "static"

  /**
   * Готовое статическое значение.
   */
  value: T
}

/**
 * DynamicBinding — динамическая привязка значения.
 *
 * Используется, когда значение должно быть получено из одного
 * или нескольких basis-путей и, при необходимости, преобразовано выражением.
 *
 * @example
 * ```ts
 * const src: DynamicBinding = {
 *   mode: "dynamic",
 *   basis: "/value/operation",
 *   expr: "zavx0z/git-${_[0]}",
 * }
 * ```
 *
 * @example
 * ```ts
 * const fields: DynamicBinding = {
 *   mode: "dynamic",
 *   basis: ["/value/operation", "/value/args"],
 *   expr: "{ operation: _[0], args: _[1] }",
 * }
 * ```
 */
export type DynamicBinding = {
  /**
   * Режим привязки.
   *
   * Значение вычисляется из одного или нескольких basis-путей.
   */
  mode: "dynamic"

  /**
   * Basis-путь или список basis-путей, от которых зависит значение.
   *
   * Обычно это пути вида:
   * - `/state`
   * - `/value/<field>`
   * - `/mass/<field>`
   */
  basis: string | string[]

  /**
   * Выражение преобразования basis-значений.
   *
   * Если выражение отсутствует, binding трактуется как прямая передача
   * basis-значения без дополнительной сборки.
   */
  expr?: string
}

/**
 * Binding — универсальная привязка значения для частиц тёмной материи.
 *
 * Может быть:
 * - статической, если значение уже известно;
 * - динамической, если значение зависит от basis.
 *
 * @typeParam T Ожидаемый тип результирующего значения.
 */
export type Binding<T = unknown> = StaticBinding<T> | DynamicBinding

/**
 * Базовая частица скрытого графа `Dark`.
 *
 * Все конечные частицы живут в одном пространстве `id`
 * и связываются через `children`.
 */
export interface DarkParticle {
  /**
   * Уникальный ID частицы в скрытом графе.
   */
  id: ParticleID

  /**
   * Дискриминатор типа частицы.
   */
  kind: "wimp" | "fuzzy" | "macho" | "axion"

  /**
   * IDs дочерних частиц в общем графе.
   */
  children: Set<ParticleID>
}

/**
 * Wimp — частица статической связности.
 *
 * Представляет уже выбранную статическую привязку к следующей `meta`
 * и каналы передачи `fields`/`mass` от родителя.
 */
export interface Wimp extends DarkParticle {
  /**
   * ID частицы `Wimp`.
   */
  id: WimpID

  /**
   * Дискриминатор типа частицы.
   */
  kind: "wimp"

  /**
   * Статический hub-адрес следующей `meta`.
   */
  src: string

  /**
   * Payload для fields инстанцируемой meta.
   */
  fields?: Binding<Record<string, unknown>>

  /**
   * Payload для mass инстанцируемой meta.
   */
  mass?: Binding<Record<string, unknown>>
}

/**
 * Fuzzy — частица условной связности.
 *
 * Хранит basis/expr для выбора ветви, а сами дочерние связи
 * задаются через `children` общего графа.
 */
export interface Fuzzy extends DarkParticle {
  /**
   * ID частицы `Fuzzy`.
   */
  id: FuzzyID

  /**
   * Дискриминатор типа частицы.
   */
  kind: "fuzzy"

  /**
   * Basis-пути, от которых зависит ветвление.
   */
  basis: string | string[]

  /**
   * Выражение выбора ветви.
   */
  expr?: string
}

/**
 * Macho — частица множественности.
 */
export interface Macho extends DarkParticle {
  /**
   * ID частицы `Macho`.
   */
  id: MachoID

  /**
   * Дискриминатор типа частицы.
   */
  kind: "macho"

  /**
   * Basis, задающий источник множественности.
   */
  basis: string
}

/**
 * Axion — частица логической группировки.
 */
export interface Axion extends DarkParticle {
  /**
   * ID частицы `Axion`.
   */
  id: AxionID

  /**
   * Дискриминатор типа частицы.
   */
  kind: "axion"

  /**
   * Basis-путь или basis-пути группировки, если она зависит от данных.
   */
  basis?: string | string[]

  /**
   * Выражение логической группировки или вычисления.
   */
  expr?: string
}

/**
 * Минимальный скрытый граф частиц для `Dark`.
 *
 * Это не bulk/boundary-проекция и не runtime placement-graph.
 * Здесь фиксируется только скрытая связность:
 * - частицы по `id`,
 * - направленные связи `parent -> child`,
 * - отдельная привязка `Wimp -> meta`.
 */
export interface DarkGraph {
  /**
   * Корневые частицы текущего graph-fragment.
   */
  roots: Set<ParticleID>

  /**
   * Все частицы текущего fragment по ID.
   */
  particles: Map<ParticleID, DarkParticle>

  /**
   * Обратная parent-связь для общего графа частиц.
   */
  parent: Map<ParticleID, ParticleID>

  /**
   * Привязка `Wimp`-частиц к конкретному `meta`-адресу.
   */
  meta: Map<WimpID, string>
}

/**
 * Совместимое имя для graph-fragment текущей `meta`.
 *
 * Отдельного промежуточного particle-IR больше нет:
 * `DarkMatter` читается как тот же минимальный graph fragment `Dark`.
 */
export type DarkMatter = DarkGraph

/**
 * Отдельное seed-описание topology-field зависимости.
 *
 * Используется вне самих частиц, чтобы быстро понимать,
 * какие topology-переходы нужно перестраивать при изменениях состояния.
 */
export type DarkTopologyDependencySeed = {
  /**
   * Адрес `meta`, к которой относится topology-field.
   */
  metaAddress: string

  /**
   * Адрес ветви/контекста загрузки внутри текущего fragment.
   */
  branchAddress: string

  /**
   * Имя topology-поля.
   */
  field: string

  /**
   * Исходный DSL-тип поля.
   */
  fieldType: string

  /**
   * Вид topology-field.
   */
  topologyKind: "enum" | "array"

  /**
   * Канонический source path в value-space.
   */
  sourcePath: string

  /**
   * Topology-fields не участвуют в entanglement.
   */
  participatesInEntanglement: false

  /**
   * Topology-fields не должны мутироваться из reaction.
   */
  mutableFromReaction: false

  /**
   * Topology-fields не должны перестраиваться посреди процесса.
   */
  mutableDuringProcess: false
}
// -----------------------------------------------------------------------
/**
 * Глобальный объект топологии.
 *
 * Представляет объект из meta-схемы в контексте всего графа.
 */
export interface GlobalTopologyObject {
  /** Уникальный ID объекта в формате `meta#localId`. */
  id: string

  /** Адрес meta-схемы, из которой определён объект. */
  meta: string

  /** Локальный ID объекта внутри meta-схемы. */
  localObjectId: string

  /** Тип объекта из схемы. */
  kind: any

  /** Полное определение объекта из схемы. */
  definition: any
}

/**
 * Глобальное размещение топологии.
 *
 * Представляет экземпляр объекта в конкретном месте графа.
 */
export interface GlobalTopologyPlacement {
  /** Уникальный ID размещения. */
  id: string

  /** Адрес meta-схемы, из которой определено размещение. */
  meta: string

  /** ID объекта, который размещается. */
  objectId: string

  /** Локальный ID размещения внутри meta-схемы. */
  localPlacementId: string

  /** Локальный адрес размещения внутри meta-схемы. */
  localAddress: string

  /** Полный адрес размещения в графе. */
  address: string

  /** ID родительского размещения (отсутствует для root). */
  parentId?: string

  /** ID ссылки, через которую было добавлено размещение. */
  viaReferenceId?: string

  /** Тип отношения к родителю. */
  relation: any
}

/**
 * Связь между двумя размещениями.
 *
 * Определяет иерархическое отношение parent-child между размещениями.
 */
export interface GlobalTopologyLink {
  /** Уникальный ID связи. */
  id: string

  /** ID родительского размещения. */
  from: string

  /** ID дочернего размещения. */
  to: string

  /** Тип отношения (исключая "root"). */
  relation: Exclude<any, "root">
}

/**
 * Глобальная ссылка на внешний источник.
 *
 * Связывает размещение с external meta-схемой.
 */
export interface GlobalTopologyReference {
  /** Уникальный ID ссылки. */
  id: string

  /** Адрес meta-схемы, в которой определена ссылка. */
  meta: string

  /** Локальный ID ссылки внутри meta-схемы. */
  localReferenceId: string

  /** ID размещения, в котором определена ссылка. */
  placementId: string

  /** ID объекта, к которому относится ссылка. */
  objectId: string

  /** Полный адрес ссылки в графе. */
  address: string

  /** Адрес целевой meta-схемы. */
  src: string

  /** Способ связи: поле или значение. */
  via: any["via"]

  /** Имя поля, через которое определена ссылка (опционально). */
  field?: string

  /** Значение поля, через которое определена ссылка (опционально). */
  value?: string | number
}

/**
 * Глобальная запутанность топологии.
 *
 * Связывает placement с набором references и data paths для cohesion.
 */
export interface GlobalTopologyEntanglement {
  /** Уникальный ID запутанности в формате `ent:objectId@address`. */
  id: string

  /** Адрес meta-схемы, в которой определена запутанность. */
  meta: string

  /** ID размещения, к которому относится запутанность. */
  placementId: string

  /** ID объекта, к которому относится запутанность. */
  objectId: string

  /** Адрес размещения в топологии. */
  topologyAddress: string

  /** Адрес запутанности в формате `ent:objectId@address`. */
  entanglementAddress: string

  /** Пути к данным, которые связывает запутанность. */
  dataPaths: string[]

  /** IDs ссылок, участвующих в запутанности. */
  referenceIds: string[]

  /** Исходное определение запутанности из схемы. */
  seed: any
}

/**
 * Опции для вставки фрагмента в граф.
 *
 * Используется при assembly для указания контекста.
 */
export interface GlobalTopologyIngestOptions {
  /** ID родительского размещения для вставки (опционально). */
  parentPlacementId?: string

  /** ID ссылки, через которую была загружена схема (опционально). */
  viaReferenceId?: string
}

/**
 * Результат вставки фрагмента в граф.
 *
 * Возвращает IDs всех созданных сущностей.
 */
export interface GlobalTopologyIngestResult {
  /** Адрес meta-схемы, которая была вставлена. */
  meta: string

  /** IDs корневых размещений (без родителя). */
  rootPlacementIds: string[]

  /** IDs всех созданных размещений. */
  placementIds: string[]

  /** IDs всех созданных ссылок. */
  referenceIds: string[]

  /** IDs всех созданных запутанностей. */
  entanglementIds: string[]
}

/**
 * Индекс сущностей по meta-схеме.
 *
 * Хранит IDs всех сущностей, принадлежащих meta-схеме.
 */
export interface GlobalTopologyMetaIndex {
  /** IDs объектов из meta-схемы. */
  objectIds: string[]

  /** IDs размещений из meta-схемы. */
  placementIds: string[]

  /** IDs ссылок из meta-схемы. */
  referenceIds: string[]

  /** IDs запутанностей из meta-схемы. */
  entanglementIds: string[]
}

/**
 * Индексы `@dark/strong` для cohesion и lookup.
 *
 * Хранит структурную непрерывность скрытого графа.
 */
export interface StrongIndexes {
  /** Адрес размещения → ID размещения. */
  placementAddressIndex: Map<string, string>

  /** ID объекта → ID размещений. */
  objectPlacementsIndex: Map<string, string[]>

  /** Meta → индексы всех сущностей. */
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>

  /** Source → ID references. */
  metaSourceLookup: Map<string, string[]>

  /** Entanglement address → ID entanglement. */
  entanglementAddressIndex: Map<string, string>
}

/**
 * Снимок индексов `@dark/strong`.
 *
 * Используется для сериализации и восстановления индексов.
 */
export interface StrongIndexesSnapshot {
  /** Адрес размещения → ID размещения. */
  placementAddressIndex: Map<string, string>

  /** Entanglement address → ID entanglement. */
  entanglementAddressIndex: Map<string, string>

  /** ID объекта → ID размещений. */
  objectPlacementsIndex: Map<string, string[]>

  /** Meta → индексы всех сущностей. */
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>

  /** Source → ID references. */
  metaSourceLookup: Map<string, string[]>
}

/**
 * Снимок состояния `@dark/store`.
 *
 * Используется для сериализации и восстановления графа.
 */
export interface DarkStoreSnapshot {
  /** Загруженные meta-схемы по адресу. */
  meta: Map<string, MetaAST>

  /** Глобальные объекты по ID. */
  objects: Map<string, GlobalTopologyObject>

  /** Размещения по ID. */
  placements: Map<string, GlobalTopologyPlacement>

  /** Связи между размещениями по ID. */
  links: Map<string, GlobalTopologyLink>

  /** Ссылки на внешние источники по ID. */
  references: Map<string, GlobalTopologyReference>

  /** Запутанности по ID. */
  entanglements: Map<string, GlobalTopologyEntanglement>
}

/**
 * Состояние хранилища `@dark/store`.
 *
 * Хранит канонический graph state.
 */
export interface DarkStore extends DarkStoreSnapshot {
  /**
   * Сохраняет глобальный объект.
   * @param id — уникальный ID объекта
   * @param object — объект топологии
   * @returns сохранённый объект
   */
  setObject(id: string, object: GlobalTopologyObject): GlobalTopologyObject

  /**
   * Получает глобальный объект по ID.
   * @param id — уникальный ID объекта
   * @returns объект или undefined
   */
  getObject(id: string): GlobalTopologyObject | undefined

  /**
   * Удаляет глобальный объект по ID.
   * @param id — уникальный ID объекта
   */
  deleteObject(id: string): void

  /**
   * Сохраняет размещение.
   * @param id — уникальный ID размещения
   * @param placement — размещение топологии
   * @returns сохранённое размещение
   */
  setPlacement(id: string, placement: GlobalTopologyPlacement): GlobalTopologyPlacement

  /**
   * Получает размещение по ID.
   * @param id — уникальный ID размещения
   * @returns размещение или undefined
   */
  getPlacement(id: string): GlobalTopologyPlacement | undefined

  /**
   * Удаляет размещение по ID.
   * @param id — уникальный ID размещения
   */
  deletePlacement(id: string): void

  /**
   * Сохраняет связь между размещениями.
   * @param id — уникальный ID связи
   * @param link — связь топологии
   * @returns сохранённая связь
   */
  setLink(id: string, link: GlobalTopologyLink): GlobalTopologyLink

  /**
   * Получает связь по ID.
   * @param id — уникальный ID связи
   * @returns связь или undefined
   */
  getLink(id: string): GlobalTopologyLink | undefined

  /**
   * Удаляет связь по ID.
   * @param id — уникальный ID связи
   */
  deleteLink(id: string): void

  /**
   * Сохраняет ссылку на внешний источник.
   * @param id — уникальный ID ссылки
   * @param reference — ссылка топологии
   * @returns сохранённая ссылка
   */
  setReference(id: string, reference: GlobalTopologyReference): GlobalTopologyReference

  /**
   * Получает ссылку по ID.
   * @param id — уникальный ID ссылки
   * @returns ссылка или undefined
   */
  getReference(id: string): GlobalTopologyReference | undefined

  /**
   * Удаляет ссылку по ID.
   * @param id — уникальный ID ссылки
   */
  deleteReference(id: string): void

  /**
   * Сохраняет запутанность.
   * @param id — уникальный ID запутанности
   * @param entanglement — запутанность топологии
   * @returns сохранённая запутанность
   */
  setEntanglement(id: string, entanglement: GlobalTopologyEntanglement): GlobalTopologyEntanglement

  /**
   * Получает запутанность по ID.
   * @param id — уникальный ID запутанности
   * @returns запутанность или undefined
   */
  getEntanglement(id: string): GlobalTopologyEntanglement | undefined

  /**
   * Удаляет запутанность по ID.
   * @param id — уникальный ID запутанности
   */
  deleteEntanglement(id: string): void
}

/**
 * Снимок состояния `@dark/gravity/store`.
 *
 * Хранит промежуточное состояние assembly-слоя.
 */
export interface DarkGravityStoreSnapshot {
  /** Загруженные local topology fragments по meta. */
  fragments: Map<string, any>

  /** Счётчик для генерации ID размещений. */
  nextPlacementSeq: number

  /** Счётчик для генерации ID связей. */
  nextLinkSeq: number

  /** Счётчик для генерации ID ссылок. */
  nextReferenceSeq: number

  /** Счётчик для генерации root occurrence prefix. */
  rootOccurrenceSeq: number
}

/**
 * Состояние хранилища `@dark/gravity/store`.
 *
 * Хранит промежуточное состояние assembly-слоя gravity.
 */
export interface DarkGravityStore extends DarkGravityStoreSnapshot {}
