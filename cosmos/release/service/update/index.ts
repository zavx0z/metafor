import {verifyPackageArtifactResponse} from "../../shared/artifact-integrity"
import {
  browserPackageCache,
} from "../../../shared/package/url"
import {
  browserPackageIdentitySlot,
  browserPackageIdentityUrl,
  parseBrowserPackageArtifactUrl,
} from "../../shared/artifact-url"
import type {ReleaseDelta} from "../../shared/protocol"
import type {ReleaseLoader, ReleaseRuntime} from "../runtime/contract"
import {
  cachedPackageIdentity,
  currentReleasePackages,
  type ReleasePackage,
} from "../cache/current"
import {
  beginTransaction,
  commitTransaction,
  pendingTransaction,
  preparedPackage,
  preparePackage,
} from "./transaction"

const codeCaches = ["release", "internal", "metafor"] as const

/**
Применяет только fresh server delta через одну durable transaction.

До первого old deletion canonical caches сохраняют весь old
composition. Cleanup начинается только после записи и повторной
проверки всех new candidates. После этой границы операция
движется только вперёд и последней удаляет transaction cache.
*/
export async function updateRelease(
  startup: ReleaseLoader,
  delta: ReleaseDelta,
  handover?: Readonly<{
    prepare(request: Request): Promise<ReleaseRuntime>
    activate(candidate: ReleaseRuntime): Promise<void>
    restartBrowser?(): Promise<void>
    signal?: AbortSignal
  }>,
) {
  const interrupted = await pendingTransaction()
  if (delta.update.length === 0 && delta.remove.length === 0) {
    if (!interrupted) return []
    const candidate = await currentReleasePackages()
    console.debug("[@cosmos/release:service:prepare]", "восстановление transaction начато", {
      packages: candidate.map(({name, env, version}) => ({name, env, version})),
    })
    await verifyCandidateComposition(candidate)
    const removed = await cleanupCanonicalComposition(candidate)
    console.debug("[@cosmos/release:service:activate]", "canonical cleanup завершён", {
      removed,
    })
    const restartBrowser = handover?.restartBrowser
    if (!restartBrowser)
      throw new Error("Transaction recovery requires browser handover")
    await restartBrowser()
    await verifyFinalComposition(candidate)
    await commitTransaction()
    console.debug("[@cosmos/release:service:activate]", "transaction завершена", {
      changed: removed,
      mode: "recovery",
    })
    return removed.length === 0 ? ["transaction"] : removed
  }

  const resumed = await beginTransaction()
  console.debug("[@cosmos/release:service:prepare]", "transaction начата", {
    mode: resumed ? "recovery" : "fresh",
    remove: delta.remove,
    update: delta.update,
  })

  const candidate = deriveCandidateComposition(await currentReleasePackages(), delta)

  for (const entry of delta.update) {
    const cached = await preparedPackage(entry)
    if (cached) {
      try {
        await verifyPackageArtifactResponse(cached, entry)
        console.debug("[@cosmos/release:service:prepare]", "exact artifact подготовлен", {
          env: entry.env,
          name: entry.name,
          source: "transaction",
          version: entry.version,
        })
        continue
      } catch {
        // Повреждённый prepared response заменяется тем же exact artifact.
      }
    }

    const request = exactRequest(entry)
    const network = await fetch(
      request,
      handover?.signal ? {signal: handover.signal} : undefined,
    )
    const response = await verifyPackageArtifactResponse(startup.verify(network), entry)
    await preparePackage(entry, response)
    console.debug("[@cosmos/release:service:prepare]", "exact artifact подготовлен", {
      env: entry.env,
      name: entry.name,
      source: request.url,
      version: entry.version,
    })
  }

  const changed = new Set<string>()
  for (const entry of delta.update) {
    const response = await preparedPackage(entry)
    if (!response)
      throw new Error(`Prepared artifact ${entry.name}:${entry.env}@${entry.version} отсутствует`)
    await verifyPackageArtifactResponse(response, entry)

    const owner = requiredCacheOwner(entry.name)
    const cache = await caches.open(owner)
    const exact = exactRequest(entry)
    const installed = await cache.match(exact, {ignoreVary: true})
    if (installed) {
      try {
        await verifyPackageArtifactResponse(installed, entry)
        continue
      } catch {
        // Тот же exact URL не считается candidate без проверенных bytes.
      }
    }

    await cache.put(exact, response)
    changed.add(browserPackageIdentitySlot(entry))
  }

  let runtimeCandidate: ReleaseRuntime | null = null
  let runtimeActivated = false
  try {
    await verifyCandidateComposition(candidate)
    console.debug("[@cosmos/release:service:activate]", "полный candidate composition проверен", {
      packages: candidate.map(({name, env, version}) => ({name, env, version})),
    })

    const releaseTouched = [...delta.update, ...delta.remove].some(isServiceWorkerRelease)
    const nextRelease = candidate.find(isServiceWorkerRelease)
    if (releaseTouched && !nextRelease)
      throw new Error("Candidate composition не содержит release service")
    if (releaseTouched && nextRelease && handover) {
      runtimeCandidate = await handover.prepare(exactRequest(nextRelease))
      console.debug("[@cosmos/release:service:activate]", "release runtime candidate подготовлен", {
        env: nextRelease.env,
        name: nextRelease.name,
        version: nextRelease.version,
      })
    }

    const removals = await canonicalCleanup(candidate)
    const immediate = removals.filter(({deferUntilHandover}) => !deferUntilHandover)
    const deferred = removals.filter(({deferUntilHandover}) => deferUntilHandover)
    const rootChanged = [...delta.update, ...delta.remove]
      .some(({artifact}) => artifact === undefined)
    const needsWindowHandover = rootChanged || deferred.length > 0
    const restartBrowser = handover?.restartBrowser
    let restartBeforeCommit: (() => Promise<void>) | null = null
    if (needsWindowHandover) {
      if (!restartBrowser)
        throw new Error("Root or lazy artifact cleanup requires browser handover")
      restartBeforeCommit = restartBrowser
    }
    for (const entry of immediate) {
      await (await caches.open(entry.owner)).delete(entry.request, {ignoreVary: true})
      changed.add(entry.slot ?? entry.request.url)
    }
    if (deferred.length === 0) {
      console.debug("[@cosmos/release:service:activate]", "canonical cleanup завершён", {
        removed: immediate.map(({owner, request}) => ({cache: owner, source: request.url})),
      })
    } else {
      console.debug("[@cosmos/release:service:activate]", "canonical root cleanup завершён", {
        deferred: deferred.map(({owner, request}) => ({cache: owner, source: request.url})),
        removed: immediate.map(({owner, request}) => ({cache: owner, source: request.url})),
      })
    }

    let browserRestarted = false
    if (restartBeforeCommit) {
      await restartBeforeCommit()
      browserRestarted = true
      const afterHandover = await canonicalCleanup(candidate)
      for (const entry of afterHandover) {
        await (await caches.open(entry.owner)).delete(entry.request, {ignoreVary: true})
        changed.add(entry.slot ?? entry.request.url)
      }
      if (afterHandover.length > 0) {
        console.debug("[@cosmos/release:service:activate]", "lazy cleanup после Window handover завершён", {
          removed: afterHandover.map(({owner, request}) => ({cache: owner, source: request.url})),
        })
      }
    }

    await verifyFinalComposition(candidate)
    await commitTransaction()
    console.debug("[@cosmos/release:service:activate]", "transaction завершена", {
      changed: [...changed],
      mode: resumed ? "recovery" : "fresh",
    })

    if (runtimeCandidate && handover) {
      await handover.activate(runtimeCandidate)
      runtimeActivated = true
    }
    if (!browserRestarted && changed.size > 0) await handover?.restartBrowser?.()
    return [...changed]
  } catch (error) {
    if (runtimeCandidate && !runtimeActivated) await runtimeCandidate.destroy().catch(() => {})
    throw error
  }
}

/** Выводит полный candidate из фактического current и свежей delta. */
function deriveCandidateComposition(current: ReleasePackage[], delta: ReleaseDelta) {
  const removed = new Set(delta.remove.map((entry) => exactRequest(entry).url))
  const candidate = new Map<string, ReleasePackage>()

  for (const entry of current) {
    if (removed.has(exactRequest(entry).url)) continue
    const slot = browserPackageIdentitySlot(entry)
    const existing = candidate.get(slot)
    if (existing && exactRequest(existing).url !== exactRequest(entry).url)
      throw new Error(`Fresh delta оставляет несколько candidates для ${slot}`)
    candidate.set(slot, entry)
  }

  for (const entry of delta.update) candidate.set(browserPackageIdentitySlot(entry), entry)
  return [...candidate.values()]
}

/** До cleanup доказывает наличие и bytes всех candidates, не запрещая old overlap. */
async function verifyCandidateComposition(candidate: ReleasePackage[]) {
  const roots = targetRootVersions(candidate)
  for (const entry of candidate) {
    if (
      entry.artifact !== undefined
      && roots.get(rootRuntimeSlot(entry)) !== entry.version
    ) throw new Error(
      `Artifact ${entry.name}:${entry.env}:${entry.artifact}@${entry.version} has no matching root`,
    )
  }
  for (const expected of candidate) await verifyCanonicalEntry(expected)
}

/** После cleanup доказывает ровно одну exact entry на каждый target slot. */
async function verifyFinalComposition(candidate: ReleasePackage[]) {
  const expected = new Map(candidate.map((entry) => [browserPackageIdentitySlot(entry), entry]))
  const targetVersions = targetRootVersions(candidate)
  const seen = new Set<string>()
  const available = new Set(await caches.keys())

  for (const owner of codeCaches) {
    if (!available.has(owner)) continue
    const cache = await caches.open(owner)
    for (const request of await cache.keys()) {
      const parsed = parseBrowserPackageArtifactUrl(new URL(request.url))
      if (parsed === null || parsed.version === null)
        throw new Error(`Final canonical cache ${owner} contains invalid entry ${request.url}`)
      if (requiredCacheOwner(parsed.name) !== owner)
        throw new Error(`Canonical entry ${request.url} находится в чужом cache ${owner}`)
      const slot = browserPackageIdentitySlot(parsed)
      const expectedEntry = expected.get(slot)
      if (expectedEntry !== undefined) {
        if (seen.has(slot) || request.url !== exactRequest(expectedEntry).url)
          throw new Error(`Final package slot ${slot} не содержит одну candidate entry`)
        seen.add(slot)
        await verifyCanonicalEntry(expectedEntry)
        continue
      }
      if (
        parsed.artifact === undefined
        || targetVersions.get(rootRuntimeSlot(parsed)) !== parsed.version
      ) throw new Error(`Final canonical composition contains stale entry ${request.url}`)
      const response = await cache.match(request, {ignoreVary: true})
      if (!response || await cachedPackageIdentity(owner, request, response) === null)
        throw new Error(`Final lazy artifact ${request.url} has invalid identity`)
    }
  }

  if (seen.size !== expected.size)
    throw new Error("Final canonical composition не совпадает с candidate composition")
}

async function verifyCanonicalEntry(expected: ReleasePackage) {
  const owner = requiredCacheOwner(expected.name)
  const response = await (await caches.open(owner)).match(exactRequest(expected), {ignoreVary: true})
  if (!response)
    throw new Error(`Candidate ${expected.name}:${expected.env}@${expected.version} отсутствует`)
  await verifyPackageArtifactResponse(response, expected)
}

/** Локально замыкает cleanup на фактических canonical keys, включая invalid stale bytes. */
async function canonicalCleanup(candidate: ReleasePackage[]) {
  const keep = new Set(candidate.map((entry) =>
    canonicalKey(requiredCacheOwner(entry.name), exactRequest(entry).url)))
  const targetVersions = targetRootVersions(candidate)
  const available = new Set(await caches.keys())
  const removals: Array<{
    owner: string
    request: Request
    slot: string | null
    serviceWorkerRelease: boolean
    deferUntilHandover: boolean
  }> = []

  for (const owner of codeCaches) {
    if (!available.has(owner)) continue
    const cache = await caches.open(owner)
    for (const request of await cache.keys()) {
      const parsed = parseBrowserPackageArtifactUrl(new URL(request.url))
      if (
        parsed !== null
        && parsed.version !== null
        && keep.has(canonicalKey(owner, request.url))
      ) continue
      if (
        parsed?.artifact !== undefined
        && parsed.version !== null
        && targetVersions.get(rootRuntimeSlot(parsed)) === parsed.version
      ) {
        const response = await cache.match(request, {ignoreVary: true})
        if (response && await cachedPackageIdentity(owner, request, response) !== null) continue
      }
      removals.push({
        owner,
        request,
        serviceWorkerRelease: parsed !== null && isServiceWorkerRelease(parsed),
        deferUntilHandover: parsed?.artifact !== undefined
          && targetVersions.get(rootRuntimeSlot(parsed)) !== parsed.version,
        slot: parsed === null ? null : browserPackageIdentitySlot(parsed),
      })
    }
  }

  return [
    ...removals.filter((entry) => !entry.serviceWorkerRelease),
    ...removals.filter((entry) => entry.serviceWorkerRelease),
  ]
}

async function cleanupCanonicalComposition(candidate: ReleasePackage[]) {
  const removed: string[] = []
  for (const entry of await canonicalCleanup(candidate)) {
    await (await caches.open(entry.owner)).delete(entry.request, {ignoreVary: true})
    removed.push(entry.slot ?? entry.request.url)
  }
  return removed
}

function canonicalKey(owner: string, url: string) {
  return `${owner}\u0000${url}`
}

function rootRuntimeSlot(entry: Pick<ReleasePackage, "name" | "env">) {
  return browserPackageIdentitySlot({name: entry.name, env: entry.env})
}

function targetRootVersions(candidate: ReleasePackage[]) {
  return new Map(candidate.flatMap((entry) =>
    entry.artifact === undefined
      ? [[rootRuntimeSlot(entry), entry.version] as const]
      : []))
}

function isServiceWorkerRelease(entry: Pick<ReleasePackage, "name" | "env" | "artifact">) {
  return entry.name === "@cosmos/release"
    && entry.env === "service"
    && entry.artifact === undefined
}

function exactRequest(
  entry: Pick<ReleasePackage, "name" | "env" | "artifact" | "version">,
) {
  return new Request(
    new URL(browserPackageIdentityUrl(entry), location.origin),
    {cache: "no-store"},
  )
}

function requiredCacheOwner(name: string) {
  const owner = browserPackageCache(name)
  if (owner === null) throw new Error(`Package ${name} не имеет cache owner`)
  return owner
}
