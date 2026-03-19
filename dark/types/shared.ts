import type { FieldDefinitionJson, MetaAST } from "@metafor/ast"
import type { Mass } from "@metafor/dsl"
import type { Address } from "./dark"

type UUID = string
/**
 * Базовый тип идентификатора частицы в скрытом графе `Dark`.
 *
 * Не фиксирует конкретную форму идентификатора как UUID.
 * Это позволяет в дальнейшем перейти на адресные или иные схемы
 * идентификации без смены доменного имени типа.
 */
export type ParticleID = UUID
export type FieldKey = UUID
export type FieldID = UUID
/** Идентификатор частицы `Wimp`. */
export type WimpID = ParticleID
/** Идентификатор частицы `Fuzzy`. */
export type FuzzyID = ParticleID
/** Идентификатор частицы `Macho`. */
export type MachoID = ParticleID
/** Идентификатор частицы `Axion`. */
export type AxionID = ParticleID
/**
 * StaticBinding — статическая привязка значения.
 *
 * Используется, когда значение уже известно на этапе формирования
 * DarkMatter и не зависит от runtime-basis.
 *
 * @typeParam T Тип статического значения.
 * @property mode — Режим привязки.
 * @property value — Готовое статическое значение.
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
  mode: "static"
  value: T
}
/**
 * DynamicBinding — динамическая привязка значения.
 *
 * Используется, когда значение должно быть получено из одного
 * или нескольких basis-путей и, при необходимости, преобразовано выражением.
 *
 * @property mode — Режим привязки.
 * @property basis — Basis-путь или список basis-путей, от которых зависит значение.
 * @property expr — Выражение преобразования basis-значений.
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
  mode: "dynamic"
  basis: string | string[]
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
 *
 * @property id — Уникальный ID частицы в скрытом графе.
 * @property kind — Дискриминатор типа частицы.
 * @property children — IDs дочерних частиц в общем графе.
 */
export interface DarkParticle {
  id: ParticleID
  kind: "wimp" | "fuzzy" | "macho" | "axion"
  children: ParticleID[]
}
/**
 * Wimp — частица статической связности.
 *
 * Представляет уже выбранную статическую привязку к следующей `meta`
 * и каналы передачи `fields`/`mass` от родителя.
 *
 * @property id — Уникальный ID частицы `Wimp`.
 * @property kind — Дискриминатор типа частицы.
 * @property src — Статический hub-адрес следующей `meta`.
 * @property fields — Payload для `fields` инстанцируемой meta.
 * @property mass — Payload для `mass` инстанцируемой meta.
 */
export interface Wimp extends DarkParticle {
  id: WimpID
  kind: "wimp"
  src: string
  mass?: Mass
}
/**
 * Fuzzy — частица условной связности.
 *
 * Хранит basis/expr для выбора ветви, а сами дочерние связи
 * задаются через `children` общего графа.
 *
 * @property id — ID частицы `Fuzzy`.
 * @property kind — Дискриминатор типа частицы.
 * @property basis — Basis-пути, от которых зависит ветвление.
 * @property expr — Выражение выбора ветви.
 */
export interface Fuzzy extends DarkParticle {
  id: FuzzyID
  kind: "fuzzy"
  basis: string | string[]
  expr?: string
}
/**
 * Macho — частица множественности.
 *
 * @property id — ID частицы `Macho`.
 * @property kind — Дискриминатор типа частицы.
 * @property basis — Basis, задающий источник множественности.
 */
export interface Macho extends DarkParticle {
  id: MachoID
  kind: "macho"
  basis: string
}
/**
 * Axion — частица логической группировки.
 *
 * @property id — ID частицы `Axion`.
 * @property kind — Дискриминатор типа частицы.
 * @property basis — Basis-путь или basis-пути группировки, если она зависит от данных.
 * @property expr — Выражение логической группировки или вычисления.
 */
export interface Axion extends DarkParticle {
  id: AxionID
  kind: "axion"
  basis?: string | string[]
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
 *
 * @property roots — Корневые частицы текущего graph-fragment.
 * @property particles — Все частицы текущего fragment по ID.
 * @property parent — Обратная parent-связь для общего графа частиц.
 * @property meta — Привязка `Wimp`-частиц к конкретному `meta`-адресу.
 */
export interface DarkStore {
  meta: Map<WimpID, Address>
  particles: Map<ParticleID, DarkParticle>
  parent: Map<ParticleID, ParticleID>
  // fields: Map<FieldID, DarkField>
}
interface DarkField extends FieldDefinitionJson {
  key: FieldKey
}
/**
 * Отдельное seed-описание topology-field зависимости.
 *
 * Используется вне самих частиц, чтобы быстро понимать,
 * какие topology-переходы нужно перестраивать при изменениях состояния.
 *
 * @property metaAddress — Адрес `meta`, к которой относится topology-field.
 * @property field — Имя topology-поля.
 * @property fieldType — Исходный DSL-тип поля.
 * @property topologyKind — Вид topology-field.
 * @property sourcePath — Канонический source path в value-space.
 * @property participatesInEntanglement — Topology-fields не участвуют в entanglement.
 * @property mutableFromReaction — Topology-fields не должны мутироваться из reaction.
 * @property mutableDuringProcess — Topology-fields не должны перестраиваться посреди процесса.
 */
export type DarkTopologyDependencySeed = {
  metaAddress: string
  field: string
  fieldType: string
  topologyKind: "enum" | "array"
  sourcePath: string
  participatesInEntanglement: false
  mutableFromReaction: false
  mutableDuringProcess: false
}
// -----------------------------------------------------------------------
/**
 * Глобальный объект топологии.
 *
 * Представляет объект из meta-схемы в контексте всего графа.
 *
 * @property id — Уникальный ID объекта в формате `meta#localId`.
 * @property meta — Адрес meta-схемы, из которой определён объект.
 * @property localObjectId — Локальный ID объекта внутри meta-схемы.
 * @property kind — Тип объекта из схемы.
 * @property definition — Полное определение объекта из схемы.
 */
export interface GlobalTopologyObject {
  id: string
  meta: string
  localObjectId: string
  kind: any
  definition: any
}
/**
 * Глобальное размещение топологии.
 *
 * Представляет экземпляр объекта в конкретном месте графа.
 *
 * @property id — Уникальный ID размещения.
 * @property meta — Адрес meta-схемы, из которой определено размещение.
 * @property objectId — ID объекта, который размещается.
 * @property localPlacementId — Локальный ID размещения внутри meta-схемы.
 * @property localAddress — Локальный адрес размещения внутри meta-схемы.
 * @property address — Полный адрес размещения в графе.
 * @property parentId — ID родительского размещения (отсутствует для root).
 * @property viaReferenceId — ID ссылки, через которую было добавлено размещение.
 * @property relation — Тип отношения к родителю.
 */
export interface GlobalTopologyPlacement {
  id: string
  meta: string
  objectId: string
  localPlacementId: string
  localAddress: string
  address: string
  parentId?: string
  viaReferenceId?: string
  relation: any
}
/**
 * Связь между двумя размещениями.
 *
 * Определяет иерархическое отношение parent-child между размещениями.
 *
 * @property id — Уникальный ID связи.
 * @property from — ID родительского размещения.
 * @property to — ID дочернего размещения.
 * @property relation — Тип отношения (исключая "root").
 */
export interface GlobalTopologyLink {
  id: string
  from: string
  to: string
  relation: Exclude<any, "root">
}
/**
 * Глобальная ссылка на внешний источник.
 *
 * Связывает размещение с external meta-схемой.
 *
 * @property id — Уникальный ID ссылки.
 * @property meta — Адрес meta-схемы, в которой определена ссылка.
 * @property localReferenceId — Локальный ID ссылки внутри meta-схемы.
 * @property placementId — ID размещения, в котором определена ссылка.
 * @property objectId — ID объекта, к которому относится ссылка.
 * @property address — Полный адрес ссылки в графе.
 * @property src — Адрес целевой meta-схемы.
 * @property via — Способ связи: поле или значение.
 * @property field — Имя поля, через которое определена ссылка (опционально).
 * @property value — Значение поля, через которое определена ссылка (опционально).
 */
export interface GlobalTopologyReference {
  id: string
  meta: string
  localReferenceId: string
  placementId: string
  objectId: string
  address: string
  src: string
  via: any["via"]
  field?: string
  value?: string | number
}
/**
 * Глобальная запутанность топологии.
 *
 * Связывает placement с набором references и data paths для cohesion.
 *
 * @property id — Уникальный ID запутанности, генерируемый отдельно от topology-address.
 * @property meta — Адрес meta-схемы, в которой определена запутанность.
 * @property placementId — ID размещения, к которому относится запутанность.
 * @property objectId — ID объекта, к которому относится запутанность.
 * @property topologyAddress — Адрес размещения в топологии.
 * @property entanglementAddress — Адрес запутанности в формате `ent:objectId@address`.
 * @property dataPaths — Пути к данным, которые связывает запутанность.
 * @property referenceIds — IDs ссылок, участвующих в запутанности.
 * @property seed — Исходное определение запутанности из схемы.
 */
export interface GlobalTopologyEntanglement {
  id: string
  meta: string
  placementId: string
  objectId: string
  topologyAddress: string
  entanglementAddress: string
  dataPaths: string[]
  referenceIds: string[]
  seed: any
}
/**
 * Опции для вставки фрагмента в граф.
 *
 * Используется при assembly для указания контекста.
 *
 * @property parentPlacementId — ID родительского размещения для вставки (опционально).
 * @property viaReferenceId — ID ссылки, через которую была загружена схема (опционально).
 */
export interface GlobalTopologyIngestOptions {
  parentPlacementId?: string
  viaReferenceId?: string
}
/**
 * Результат вставки фрагмента в граф.
 *
 * Возвращает IDs всех созданных сущностей.
 *
 * @property meta — Адрес meta-схемы, которая была вставлена.
 * @property rootPlacementIds — IDs корневых размещений (без родителя).
 * @property placementIds — IDs всех созданных размещений.
 * @property referenceIds — IDs всех созданных ссылок.
 * @property entanglementIds — IDs всех созданных запутанностей.
 */
export interface GlobalTopologyIngestResult {
  meta: string
  rootPlacementIds: string[]
  placementIds: string[]
  referenceIds: string[]
  entanglementIds: string[]
}
/**
 * Индекс сущностей по meta-схеме.
 *
 * Хранит IDs всех сущностей, принадлежащих meta-схеме.
 *
 * @property objectIds — IDs объектов из meta-схемы.
 * @property placementIds — IDs размещений из meta-схемы.
 * @property referenceIds — IDs ссылок из meta-схемы.
 * @property entanglementIds — IDs запутанностей из meta-схемы.
 */
export interface GlobalTopologyMetaIndex {
  objectIds: string[]
  placementIds: string[]
  referenceIds: string[]
  entanglementIds: string[]
}
/**
 * Индексы `@dark/strong` для cohesion и lookup.
 *
 * Хранит структурную непрерывность скрытого графа.
 *
 * @property placementAddressIndex — Адрес размещения → ID размещения.
 * @property objectPlacementsIndex — ID объекта → ID размещений.
 * @property sourceMetaIndex — Meta → индексы всех сущностей.
 * @property metaSourceLookup — Source → ID references.
 * @property entanglementAddressIndex — Entanglement address → ID entanglement.
 */
export interface StrongIndexes {
  placementAddressIndex: Map<string, string>
  objectPlacementsIndex: Map<string, string[]>
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>
  metaSourceLookup: Map<string, string[]>
  entanglementAddressIndex: Map<string, string>
}
/**
 * Снимок индексов `@dark/strong`.
 *
 * Используется для сериализации и восстановления индексов.
 *
 * @property placementAddressIndex — Адрес размещения → ID размещения.
 * @property entanglementAddressIndex — Entanglement address → ID entanglement.
 * @property objectPlacementsIndex — ID объекта → ID размещений.
 * @property sourceMetaIndex — Meta → индексы всех сущностей.
 * @property metaSourceLookup — Source → ID references.
 */
export interface StrongIndexesSnapshot {
  placementAddressIndex: Map<string, string>
  entanglementAddressIndex: Map<string, string>
  objectPlacementsIndex: Map<string, string[]>
  sourceMetaIndex: Map<string, GlobalTopologyMetaIndex>
  metaSourceLookup: Map<string, string[]>
}
/**
 * Снимок состояния `@dark/store`.
 *
 * Используется для сериализации и восстановления графа.
 *
 * @property meta — Загруженные meta-схемы по адресу.
 * @property objects — Глобальные объекты по ID.
 * @property placements — Размещения по ID.
 * @property links — Связи между размещениями по ID.
 * @property references — Ссылки на внешние источники по ID.
 * @property entanglements — Запутанности по ID.
 */
export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  objects: Map<string, GlobalTopologyObject>
  placements: Map<string, GlobalTopologyPlacement>
  links: Map<string, GlobalTopologyLink>
  references: Map<string, GlobalTopologyReference>
  entanglements: Map<string, GlobalTopologyEntanglement>
}
/**
 * Снимок состояния `@dark/gravity/store`.
 *
 * Хранит промежуточное состояние assembly-слоя.
 *
 * @property fragments — Загруженные local topology fragments по meta.
 * @property nextPlacementSeq — Счётчик для генерации ID размещений.
 * @property nextLinkSeq — Счётчик для генерации ID связей.
 * @property nextReferenceSeq — Счётчик для генерации ID ссылок.
 * @property nextEntanglementSeq — Счётчик для генерации ID запутанностей.
 * @property rootOccurrenceSeq — Счётчик для генерации root occurrence prefix.
 */
export interface DarkGravityStoreSnapshot {
  fragments: Map<string, any>
  nextPlacementSeq: number
  nextLinkSeq: number
  nextReferenceSeq: number
  nextEntanglementSeq: number
  rootOccurrenceSeq: number
}
/**
 * Состояние хранилища `@dark/gravity/store`.
 * Хранит промежуточное состояние assembly-слоя gravity.
 */
export interface DarkGravityStore extends DarkGravityStoreSnapshot {}
