import type {
  BrowserPackageEnvironment,
  PackageEnvironment,
} from "../../../shared/package/environment"
import type {BrowserPackageIdentity} from "../../../shared/package/integrity"

/** Hamiltonian package, который предоставляет browser artifact. */
export type BuildablePackage = string

/** Package, который входит в сменяемый browser release. */
export type ReleasablePackage = string

export interface PackageEnvironmentExport {
  env: PackageEnvironment
  condition: `${string}:${PackageEnvironment}`
  entrypoint: string
  target: "browser" | "bun"
}

/** Готовый package-owned browser artifact. */
export interface PackageBuildArtifact {
  path: string
  sha256: string
  size: number
  type: string
}

/** Результат запуска package-owned `scripts.build`. */
export interface PackageBuildResult {
  module: BuildablePackage
  env: PackageEnvironment
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  outputs: PackageBuildArtifact[]
}

/** Необязательная цель package build для staging-транзакции. */
export interface PackageBuildOptions {
  artifact?: string
  env?: PackageEnvironment
}

/** Проверенный package-owned contract browser artifact. */
export interface PackageOwner {
  root: string
  manifest: string
  env: PackageEnvironment
  entrypoint: string
  artifact: string
  build: string
  typecheck: string
  headers: Record<string, string>
}

/** Разрешённый вид следующего SemVer одного package. */
export type VersionChange = "patch" | "minor" | "major"

/** Внешнее намерение изменить package без готового номера версии. */
export interface PackageChange {
  name: ReleasablePackage
  change: VersionChange
}

/** Точное доказанное состояние browser artifact. */
export interface ReleasedPackage extends BrowserPackageIdentity {
  name: ReleasablePackage
  env: BrowserPackageEnvironment
}

/** Результат сборки и назначения следующей версии package. */
export interface PackageReleaseResult extends PackageBuildResult {
  change: VersionChange
  previousVersion: string
  version: string
}

/** Итог одной серверной транзакции package group. */
export interface PackageReleaseResultSet {
  success: boolean
  results: PackageReleaseResult[]
  packages: ReleasedPackage[]
}

/** Минимальная форма package manifest, используемая release server. */
export interface PackageManifest {
  name?: unknown
  version?: unknown
  dependencies?: Record<string, unknown>
  scripts?: Record<string, unknown>
  exports?: unknown
}
