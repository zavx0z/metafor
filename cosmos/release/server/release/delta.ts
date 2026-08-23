import {browserPackageSlot} from "../../../shared/package/url"
import type {BrowserPackageIdentity} from "../../../shared/package/integrity"
import type {ReleaseDelta} from "../../shared/protocol"

/** Сравнивает полный browser current с полным server desired и возвращает только delta. */
export function releaseDelta(
  desired: BrowserPackageIdentity[],
  current: BrowserPackageIdentity[],
): ReleaseDelta {
  const desiredBySlot = new Map(desired.map((entry) => [
    browserPackageSlot(entry.name, entry.env),
    entry,
  ]))
  const currentBySlot = new Map<string, BrowserPackageIdentity[]>()
  for (const entry of current) {
    const slot = browserPackageSlot(entry.name, entry.env)
    const entries = currentBySlot.get(slot) ?? []
    entries.push(entry)
    currentBySlot.set(slot, entries)
  }

  const update = desired.filter((expected) =>
    !(currentBySlot.get(browserPackageSlot(expected.name, expected.env)) ?? [])
      .some((entry) => sameIdentity(entry, expected)))
  const remove = current
    .filter((entry) => {
      const expected = desiredBySlot.get(browserPackageSlot(entry.name, entry.env))
      return expected === undefined || entry.version !== expected.version
    })
    .map(({name, env, version}) => ({name, env, version}))

  return {update, remove}
}

function sameIdentity(actual: BrowserPackageIdentity, expected: BrowserPackageIdentity) {
  return actual.name === expected.name
    && actual.env === expected.env
    && actual.version === expected.version
    && actual.sha256 === expected.sha256
    && actual.size === expected.size
}
