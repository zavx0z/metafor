/** Metadata-only declaration of one persisted Mass artifact. */
export type MassFormat = "json" | "binary"

export type MassDeclaration = {
  readonly format: MassFormat
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
  label?: string
  description?: string
}

export type MassOptions = {label?: string; description?: string}

export type MassFactory = {
  json(options?: MassOptions): MassDeclaration
  binary(options?: MassOptions): MassDeclaration
}

const declaration = (
  format: MassFormat,
  options: MassOptions = {},
): MassDeclaration => ({format, ...options})

/** The only authored Mass metadata. It never contains a key ID or file path. */
export const massFactory: MassFactory = {
  json: (options = {}) => declaration("json", options),
  binary: (options = {}) => declaration("binary", options),
}

export const normalizeMassDeclarations = (schema: MassDeclarations): MassDeclarationDSL[] =>
  Object.entries(schema).map(([key, value]) => ({
    key,
    format: value.format,
    ...(value.label === undefined ? {} : {label: value.label}),
    ...(value.description === undefined ? {} : {description: value.description}),
  }))
