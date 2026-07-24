/** Metadata-only declaration of one persisted Mass artifact. */
export type MassFormat = "json" | "binary"

export type MassDeclaration<Value = unknown> = {
  readonly format: MassFormat
  readonly mime: string
  readonly label?: string
  readonly description?: string
  /** Type-only marker; never becomes declaration data. */
  readonly __value?: Value
}

export type MassDeclarations = Record<string, MassDeclaration>

export type MassValue<Schema extends MassDeclarations> = {
  [Key in keyof Schema]: Schema[Key] extends MassDeclaration<infer Value> ? Value : never
}

export type MassDeclarationDSL = {
  key: string
  format: MassFormat
  mime: string
  label?: string
  description?: string
}

export type MassFactory = {
  json<Value = unknown>(options?: {mime?: string; label?: string; description?: string}): MassDeclaration<Value>
  binary(options?: {mime?: string; label?: string; description?: string}): MassDeclaration<Uint8Array>
}

const declaration = <Value>(
  format: MassFormat,
  mime: string,
  options: {label?: string; description?: string} = {},
): MassDeclaration<Value> => ({format, mime, ...options})

/** The only authored Mass metadata. It never contains a key ID or file path. */
export const massFactory: MassFactory = {
  json: <Value = unknown>(options: {mime?: string; label?: string; description?: string} = {}) => declaration<Value>("json", options.mime ?? "application/json", options),
  binary: (options: {mime?: string; label?: string; description?: string} = {}) => declaration<Uint8Array>("binary", options.mime ?? "application/octet-stream", options),
}

export const normalizeMassDeclarations = (schema: MassDeclarations): MassDeclarationDSL[] =>
  Object.entries(schema).map(([key, value]) => ({
    key,
    format: value.format,
    mime: value.mime,
    ...(value.label === undefined ? {} : {label: value.label}),
    ...(value.description === undefined ? {} : {description: value.description}),
  }))
