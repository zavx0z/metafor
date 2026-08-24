/**
 * Описывает место исполнения одного artifact внутри Cosmos package.
 *
 * Environment не является package namespace или способом доставки. Он входит
 * в conditional export, artifact identity и package-wide version, а build
 * использует его для выбора browser либо Bun target.
 *
 * Полный набор состоит из пяти сред:
 *
 * - `main` — главный browser context `Window`;
 * - `worker` — browser Worker, отличный от Service Worker;
 * - `service` — `ServiceWorkerGlobalScope`; текущий release artifact этой среды
 *   исполняется startup через `Function()` внутри Service Worker;
 * - `server` — отдельный Bun process; текущий server lifecycle запускает exact
 *   artifact через `Bun.spawn`;
 * - `server-worker` — Bun Worker, созданный через `Worker`, а не отдельный
 *   process, запущенный через `Bun.spawn`.
 *
 * Browser environments могут доставляться через browser package URL, Cache
 * Storage и Service Worker transaction. Bun environments собираются для Bun и
 * не входят в browser delivery/cache projection.
 *
 * Понятный [закон environments](../../README.md#среды-выполнения-packages)
 * связывает этот public contract с общей картиной Cosmos.
 *
 * @packageDocumentation
 */

/** Все допустимые среды выполнения одного Cosmos package. */
export const packageEnvironments = [
  "main",
  "worker",
  "service",
  "server",
  "server-worker",
] as const

/** Union всех точных package environment literals. */
export type PackageEnvironment = typeof packageEnvironments[number]

/**
 * Browser environments: `Window`, browser Worker и Service Worker.
 *
 * Их artifacts собираются с `target=browser` и могут участвовать в browser
 * package URL, Cache Storage и release transaction.
 */
export const browserPackageEnvironments = [
  "main",
  "worker",
  "service",
] as const satisfies readonly PackageEnvironment[]

/** Union environments, исполняемых browser runtime. */
export type BrowserPackageEnvironment = typeof browserPackageEnvironments[number]

/**
 * Bun environments: отдельный Bun process и Bun Worker.
 *
 * Их artifacts собираются с `target=bun` и не доставляются через browser
 * package URL или Cache Storage.
 */
export const bunPackageEnvironments = [
  "server",
  "server-worker",
] as const satisfies readonly PackageEnvironment[]

/** Union environments, исполняемых Bun runtime. */
export type BunPackageEnvironment = typeof bunPackageEnvironments[number]

/** Проверяет принадлежность строки полному набору package environments. */
export function isPackageEnvironment(value: string): value is PackageEnvironment {
  return packageEnvironments.some((environment) => environment === value)
}

/** Проверяет, что environment исполняется browser runtime. */
export function isBrowserPackageEnvironment(value: string): value is BrowserPackageEnvironment {
  return browserPackageEnvironments.some((environment) => environment === value)
}

/** Проверяет, что environment исполняется Bun runtime. */
export function isBunPackageEnvironment(value: string): value is BunPackageEnvironment {
  return bunPackageEnvironments.some((environment) => environment === value)
}

/**
 * Возвращает package build target только для явно классифицированной среды.
 *
 * Остаточная логика `не browser → bun` намеренно запрещена: если полный список
 * получит новый env без platform subset, сборка должна завершиться ошибкой.
 */
export function packageEnvironmentBuildTarget(
  environment: PackageEnvironment,
): "browser" | "bun" {
  if (isBrowserPackageEnvironment(environment)) return "browser"
  if (isBunPackageEnvironment(environment)) return "bun"
  throw new Error(`Package environment ${String(environment)} has no build target`)
}
