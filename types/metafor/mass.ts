/** Metadata-only declaration of one persisted Mass artifact. */
export type MassFormat = "json" | "binary"

export type MassDeclaration = {
  readonly format: MassFormat
  readonly mime: string
  readonly label?: string
  readonly description?: string
}

export type MassDeclarations = Record<string, MassDeclaration>

/** Declared-key file handle; its content intentionally has no schema type. */
export type MassHandle = {
  readBytes(): Promise<Uint8Array>
  readText(): Promise<string>
  readJson(): Promise<unknown>
  write(value: unknown): Promise<void>
}

export type MassHandles<Schema extends MassDeclarations> = {[Key in keyof Schema]: MassHandle}


export type MassDeclarationDSL = {
  key: string
  format: MassFormat
  mime: string
  label?: string
  description?: string
}

export type MassFactory = {
  json(options?: {mime?: string; label?: string; description?: string}): MassDeclaration
  binary(options?: {mime?: string; label?: string; description?: string}): MassDeclaration
}

const declaration = (
  format: MassFormat,
  mime: string,
  options: {label?: string; description?: string} = {},
): MassDeclaration => ({format, mime, ...options})

/** The only authored Mass metadata. It never contains a key ID or file path. */
export const massFactory: MassFactory = {
  json: (options = {}) => declaration("json", options.mime ?? "application/json", options),
  binary: (options = {}) => declaration("binary", options.mime ?? "application/octet-stream", options),
}

export const normalizeMassDeclarations = (schema: MassDeclarations): MassDeclarationDSL[] =>
  Object.entries(schema).map(([key, value]) => ({
    key,
    format: value.format,
    mime: value.mime,
    ...(value.label === undefined ? {} : {label: value.label}),
    ...(value.description === undefined ? {} : {description: value.description}),
  }))
