import type {VersionChange} from "./contracts"

const workspaceCaret = /^workspace:\^(\d+)\.(\d+)\.(\d+)$/

/** Возвращает точную версию из workspace caret dependency. */
export function caretVersion(value: string) {
  const match = workspaceCaret.exec(value)
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

/** Проверяет точный стабильный SemVer без prerelease и build metadata. */
export function isVersion(value: string) {
  return workspaceCaret.test(`workspace:^${value}`)
}

/** Вычисляет следующую стабильную SemVer без принятия номера извне. */
export function nextPackageVersion(version: string, change: VersionChange) {
  const parsed = workspaceCaret.exec(`workspace:^${version}`)
  if (!parsed) throw new Error(`Invalid released version ${version}`)

  let major = Number(parsed[1])
  let minor = Number(parsed[2])
  let patch = Number(parsed[3])

  if (change === "major") {
    major += 1
    minor = 0
    patch = 0
  } else if (change === "minor") {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  return `${major}.${minor}.${patch}`
}

/** Проверяет поддерживаемый вид SemVer-изменения. */
export function isVersionChange(value: unknown): value is VersionChange {
  return value === "patch" || value === "minor" || value === "major"
}
