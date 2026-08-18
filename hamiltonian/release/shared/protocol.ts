import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
} from "../../shared/package/environment"
import {isSha256, type BrowserPackageIdentity} from "../../shared/package/integrity"
import {browserPackageCache, browserPackageSlot, browserPackageUrl} from "../../shared/package/url"

/** Exact cache entry, которую server должен удалить из browser release. */
export interface ReleaseRemoval {
  name: string
  env: BrowserPackageEnvironment
  version: string
}

/** Единственный ответ server: только отличия current от desired. */
export interface ReleaseDelta {
  update: BrowserPackageIdentity[]
  remove: ReleaseRemoval[]
}

export interface ReleaseCurrentMessage {
  type: "release-current"
  current: BrowserPackageIdentity[]
}

export interface ReleaseDeltaMessage extends ReleaseDelta {
  type: "release-delta"
}

export interface ReleaseChangedMessage {
  type: "release-changed"
}

/** Формирует payload-free сигнал, который не может содержать старый release. */
export function releaseChangedMessage(): ReleaseChangedMessage {
  return {type: "release-changed"}
}

/** Строго принимает payload-free signal без package state и IDs. */
export function parseReleaseChangedMessage(value: unknown): ReleaseChangedMessage | null {
  if (!recordWithKeys(value, ["type"]) || value.type !== "release-changed") return null
  return releaseChangedMessage()
}

/** Формирует полный фактический current state одного browser profile. */
export function releaseCurrentMessage(
  current: BrowserPackageIdentity[],
): ReleaseCurrentMessage {
  return {type: "release-current", current}
}

/** Строго принимает current cache entries, включая корректное пустое состояние. */
export function parseReleaseCurrentMessage(value: unknown): ReleaseCurrentMessage | null {
  if (!recordWithKeys(value, ["type", "current"]) || value.type !== "release-current") return null
  const current = packageIdentities(value.current, false)
  return current === null ? null : releaseCurrentMessage(current)
}

/** Формирует delta без полного desired state. */
export function releaseDeltaMessage(delta: ReleaseDelta): ReleaseDeltaMessage {
  return {type: "release-delta", update: delta.update, remove: delta.remove}
}

/** Строго принимает только update/remove response без transport metadata. */
export function parseReleaseDeltaMessage(value: unknown): ReleaseDeltaMessage | null {
  if (
    !recordWithKeys(value, ["type", "update", "remove"])
    || value.type !== "release-delta"
  ) return null
  const update = packageIdentities(value.update, true)
  const remove = releaseRemovals(value.remove)
  if (update === null || remove === null) return null
  const updated = new Set(update.map(({name, env, version}) =>
    browserPackageUrl(name, env, version)))
  if (remove.some(({name, env, version}) => updated.has(browserPackageUrl(name, env, version))))
    return null
  return releaseDeltaMessage({update, remove})
}

function packageIdentities(value: unknown, uniqueSlots: boolean) {
  if (!Array.isArray(value)) return null
  const identities: BrowserPackageIdentity[] = []
  const entries = new Set<string>()
  const slots = new Set<string>()

  for (const entry of value) {
    if (!recordWithKeys(entry, ["name", "env", "version", "sha256", "size"])) return null
    if (
      typeof entry.name !== "string"
      || typeof entry.env !== "string"
      || !isBrowserPackageEnvironment(entry.env)
      || typeof entry.version !== "string"
      || !/^\d+\.\d+\.\d+$/.test(entry.version)
      || !isSha256(entry.sha256)
      || typeof entry.size !== "number"
      || !Number.isSafeInteger(entry.size)
      || entry.size <= 0
      || browserPackageCache(entry.name) === null
    ) return null

    let exact: string
    try {
      exact = browserPackageUrl(entry.name, entry.env, entry.version)
    } catch {
      return null
    }
    const slot = browserPackageSlot(entry.name, entry.env)
    if (entries.has(exact) || uniqueSlots && slots.has(slot)) return null
    entries.add(exact)
    slots.add(slot)
    identities.push({
      name: entry.name,
      env: entry.env,
      version: entry.version,
      sha256: entry.sha256,
      size: entry.size,
    })
  }

  return identities
}

function releaseRemovals(value: unknown) {
  if (!Array.isArray(value)) return null
  const removals: ReleaseRemoval[] = []
  const entries = new Set<string>()

  for (const entry of value) {
    if (!recordWithKeys(entry, ["name", "env", "version"])) return null
    if (
      typeof entry.name !== "string"
      || typeof entry.env !== "string"
      || !isBrowserPackageEnvironment(entry.env)
      || typeof entry.version !== "string"
      || !/^\d+\.\d+\.\d+$/.test(entry.version)
      || browserPackageCache(entry.name) === null
    ) return null
    let exact: string
    try {
      exact = browserPackageUrl(entry.name, entry.env, entry.version)
    } catch {
      return null
    }
    if (entries.has(exact)) return null
    entries.add(exact)
    removals.push({name: entry.name, env: entry.env, version: entry.version})
  }

  return removals
}

function recordWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}
