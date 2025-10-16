import type { Message, JsonPatch, BaseMessage } from "../../actor/force/electromagnetic.t"

export type { Message }
/**
 * Сообщение для логирования с одним патчем JSON Patch
 * Используется в функции log() для отображения отдельного патча
 */
export interface Log extends BaseMessage {
  /** Патч JSON Patch для отображения */
  patch: JsonPatch
}
