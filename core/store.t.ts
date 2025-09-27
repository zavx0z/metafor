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
  actor: ActorStore
}

/**
 * Context Schema для определения структуры таблиц
 */
export interface ContextSchema {
  [fieldName: string]: {
    type: "string" | "number" | "boolean" | "enum"
    required?: boolean
    title?: string
    default?: any
    values?: readonly (string | number)[]
    id?: true
  }
}

/**
 * Унифицированный контракт стора данных с поддержкой Context Schema.
 */
export interface DataStore {
  /**
   * Создать хранилище/таблицу если не существует на основе Context Schema.
   *
   * @param table Имя таблицы/хранилища
   * @param schema Context Schema для определения структуры
   */
  createTableIfNotExist(table: string, schema: ContextSchema): Promise<void>

  /**
   * Получить запись по ключу.
   *
   * @param table Имя таблицы
   * @param query Объект с условиями поиска (ключ-значение)
   */
  get(table: string, query: Record<string, any>): Promise<any | null>

  /**
   * Получить все записи из таблицы.
   *
   * @param table Имя таблицы
   * @param query Опциональные условия фильтрации
   */
  getAll(table: string, query?: Record<string, any>): Promise<any[]>

  /**
   * Обновить запись.
   *
   * @param table Имя таблицы
   * @param query Условия поиска записи для обновления
   * @param data Новые данные
   */
  update(table: string, query: Record<string, any>, data: any): Promise<void>

  /**
   * Вставить новую запись.
   *
   * @param table Имя таблицы
   * @param data Данные для вставки
   */
  insert(table: string, data: any): Promise<void>

  /**
   * Удалить запись.
   *
   * @param table Имя таблицы
   * @param query Условия поиска записи для удаления
   */
  delete(table: string, query: Record<string, any>): Promise<void>

  /**
   * Удалить таблицу/хранилище.
   *
   * @param table Имя таблицы
   */
  drop(table: string): Promise<void>
}
export interface ActorStore extends DataStore {}
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
