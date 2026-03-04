/**
 * Типы для модуля order.
 * @packageDocumentation
 */

/**
 * Лексикографический ключ для упорядочивания.
 * Используется Uint8Array для обеспечения бесконечной плотности между любыми соседями.
 */
export type OrderKey = Uint8Array
