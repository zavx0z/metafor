import type {copyFile, link, rename} from "node:fs/promises"
import type {PackageBuildArtifact, PackageBuildProvenance, PackageBuildResult} from "@metafor/tech-build"
import type {BrowserPackageEnvironment, BrowserPackageIdentity} from "@metafor/tech-build/identity"
import type {PackageEnvironment} from "@metafor/tech-build/identity"
export type ReleasablePackage = string

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

/**
Точная цель [публикации](./README.md), прочитанная без изменений файлов.
`expectedPlan` проверяет её заново внутри очереди перед первым эффектом.
План не резервирует версии и не означает успешной публикации.
*/
export interface ReleasePublicationPlan {
  schemaVersion: 1
  rootManifestSha256: string
  rootIntent: Record<string, string>
  packages: Array<PackageChange & {
    previousVersion: string
    version: string
    environments: PackageEnvironment[]
  }>
}

/** Опциональные preconditions доверенного host; обычная публикация их не требует. */
export interface ReleasePublicationOptions {
  expectedPlan?: ReleasePublicationPlan
  /** Снимок проверенных исходников ДО записи root intent, полученный от этого сборщика. */
  provenance?: {inventorySha256: string}
}

/**
Read-only наблюдение конкретной цели; подготовленные receipts остаются видимыми
при отказе и восстановлении прежних manifests. Чтение не восстанавливает bytes,
не вызывает compiler и не даёт гарантии atomic snapshot при внешней записи.
`ready` относится к package version, а не к успешному запуску runtime.
*/
export interface ReleasePublicationEffects {
  root: {manifestSha256: string; intent: Record<string, unknown>; matchesPlan: boolean}
  packages: Array<{
    name: string
    version: string
    childVersion: string | null
    ready: boolean
    prepared: Array<{
      env: PackageEnvironment
      outputs: PackageBuildArtifact[]
      provenance?: PackageBuildProvenance
    }>
  }>
}

/** Системные операции публикации; хост может предоставить собственный файловый адаптер. */
export interface ReleaseFileOperations {
  rename?: typeof rename
  link?: typeof link
  copyFile?: typeof copyFile
}
