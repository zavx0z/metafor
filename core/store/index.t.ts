/**
 * Единый формат записи модуля: Uint8Array.
 */
export interface MetaRecord {
  id: string
  blob: Uint8Array
  updatedAt: number
}

/**
 * Унифицированный контракт стора без выполнения модулей.
 */
export interface MetaStore {
  /** Сохранить/обновить модуль. Возвращает размер (байт). */
  upsert(id: string, content: Uint8Array): Promise<number>

  /** Удалить модуль. */
  remove(id: string): Promise<void>

  /**
   * Импортировать модуль по id из стора.
   * Возвращает ESM-модуль или null, если записи нет.
   * @props id - имя модуля (zavx0z/module)
   * @props autosave - сохранять ли модуль в стор автоматически
   */
  import(id: string, autosave?: boolean): Promise<{ default: any } | null>

  /** Полное удаление базы/таблицы. */
  drop(): Promise<void>

  /** Отладочная информация. */
  info(): {
    kind: "web" | "server"
    dbName?: string
    storeName?: string
    dbPath?: string
    table?: string
  }
}
