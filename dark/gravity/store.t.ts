import type {
  LocalTopologyEntanglementSeed,
  LocalTopologyFragment,
  LocalTopologyObject,
  LocalTopologyObjectKind,
  LocalTopologyPlacementRelation,
  LocalTopologyReference,
} from "../../metafor/dsl/topology.t.ts"

/**
 * Глобальный объект топологии.
 *
 * Представляет объект из meta-схемы в контексте всего графа:
 * - `id` — уникальный ID в формате `meta#localId`
 * - `meta` — адрес meta-схемы
 * - `localObjectId` — локальный ID из схемы
 * - `kind` — тип объекта
 * - `definition` — полное определение
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
 * Представляет экземпляр объекта в конкретном месте графа:
 * - `id` — уникальный ID размещения
 * - `address` — полный путь в графе
 * - `parentId` — ID родителя (опционально)
 * - `viaReferenceId` — ID ссылки (опционально)
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
 * Определяет иерархическое отношение parent-child между размещениями:
 * - ID родительского размещения
 * — ID дочернего размещения
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
 * Связывает размещение с external meta-схемой:
 * - `src` — адрес целевой meta-схемы
 * - `via` — способ связи (field/value)
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
 * Связывает placement с набором references и data paths для cohesion:
 * - `dataPaths` — пути к данным
 * - `referenceIds` — связанные ссылки
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
 * Используется при assembly для указания контекста:
 * - `parentPlacementId` — ID родителя
 * - `viaReferenceId` — ID ссылки
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
 * Возвращает IDs всех созданных сущностей:
 * - `rootPlacementIds` — корневые размещения
 * - `placementIds` — все размещения
 * - `referenceIds` — все ссылки
 * - `entanglementIds` — все запутанности
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
 * Снимок состояния `@dark/gravity/store`.
 *
 * Хранит промежуточное состояние assembly-слоя:
 * - `fragments` — загруженные фрагменты
 * - `nextPlacementSeq` — счётчик размещений
 * - `nextLinkSeq` — счётчик связей
 * - `nextReferenceSeq` — счётчик ссылок
 * - `rootOccurrenceSeq` — счётчик root-вхождений
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
 * Используется в `@dark/gravity/gravity` для вставки фрагментов.
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
