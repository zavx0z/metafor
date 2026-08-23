/** Codec of one persisted Mass key-file. */
export type MassFormat = "json" | "binary"

/**
 * Authored metadata of one Mass key.
 *
 * The property name supplied to `.mass(...)` is the local key. Boundary owns
 * its declaration ID and global key ID; paths, MIME and versions are not
 * authored metadata.
 */
export type MassDeclaration = {
  readonly format: MassFormat
  readonly label?: string
  readonly description?: string
}

export type MassDeclarations = Record<string, MassDeclaration>

/**
 * Handle of one declared Mass key-file.
 *
 * The declared codec controls `write`: JSON keys serialize the value and
 * binary keys accept `Uint8Array`. The content intentionally has no schema
 * type; persistence identity and filesystem paths remain outside the action.
 */
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
