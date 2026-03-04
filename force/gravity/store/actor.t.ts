/**
 * Типы для модуля actor.
 * @packageDocumentation
 */

import type { OrderKey } from "./order.t"

/**
 * Запись актора в хранилище.
 *
 * @property uuid - Уникальный идентификатор актора (UUID v4)
 * @property src - Исходный код или ссылка на модуль
 * @property parentUuid - UUID родителя (null для корневых акторов)
 * @property orderKey - Лексикографический ключ для упорядочивания
 * @property monadId - Опциональный идентификатор монады
 * @property status - Статус жизненного цикла актора
 */
export interface ActorRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: OrderKey
  monadId?: string
  status: "pending" | "active" | "deleted"
}
