/**
 * Политика загрузки в стиле Service Worker cache strategies.
 *
 * - "cache-first": Сначала кэш; при отсутствии кэша — загрузка из сети с сохранением в кэш.
 * - "network-first": Сначала сеть и сохранение в кэш; при ошибке сети — возврат из кэша.
 * - "network-only": Всегда сеть; кэш не читается и не обновляется.
 * - "cache-only": Только кэш; сеть не запрашивается.
 * - "stale-while-revalidate": Немедленно отдать кэш (если есть) и асинхронно обновить его из сети; при отсутствии кэша — дождаться сети и сохранить.
 */
export type LoadPolicy = "cache-first" | "network-first" | "network-only" | "cache-only" | "stale-while-revalidate"

/**
 * Унифицированный контракт стора.
 */
export interface Store {
  meta: MetaStore
  data: DataStore
}

/**
 * Унифицированный контракт стора данных.
 */
export interface DataStore {
  get(table: string, id: string): Promise<any | null>
  getAll(table: string): Promise<any[] | null>
  update(table: string, id: string, data: any): Promise<void>
  insert(table: string, data: any): Promise<void>
  delete(table: string, id: string): Promise<void>
  drop(table: string): Promise<void>
}

/**
 * Унифицированный контракт стора без выполнения модулей.
 */
export interface MetaStore {
  /** Удалить модуль. */
  remove(id: string): Promise<void>

  /**
   * Импортировать модуль по id из стора.
   *
   * Поведение по политикам (веб/сервер):
   * - "cache-first": вернуть значение из стора, если есть; иначе загрузить модуль,
   *   сохранить (`size`, `value`) и вернуть значение
   * - "network-first": попытаться загрузить модуль; при ошибке — вернуть значение из стора
   * - "network-only": всегда загрузка, стор не читается; сохранение опционально
   * - "cache-only": только стор, без сети
   * - "stale-while-revalidate": сразу вернуть значение из стора (если есть), параллельно обновить из сети
   *
   * Возвращает декларативное значение (schema) или null, если записи нет.
   *
   * @props id Имя модуля (`zavx0z/module`).
   * @props policy Политика загрузки. По умолчанию — `"cache-first"`.
   *  - `"cache-first"`: сначала кэш; если нет — сеть с сохранением.
   *  - `"network-first"`: сначала сеть с сохранением; при ошибке — кэш.
   *  - `"network-only"`: только сеть; кэш не читаем и не обновляем.
   *  - `"cache-only"`: только кэш; сеть не запрашиваем.
   *  - `"stale-while-revalidate"`: отдать кэш (если есть) и параллельно обновить;
   *    при отсутствии кэша — дождаться сети и сохранить.
   */
  import(id: string, policy?: LoadPolicy): Promise<any | null>

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
