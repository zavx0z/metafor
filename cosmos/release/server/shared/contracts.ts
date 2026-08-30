import type {
  BrowserPackageEnvironment,
  PackageEnvironment,
} from "../../../shared/package/environment"
import type {BrowserPackageIdentity} from "../../../shared/package/integrity"
import type {
  PackageArtifactKey,
  PublicPackageArtifactKey,
} from "../../shared/artifact"

/** Cosmos package, который предоставляет browser artifact. */
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
  /** Логическая identity build output; независимый storage reader может её не знать. */
  artifact?: PackageArtifactKey
  /** Производный вид output; отсутствует при независимом чтении storage file. */
  kind?: "entry-point" | "chunk" | "asset" | "copy" | "sourcemap"
  /** Логический владелец development map, сохранённой generated companion. */
  sourceMapFor?: PackageArtifactKey
  /** Нужен ли output корневому запуску до последующей network-lazy ветви. */
  load?: "eager" | "lazy"
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
  /** Staging directory override полного multi-output graph. */
  outdir?: string
  /** Exact package version, парная явному multi-output staging directory. */
  version?: string
}

/** Exact public source, выбранный из `package.json#exports` одного environment. */
export interface PackageBuildSource {
  artifact: PublicPackageArtifactKey
  source: `./${string}`
}

/** Проверенный package-owned contract browser artifact. */
export interface PackageOwner {
  root: string
  manifest: string
  env: PackageEnvironment
  entrypoint: string
  artifact: string
  /** Deterministic public sources of this environment, including root. */
  sources: readonly PackageBuildSource[]
  build: string
  /** Built-in loaders, передаваемые только opt-in plugin adapter этого environment. */
  loaders: Readonly<Record<string, Bun.Loader>>
  /** Exact plugin files; пустой список сохраняет direct Bun CLI executor. */
  plugins: readonly string[]
  typecheck: string
  /** Current package SemVer used when caller does not stage a future version. */
  version: string
  headers: Record<string, string>
}

/** Одна output edge только для проверки текущего build process. */
export interface PackageBuildReportImport {
  path: string
  kind: string
  external: boolean
}

/** Один physical output isolated child до назначения логической identity. */
export interface PackageBuildReportOutput {
  path: string
  relative: string
  kind: "entry-point" | "chunk" | "asset" | "copy"
  loader: string
  entryPoint?: string
  source?: string
  imports: readonly PackageBuildReportImport[]
}

/**
Временный structural result одной isolated build.

Report удаляется после parent validation и никогда не становится release state,
publication metadata или browser protocol.
*/
export interface PackageBuildReport {
  outputs: readonly PackageBuildReportOutput[]
  externalImports: readonly PackageBuildReportImport[]
  /** Physical output relatives, статически достижимые из root entry. */
  rootClosure: readonly string[]
  /** Exact public artifact URLs, найденные литералами внутри root closure. */
  publicArtifactUrls: readonly string[]
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
  devDependencies?: Record<string, unknown>
  scripts?: Record<string, unknown>
  exports?: unknown
}
