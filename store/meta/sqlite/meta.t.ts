export type MetaSource = string

export type MetaRow = {
  src: string
  name: string | null
  desc: string | null
  view_css: string | null
}

export type MetaMassValueRow = {
  uuid: string
  parent_value: string | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}

/**
 * Снимок UUID'ов канонизированной меты, нужный потребителям, которые работают с patch-flow:
 * актор-эмиттер требует field/variant/initialState uuid'ы, чтобы строить graviton/gluon/photon-патчи.
 *
 * Это не схемная сущность, а runtime-проекция — собирается через `Meta.identifiers()` запросом
 * по требованию (ORM-кеша нет, запрос идёт каждый раз свежий).
 */
export interface MetaIdentifiers {
  src: string
  fieldUuids: Map<string, string>
  variantUuids: Map<string, Map<string, string>>
  superpositionUuids: Map<string, string>
  initialState: string | null
}
