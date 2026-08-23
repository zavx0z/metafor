import {verifyPackageResponse} from "../../../shared/package/integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../../../shared/package/url"
import type {ReleaseDelta} from "../../shared/protocol"
import type {ReleaseLoader, ReleaseRuntime} from "../runtime/contract"
import {currentReleasePackages, type ReleasePackage} from "../cache/current"
import {
  beginTransaction,
  commitTransaction,
  pendingTransaction,
  preparedPackage,
  preparePackage,
} from "./transaction"

const codeCaches = ["release", "internal", "metafor"] as const

/**
 * Применяет только fresh server delta через одну durable transaction.
 *
 * До первого old deletion canonical caches сохраняют весь old
 * composition. Cleanup начинается только после записи и повторной
 * проверки всех new candidates. После этой границы операция
 * движется только вперёд и последней удаляет transaction cache.
 */
export async function updateRelease(
  startup: ReleaseLoader,
  delta: ReleaseDelta,
  handover?: Readonly<{
    prepare(request: Request): Promise<ReleaseRuntime>
    activate(candidate: ReleaseRuntime): Promise<void>
    signal?: AbortSignal
  }>,
) {
  const interrupted = await pendingTransaction()
  if (delta.update.length === 0 && delta.remove.length === 0) {
    if (!interrupted) return []
    const candidate = await currentReleasePackages()
    console.debug("[@hamiltonian/release:service:prepare]", "восстановление transaction начато", {
      packages: candidate.map(({name, env, version}) => ({name, env, version})),
    })
    await verifyCandidateComposition(candidate)
    const removed = await cleanupCanonicalComposition(candidate)
    console.debug("[@hamiltonian/release:service:activate]", "canonical cleanup завершён", {
      removed,
    })
    await verifyFinalComposition(candidate)
    await commitTransaction()
    console.debug("[@hamiltonian/release:service:activate]", "transaction завершена", {
      changed: removed,
      mode: "recovery",
    })
    return removed.length === 0 ? ["transaction"] : removed
  }

  const resumed = await beginTransaction()
  console.debug("[@hamiltonian/release:service:prepare]", "transaction начата", {
    mode: resumed ? "recovery" : "fresh",
    remove: delta.remove,
    update: delta.update,
  })

  const candidate = deriveCandidateComposition(await currentReleasePackages(), delta)

  for (const entry of delta.update) {
    const cached = await preparedPackage(entry)
    if (cached) {
      try {
        await verifyPackageResponse(cached, entry)
        console.debug("[@hamiltonian/release:service:prepare]", "exact artifact подготовлен", {
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
    const response = await verifyPackageResponse(startup.verify(network), entry)
    await preparePackage(entry, response)
    console.debug("[@hamiltonian/release:service:prepare]", "exact artifact подготовлен", {
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
    await verifyPackageResponse(response, entry)

    const owner = requiredCacheOwner(entry.name)
    const cache = await caches.open(owner)
    const exact = exactRequest(entry)
    const installed = await cache.match(exact, {ignoreVary: true})
    if (installed) {
      try {
        await verifyPackageResponse(installed, entry)
        continue
      } catch {
        // Тот же exact URL не считается candidate без проверенных bytes.
      }
    }

    await cache.put(exact, response)
    changed.add(browserPackageSlot(entry.name, entry.env))
  }

  let runtimeCandidate: ReleaseRuntime | null = null
  let runtimeActivated = false
  try {
    await verifyCandidateComposition(candidate)
    console.debug("[@hamiltonian/release:service:activate]", "полный candidate composition проверен", {
      packages: candidate.map(({name, env, version}) => ({name, env, version})),
    })

    const releaseTouched = [...delta.update, ...delta.remove].some(isServiceWorkerRelease)
    const nextRelease = candidate.find(isServiceWorkerRelease)
    if (releaseTouched && !nextRelease)
      throw new Error("Candidate composition не содержит release service")
    if (releaseTouched && nextRelease && handover) {
      runtimeCandidate = await handover.prepare(exactRequest(nextRelease))
      console.debug("[@hamiltonian/release:service:activate]", "release runtime candidate подготовлен", {
        env: nextRelease.env,
        name: nextRelease.name,
        version: nextRelease.version,
      })
    }

    const removals = await canonicalCleanup(candidate)
    for (const entry of removals) {
      await (await caches.open(entry.owner)).delete(entry.request, {ignoreVary: true})
      changed.add(entry.slot ?? entry.request.url)
    }
    console.debug("[@hamiltonian/release:service:activate]", "canonical cleanup завершён", {
      removed: removals.map(({owner, request}) => ({cache: owner, source: request.url})),
    })

    await verifyFinalComposition(candidate)
    await commitTransaction()
    console.debug("[@hamiltonian/release:service:activate]", "transaction завершена", {
      changed: [...changed],
      mode: resumed ? "recovery" : "fresh",
    })

    if (runtimeCandidate && handover) {
      await handover.activate(runtimeCandidate)
      runtimeActivated = true
    }
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
    const slot = browserPackageSlot(entry.name, entry.env)
    const existing = candidate.get(slot)
    if (existing && exactRequest(existing).url !== exactRequest(entry).url)
      throw new Error(`Fresh delta оставляет несколько candidates для ${slot}`)
    candidate.set(slot, entry)
  }

  for (const entry of delta.update) candidate.set(browserPackageSlot(entry.name, entry.env), entry)
  return [...candidate.values()]
}

/** До cleanup доказывает наличие и bytes всех candidates, не запрещая old overlap. */
async function verifyCandidateComposition(candidate: ReleasePackage[]) {
  for (const expected of candidate) await verifyCanonicalEntry(expected)
}

/** После cleanup доказывает ровно одну exact entry на каждый target slot. */
async function verifyFinalComposition(candidate: ReleasePackage[]) {
  const expected = new Map(candidate.map((entry) => [browserPackageSlot(entry.name, entry.env), entry]))
  const actual = new Map<string, Request[]>()
  const available = new Set(await caches.keys())

  for (const owner of codeCaches) {
    if (!available.has(owner)) continue
    for (const request of await (await caches.open(owner)).keys()) {
      const parsed = parseBrowserPackageUrl(new URL(request.url))
      if (parsed === null || parsed.version === null) continue
      if (requiredCacheOwner(parsed.name) !== owner)
        throw new Error(`Canonical entry ${request.url} находится в чужом cache ${owner}`)
      const slot = browserPackageSlot(parsed.name, parsed.env)
      const entries = actual.get(slot) ?? []
      entries.push(request)
      actual.set(slot, entries)
    }
  }

  if (actual.size !== expected.size)
    throw new Error("Final canonical composition не совпадает с candidate composition")

  for (const [slot, entry] of expected) {
    const entries = actual.get(slot)
    if (entries?.length !== 1 || entries[0]?.url !== exactRequest(entry).url)
      throw new Error(`Final package slot ${slot} не содержит одну candidate entry`)
    await verifyCanonicalEntry(entry)
  }
}

async function verifyCanonicalEntry(expected: ReleasePackage) {
  const owner = requiredCacheOwner(expected.name)
  const response = await (await caches.open(owner)).match(exactRequest(expected), {ignoreVary: true})
  if (!response)
    throw new Error(`Candidate ${expected.name}:${expected.env}@${expected.version} отсутствует`)
  await verifyPackageResponse(response, expected)
}

/** Локально замыкает cleanup на фактических canonical keys, включая invalid stale bytes. */
async function canonicalCleanup(candidate: ReleasePackage[]) {
  const keep = new Set(candidate.map((entry) =>
    canonicalKey(requiredCacheOwner(entry.name), exactRequest(entry).url)))
  const available = new Set(await caches.keys())
  const removals: Array<{
    owner: string
    request: Request
    slot: string | null
    serviceWorkerRelease: boolean
  }> = []

  for (const owner of codeCaches) {
    if (!available.has(owner)) continue
    for (const request of await (await caches.open(owner)).keys()) {
      const parsed = parseBrowserPackageUrl(new URL(request.url))
      if (
        parsed !== null
        && parsed.version !== null
        && keep.has(canonicalKey(owner, request.url))
      ) continue
      removals.push({
        owner,
        request,
        serviceWorkerRelease: parsed !== null && isServiceWorkerRelease(parsed),
        slot: parsed === null ? null : browserPackageSlot(parsed.name, parsed.env),
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

function isServiceWorkerRelease(entry: Pick<ReleasePackage, "name" | "env">) {
  return entry.name === "@hamiltonian/release" && entry.env === "service"
}

function exactRequest(entry: Pick<ReleasePackage, "name" | "env" | "version">) {
  return new Request(
    new URL(browserPackageUrl(entry.name, entry.env, entry.version), location.origin),
    {cache: "no-store"},
  )
}

function requiredCacheOwner(name: string) {
  const owner = browserPackageCache(name)
  if (owner === null) throw new Error(`Package ${name} не имеет cache owner`)
  return owner
}
