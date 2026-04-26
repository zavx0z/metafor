import type { MetaforStore } from "./index.t"

export interface OpenBrowserStoreOptions {
  /**
   * Базовое имя IDB-БД (по умолчанию `metafor-store`). meta+view живут в
   * этом name, actor — в `${databaseName}-actor` (отдельная физическая
   * IDBDatabase из-за ограничений onupgradeneeded — все object stores
   * должны создаваться в одном upgrade-callback на стадии открытия).
   */
  databaseName?: string
  version?: number
  actorVersion?: number
  indexedDb?: IDBFactory
}

export type BrowserMetaforStore = MetaforStore
