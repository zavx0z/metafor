import type {copyFile, link, rename} from "node:fs/promises"
import type {PackageBuildResult} from "@metafor/tech-build"
import type {BrowserPackageEnvironment, BrowserPackageIdentity} from "@metafor/tech-build/identity"
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

/** Системные операции публикации; хост может предоставить собственный файловый адаптер. */
export interface ReleaseFileOperations {
  rename?: typeof rename
  link?: typeof link
  copyFile?: typeof copyFile
}
