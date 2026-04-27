/**
 * Внутренние helper-ы sqlite-реализации actor-стора.
 * Никакого глобального state — только pure-функции и crypto.randomUUID.
 */

/** Стабильный UUID для новых записей value (используется в forkValue). */
export const generateUuid = (): string => crypto.randomUUID()
