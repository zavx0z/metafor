/**
 * Конфигурация системы логирования MetaFor
 * Определяет настройки отображения и фильтрации логов
 */
export interface LogConfig {
  /** Включено ли логирование */
  active: boolean
  /** Сворачивать ли все группы логов по умолчанию */
  collapseAll: boolean
  /** Список мета-компонентов для фильтрации */
  meta: string[]
  /** Индекс актора для фильтрации (null = все) */
  index: number | null
  /** Список операций JSON Patch для фильтрации */
  patch: string[]
  /** Пути для фильтрации логов */
  path: Array<"/" | "/context" | "/state">
  /** Ширины колонок для форматирования вывода */
  width: {
    /** Ширина колонки мета-информации */
    meta: number
    /** Ширина колонки операции */
    op: number
    /** Ширина колонки пути */
    path: number
  }
  /** Настройки детализации отладки */
  detail: {
    /** Показывать ли ядро актора */
    core: boolean
  }
}

/**
 * Сообщение для логирования с одним патчем JSON Patch
 * Используется в функции log() для отображения отдельного патча
 */
export interface LogMessage {
  /** Мета-информация о компоненте */
  meta: string
  /** Уникальный идентификатор актора */
  actor: string
  /** Позиционный путь актора в VDOM */
  path: string
  /** Патч JSON Patch для отображения */
  patch: {
    /** Операция JSON Patch (add, remove, replace, move, copy, test) */
    op: string
    /** Путь в JSON Patch */
    path: string
    /** Значение в JSON Patch */
    value: any
  }
  /** Временная метка сообщения */
  timestamp: number
}

/**
 * Данные для логирования с массивом патчей JSON Patch
 * Используется в функции logMsg() для обработки сообщений MetaFor
 */
export interface LogData {
  /** Мета-информация о компоненте */
  meta: string
  /** Уникальный идентификатор актора */
  actor: string
  /** Позиционный путь актора в VDOM */
  path: string
  /** Массив патчей JSON Patch для обработки */
  patches: Array<{
    /** Операция JSON Patch (add, remove, replace, move, copy, test) */
    op: string
    /** Путь в JSON Patch */
    path: string
    /** Значение в JSON Patch */
    value: any
  }>
  /** Временная метка сообщения */
  timestamp: number
}
