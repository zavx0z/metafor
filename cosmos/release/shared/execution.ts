/** Проверенный executable artifact с общей identity и platform payload. */
export interface VerifiedArtifact<Executable, Identity> {
  readonly identity: Identity
  readonly executable: Executable
}

/** Причина завершения одного активированного package runtime. */
export type PackageExit =
  | {reason: "destroyed"}
  | {reason: "failed"; error: unknown}

/** Активный package runtime и наблюдаемое завершение его incarnation. */
export interface ActivePackage<Runtime, Exit = PackageExit> {
  readonly runtime: Runtime
  readonly finished: Promise<Exit>
}

/**
 * Один semantic lifecycle исполнения package поверх platform adapter.
 *
 * Browser adapter выполняет source через `Function()`, server adapter позднее
 * запускает exact artifact отдельным Bun process. Общая orchestration не знает
 * технологию исполнения.
 */
export interface PackageExecutor<Artifact, Context, Candidate, Runtime, Exit = PackageExit> {
  prepare(artifact: Artifact, context: Context): Promise<Candidate>
  activate(candidate: Candidate): Promise<ActivePackage<Runtime, Exit>>
  destroy(active: ActivePackage<Runtime, Exit>): Promise<void>
}
