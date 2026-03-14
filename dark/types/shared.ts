import type { MetaAST } from "@metafor/ast"
import type {
  LocalTopologyEntanglementSeed,
  LocalTopologyFragment,
  LocalTopologyObject,
  LocalTopologyObjectKind,
  LocalTopologyPlacementRelation,
  LocalTopologyReference,
} from "../../metafor/dsl/topology.t"

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
  kind: LocalTopologyObjectKind

  /** Полное определение объекта из схемы. */
  definition: LocalTopologyObject
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
  relation: LocalTopologyPlacementRelation
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
  relation: Exclude<LocalTopologyPlacementRelation, "root">
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
  via: LocalTopologyReference["via"]

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
  seed: LocalTopologyEntanglementSeed
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
  /** Сбрасывает всё состояние в начальное. */
  reset(): void

  /**
   * Восстанавливает состояние из снимка.
   * @param snapshot — снимок состояния для восстановления
   */
  restore(snapshot: DarkStoreSnapshot): void

  /**
   * Создаёт глубокую копию текущего состояния.
   * @returns снимок состояния
   */
  snapshot(): DarkStoreSnapshot

  /**
   * Сохраняет meta-схему по адресу.
   * @param address — канонический адрес хаба
   * @param meta — meta-схема AST
   * @returns сохранённая meta-схема
   */
  setMeta(address: string, meta: MetaAST): MetaAST

  /**
   * Получает meta-схему по адресу.
   * @param address — канонический адрес хаба
   * @returns meta-схема или undefined
   */
  getMeta(address: string): MetaAST | undefined

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
export interface GravityStoreSnapshot {
  /** Загруженные local topology fragments по meta. */
  fragments: Map<string, LocalTopologyFragment>

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
export interface GravityStore extends GravityStoreSnapshot {
  /** Сбрасывает всё состояние в начальное. */
  reset(): void

  /**
   * Восстанавливает состояние из снимка.
   * @param snapshot — снимок состояния для восстановления
   */
  restore(snapshot: GravityStoreSnapshot): void

  /**
   * Создаёт глубокую копию текущего состояния.
   * @returns снимок состояния
   */
  snapshot(): GravityStoreSnapshot

  /**
   * Сохраняет local topology fragment по meta.
   * @param meta — адрес meta-схемы
   * @param fragment — фрагмент топологии
   * @returns сохранённый фрагмент
   */
  setFragment(meta: string, fragment: LocalTopologyFragment): LocalTopologyFragment

  /**
   * Получает fragment по meta.
   * @param meta — адрес meta-схемы
   * @returns фрагмент или undefined
   */
  getFragment(meta: string): LocalTopologyFragment | undefined
}

// Re-export types from @metafor/dsl
export type { LocalTopologyFragment }
