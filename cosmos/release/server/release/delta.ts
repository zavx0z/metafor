import type {BrowserPackageArtifactIdentity} from "../../shared/artifact-integrity"
import {browserPackageIdentitySlot} from "../../shared/artifact-url"
import type {ReleaseDelta} from "../../shared/protocol"

/** Сравнивает полный browser current с полным server desired и возвращает только delta. */
export function releaseDelta(
  desired: BrowserPackageArtifactIdentity[],
  current: BrowserPackageArtifactIdentity[],
): ReleaseDelta {
  const currentBySlot = new Map<string, BrowserPackageArtifactIdentity[]>()
  for (const entry of current) {
    const slot = browserPackageIdentitySlot(entry)
    const entries = currentBySlot.get(slot) ?? []
    entries.push(entry)
    currentBySlot.set(slot, entries)
  }

  const update = desired.filter((expected) =>
    !(currentBySlot.get(browserPackageIdentitySlot(expected)) ?? [])
      .some((entry) => sameIdentity(entry, expected)))

  const desiredRootVersions = new Map(desired.flatMap((entry) =>
    entry.artifact === undefined
      ? [[rootSlot(entry), entry.version] as const]
      : []))
  const remove = current
    .filter((entry) => {
      const targetVersion = desiredRootVersions.get(rootSlot(entry))
      return targetVersion === undefined || entry.version !== targetVersion
    })
    .map(({name, env, artifact, version}) => ({
      name,
      env,
      ...(artifact === undefined ? {} : {artifact}),
      version,
    }))

  return {update, remove}
}

function sameIdentity(
  actual: BrowserPackageArtifactIdentity,
  expected: BrowserPackageArtifactIdentity,
) {
  return actual.name === expected.name
    && actual.env === expected.env
    && actual.artifact === expected.artifact
    && actual.version === expected.version
    && actual.sha256 === expected.sha256
    && actual.size === expected.size
}

function rootSlot(identity: Pick<BrowserPackageArtifactIdentity, "name" | "env">) {
  return browserPackageIdentitySlot({name: identity.name, env: identity.env})
}
