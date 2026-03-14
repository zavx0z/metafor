import type { MetaAST } from "@metafor/ast"
import type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "./gravity/store.t.ts"

/**
 * Снимок состояния `@dark/store`.
 *
 * Используется для сериализации и восстановления графа:
 * - `meta` — загруженные meta-схемы
 * - `objects` — глобальные объекты
 * - `placements` — размещения
 * - `links` — связи между размещениями
 * - `references` — ссылки на внешние источники
 * - `entanglements` — запутанности
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
 * Хранит канонический graph state, который используют подпакеты:
 * - `@dark/gravity` — для assembly
 * - `@dark/strong` — для индексации
 * - `@dark/weak` — для мутаций
 * - `@dark/em` — для проекций
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

export type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
}
