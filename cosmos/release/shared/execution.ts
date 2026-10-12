/**
Проверенный artifact, готовый к передаче platform executor.

`Executable` хранит только принадлежащую adapter форму исполнения, например
source body для `service` или filesystem path для `server`. `Identity`
доказывает точный package artifact до появления side effects.
*/
export interface VerifiedArtifact<Executable, Identity> {
  readonly identity: Identity
  readonly executable: Executable
}

/** Наблюдаемый исход одного активированного package runtime. */
export type PackageExit =
  | {reason: "destroyed"}
  | {reason: "failed"; error: unknown}

/** Активная incarnation package runtime и обещание её окончательного исхода. */
export interface ActivePackage<Runtime, Exit = PackageExit> {
  readonly runtime: Runtime
  readonly finished: Promise<Exit>
}

/**
Один semantic lifecycle исполнения package поверх platform adapter.

`service` adapter выполняет проверенный source через `Function()`, а `server`
adapter запускает exact artifact отдельным Bun process. Оба сохраняют один
порядок `prepare → activate → finished → destroy`; orchestration не зависит
от технологии исполнения.

Смысл выпуска задаёт [release owner law](../README.md#как-сменяется-выпуск),
а lifecycle доказывают [browser regression](../../tests/runtime.spec.ts) и
[Bun process regression](../../tests/process-executor.spec.ts).
*/
export interface PackageExecutor<Artifact, Context, Candidate, Runtime, Exit = PackageExit> {
  prepare(artifact: Artifact, context: Context): Promise<Candidate>
  activate(candidate: Candidate): Promise<ActivePackage<Runtime, Exit>>
  destroy(active: ActivePackage<Runtime, Exit>): Promise<void>
}

/**
Передача подготовленного выпуска устойчивому startup в выбранной среде.

`prepare` проверяет цель и возвращает кандидата, не передавая ему прикладную
работу. `activate` завершает переход через startup: новый runtime получает
новые события, предшественник завершает принятую работу. Отсутствующая цель
означает только платформенный выбор текущего выпуска, если adapter его поддерживает.

Browser использует Request и inert service runtime; server — identity
установленного состава и проверенный process candidate. Способ получения
байтов и политика выбора версии остаются у release.
*/
export interface ReleaseHandover<Target, Candidate> {
  prepare(target?: Target): Promise<Candidate>
  activate(candidate: Candidate): Promise<void>
}
