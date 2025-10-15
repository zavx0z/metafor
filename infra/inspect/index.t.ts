import type { Message, JsonPatch } from "../../actor/force/electromagnetic.t"

export type { Message }
/**
 * Сообщение для логирования с одним патчем JSON Patch
 * Используется в функции log() для отображения отдельного патча
 */
export interface Log {
  /** Мета-информация о компоненте */
  meta: string
  /** Уникальный идентификатор актора */
  actor: string
  /** Позиционный путь актора в VDOM */
  path: string
  /** Патч JSON Patch для отображения */
  patch: JsonPatch
  /** Временная метка сообщения */
  timestamp: number
}
