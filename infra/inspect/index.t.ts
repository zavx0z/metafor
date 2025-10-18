import type { JsonPatch, Message as BaseMessage, Message } from "../../atom/electromagnetic"
export type { Message }
/**
 * Сообщение для логирования с одним патчем JSON Patch
 * Используется в функции log() для отображения отдельного патча
 */
export interface Log extends BaseMessage {
  /** Патч JSON Patch для отображения */
  patch: JsonPatch
}
