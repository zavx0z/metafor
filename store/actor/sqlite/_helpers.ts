/**
 * Внутренние helper-ы sqlite-реализации actor-стора.
 * Никакого глобального state — только pure-функции и crypto.randomUUID.
 */

export interface ScalarLike {
  kind: string
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

export interface ScalarColumns {
  boolean: number | null
  number: number | null
  text: string | null
  variant: string | null
}

/** Раскладывает scalar в набор колонок sqlite (boolean→0/1, остальные — как есть/NULL). */
export const scalarColumns = (scalar: ScalarLike): ScalarColumns => {
  if (scalar.kind === "null" || scalar.kind === "list") {
    return { boolean: null, number: null, text: null, variant: null }
  }
  return {
    boolean: typeof scalar.boolean === "boolean" ? (scalar.boolean ? 1 : 0) : null,
    number: typeof scalar.number === "number" ? scalar.number : null,
    text: typeof scalar.text === "string" ? scalar.text : null,
    variant: typeof scalar.variant === "string" ? scalar.variant : null,
  }
}

/** Стабильный UUID для новых записей value (используется в forkValue). */
export const generateUuid = (): string => crypto.randomUUID()
