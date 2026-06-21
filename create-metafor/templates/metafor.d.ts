type MetaForTemplateTag = (strings: TemplateStringsArray, ...values: unknown[]) => string

type MetaForFieldConfig = {
  label?: string
}

type MetaForScalarField<T> = {
  optional(config?: MetaForFieldConfig): unknown
  required(value: T, config?: MetaForFieldConfig): unknown
}

type MetaForFieldBuilder = {
  string: MetaForScalarField<string>
  boolean: MetaForScalarField<boolean>
  enum(...values: string[]): MetaForScalarField<string>
}

type MetaForMatterValue = Record<string, string | boolean | null | undefined>

type MetaForBulkParts = {
  view?: (context: { css: MetaForTemplateTag }) => string
  [key: string]: unknown
}

type MetaForBuilder = {
  fields(callback: (field: MetaForFieldBuilder) => Record<string, unknown>): MetaForBuilder
  superposition(states: Record<string, unknown>): MetaForBuilder
  mass(items: Record<string, unknown>): MetaForBuilder
  processes(callback: () => unknown[]): MetaForBuilder
  reactions(callback: () => unknown[]): MetaForBuilder
  matter(callback: (context: { value: MetaForMatterValue; state?: string; html: MetaForTemplateTag }) => string): MetaForBuilder
  bulk(parts?: MetaForBulkParts): MetaForBuilder
}

type MetaForFn = (name: string, config?: { desc?: string }) => MetaForBuilder

declare global {
  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export {}
