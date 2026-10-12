/** Representation of one persisted Mass key. */
export type MassFormat = "json" | "binary" | "directory"

/**
 * Authored metadata of one Mass key.
 *
 * The property name supplied to `.mass(...)` is the local key. Boundary owns
 * its declaration ID and global key ID; paths, MIME and versions are not
 * authored metadata.
 */
export type MassDeclaration<Format extends MassFormat = MassFormat> = {
  readonly format: Format
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

/**
Local cooperative writer lifetime. Meta stops its writer before release; release
never removes persisted directory bytes or proves Docker/fd shutdown. Retirement
aborts signal but retains writer exclusivity until this exact lease releases.
*/
export type MassDirectoryLease = {
  readonly path: string
  readonly signal: AbortSignal
  release(): Promise<void>
}

/**
Directory access is local to actions, not a byte-result or snapshot API. Acquire
checks the Boundary grant and safe directory path, and excludes another writer
of the same global key in this Energy process. Cold resource identity/adoption
belongs to Meta; a process-local lease cannot detect an orphan external writer.
*/
export type MassDirectoryHandle = {
  acquire(): Promise<MassDirectoryLease>
}

export type MassHandles<Schema extends MassDeclarations> = {
  [Key in keyof Schema]: Schema[Key] extends MassDeclaration<"directory"> ? MassDirectoryHandle : MassHandle
}

export type MassDeclarationDSL = {
  key: string
  format: MassFormat
  label?: string
  description?: string
}

export type MassOptions = {label?: string; description?: string}

export type MassFactory = {
  json(options?: MassOptions): MassDeclaration<"json">
  binary(options?: MassOptions): MassDeclaration<"binary">
  directory(options?: MassOptions): MassDeclaration<"directory">
}
