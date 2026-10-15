import {resolve} from "node:path"
import {loadOperatorInstance} from "./operator-instance"
import {realpath} from "node:fs/promises"
import {createInstalledReleaseStore} from "../../../../tech/release/installed"
import {decodeInstalledReleaseSelection, installedReleaseStoreIdentity, prepareInstalledReleaseSelection, type InstalledReleaseSelection} from "../../../../cosmos/selection"
import type {ReleaseManagementSnapshot} from "../../../../cosmos/release/shared/management"

/**
CLI не останавливает живой owner: отправляет один intent в его serialized
handover и читает terminal receipt. После возможного POST эффекта offline
fallback запрещён; timeout остаётся unknown. false допускает только cold start,
который existing dispatcher/launcher отвергает при живом владельце.
*/
export async function applyLiveReleaseSelection(selection: InstalledReleaseSelection, origin: URL, options: {
  fetcher?: typeof fetch
  timeoutMs?: number
  pollMs?: number
  onOperation?(id: string): void
} = {}): Promise<boolean> {
  const fetcher = options.fetcher ?? fetch
  const endpoint = new URL("/release/manage", origin)
  const storeIdentity = await installedReleaseStoreIdentity(selection.storeRoot)
  const read = async (): Promise<ReleaseManagementSnapshot> => {
    const response = await fetcher(endpoint, {redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000)})
    if (!response.ok) throw new Error("Release management is unavailable")
    if (response.headers.get("X-Cosmos-Store-Identity") !== storeIdentity) throw new ReleaseOwnerMismatch()
    const value = await response.json() as ReleaseManagementSnapshot
    if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.candidates))
      throw new Error("Invalid release management snapshot")
    return value
  }
  let before: ReleaseManagementSnapshot
  try {before = await read()} catch (error) {if (error instanceof ReleaseOwnerMismatch) throw error; return false}
  if (before.active?.digest !== selection.expected.digest || before.revision !== selection.expected.revision)
    throw new Error("Installed activation changed; read the current release before retrying")
  const operationId = crypto.randomUUID()
  options.onOperation?.(operationId)
  let rejected: string | undefined
  try {
    const response = await fetcher(endpoint, {method: "POST", redirect: "error", signal: AbortSignal.timeout(5_000),
      headers: {origin: origin.origin, "content-type": "application/json", "X-Cosmos-Store-Identity": storeIdentity},
      body: JSON.stringify({operationId, kind: selection.kind, target: selection.target, expected: selection.expected})})
    if (response.status >= 400 && response.status < 500) {
      const value = await response.json().catch(() => null)
      rejected = typeof value?.error === "string" ? value.error : "Release selection was rejected before admission"
    }
  } catch {
    // Ответ может потеряться после admission. С тем же или новым ID POST не повторяется.
  }
  if (rejected) throw new Error(rejected)
  const deadline = Date.now() + (options.timeoutMs ?? 180_000)
  do {
    let snapshot: ReleaseManagementSnapshot | undefined
    try {snapshot = await read()} catch (error) {
      if (error instanceof ReleaseOwnerMismatch) throw new Error(`Release operation ${operationId} has unknown outcome: live store owner changed`)
    }
    const operation = snapshot?.operation
    if (operation?.id === operationId) {
      if (operation.target !== selection.target || operation.kind !== selection.kind) throw new Error("Release operation receipt differs")
      if (operation.state === "failed") throw new Error(operation.error ?? "Release selection failed")
      if (operation.state === "complete") {
        if (snapshot?.active?.digest !== selection.target) throw new Error("Completed selection is no longer the active release")
        return true
      }
    }
    if (Date.now() >= deadline) break
    await Bun.sleep(options.pollMs ?? 500)
  } while (Date.now() <= deadline)
  throw new Error(`Release operation ${operationId} has unknown outcome; no retry or cold activation was sent`)
}

class ReleaseOwnerMismatch extends Error {
  constructor() {super("Live release owner does not match the selected installed store")}
}

/** CLI adapter читает только явную конфигурацию того же checkout и не печатает credentials. */
async function main(args: string[]) {
  const configured = Bun.env.COSMOS_RELEASE_STORE
  if (!configured) throw new Error("MetaFor downgrade requires an installed release store")
  const root = resolve(configured)
  if (args[0] === "prepare" && args.length <= 2) {
    const selection = await prepareInstalledReleaseSelection(root, args[1] ? {kind: "activate", target: args[1]} : {kind: "downgrade"})
    console.log(Buffer.from(JSON.stringify(selection)).toString("base64url"))
    return
  }
  if (args[0] !== "verify" && args[0] !== "apply" || args.length !== 3) throw new Error("Invalid MetaFor release selection command")
  const selection = decodeInstalledReleaseSelection(args[1]!)
  if (await realpath(root) !== selection.storeRoot) throw new Error("Installed selection belongs to another store")
  const origin = new URL(args[2]!)
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.username || origin.password)
    throw new Error("MetaFor readback requires its local origin")
  if (args[0] === "apply") {
    const complete = await applyLiveReleaseSelection(selection, origin, {onOperation: id => console.error(`MetaFor release operation: ${id}`)})
    if (!complete) {process.exitCode = 3; return}
  }
  const store = createInstalledReleaseStore({root})
  const deadline = Date.now() + 5_000
  do {
    const active = await store.readActivation()
    if (active?.digest === selection.target && active.revision > selection.expected.revision && active.successful[0]?.digest === selection.target) {
      const response = await fetch(new URL("/code", origin), {redirect: "error", signal: AbortSignal.timeout(2_000)})
      if (response.ok && response.headers.get("X-Cosmos-Release") === selection.target) {
        console.log(`MetaFor: ${selection.kind} confirmed ${selection.target}`)
        return
      }
    }
    await Bun.sleep(100)
  } while (Date.now() < deadline)
  throw new Error("MetaFor release selection was not confirmed by active receipt and running server")
}

if (import.meta.main) {
  try {await loadOperatorInstance(); await main(process.argv.slice(2))}
  catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1}
}
