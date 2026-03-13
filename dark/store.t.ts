import type { MetaAST } from "@metafor/ast"

/** Путь к узлу графа как массив сегментов. */
export type DarkGraphPath = readonly string[]

/** Строковый адрес или путь для поиска узла. */
export type DarkGraphLookup = string | DarkGraphPath

/** Тип узла графа: корень, раздел, объект, массив или значение. */
export type DarkGraphNodeKind = "root" | "section" | "object" | "array" | "value"

/** Раздел графа: корень или топ-уровень AST. */
export type DarkGraphSection =
  | "root"
  | "name"
  | "fields"
  | "superposition"
  | "processes"
  | "reactions"
  | "gravity"
  | "bulk"
  | "mass"

/**
 * Узел графа AST.
 *
 * Хранит позицию в структуре и связи с родительскими/дочерними узлами:
 * - {@link DarkGraphNode.kind | kind} — классификация значения
 * - {@link DarkGraphNode.section | section} — топ-уровневый раздел
 * - {@link DarkGraphNode.address | address} — уникальный адрес в пространстве схем
 */
export interface DarkGraphNode {
  /** Тип узла. */
  kind: DarkGraphNodeKind

  /** Раздел графа. */
  section: DarkGraphSection

  /** Ключ узла в родительском контейнере. */
  key: string

  /** Полный адрес узла. */
  address: string

  /** Путь от корня до узла. */
  path: DarkGraphPath

  /** Адрес родителя или null для корня. */
  parentAddress: string | null

  /** Адреса дочерних узлов. */
  childAddresses: string[]

  /** Исходное значение узла. */
  value: unknown
}

/**
 * Входные данные для создания store.
 *
 * Передаётся в `dark$.restore()` для инициализации состояния.
 */
export interface DarkStoreInput {
  /** Путь к схеме для адресации. */
  schemaPath: string

  /** AST-представление актора. */
  ast: MetaAST

  /** Путь к источнику данных (опционально). */
  sourcePath?: string | undefined
}

/**
 * Снимок состояния store.
 *
 * Содержит сериализуемое представление графа:
 * - {@link DarkStoreSnapshot.schemaPath | schemaPath} — для адресации
 * - {@link DarkStoreSnapshot.ast | ast} — AST-представление
 * - {@link DarkStoreSnapshot.nodes | nodes} — плоский список узлов
 */
export interface DarkStoreSnapshot extends DarkStoreInput {
  /** Все узлы графа. */
  nodes: DarkGraphNode[]
}

/**
 * Store графовой структуры Dark.
 *
 * Удерживает linked flat representation и lookup API:
 * - {@link DarkStore.linkedFlat | linkedFlat} — для итерации
 * - {@link DarkStore.getNode | getNode} — для поиска по адресу
 * - {@link DarkStore.getChildren | getChildren} — для навигации
 */
export interface DarkStore extends DarkStoreSnapshot {
  /** Плоский список узлов с связями. */
  linkedFlat: DarkGraphNode[]

  /** Сбрасывает store к пустому AST. */
  reset(): void

  /** Восстанавливает состояние из новых данных. */
  restore(state: DarkStoreInput | DarkStoreSnapshot): void

  /** Получает узел по адресу или пути. */
  getNode(target: DarkGraphLookup): DarkGraphNode | undefined

  /** Получает дочерние узлы. */
  getChildren(target: DarkGraphLookup): DarkGraphNode[]

  /** Находит узлы по префиксу пути. */
  lookup(target: DarkGraphLookup): DarkGraphNode[]
}
