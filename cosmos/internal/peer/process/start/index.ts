import {dirname, isAbsolute, resolve} from "node:path"
import {startReleaseNode, readReleaseNodeConfiguration, createReleaseNodeObservationBridge, type ReleaseNode} from "@cosmos/release/node"
import {createInstalledReleaseStore, isReleaseDigest} from "@metafor/tech-release/installed"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"
import type {MetaforCosmosInternalPeerProcessStart as Start} from "./contract"
export type {MetaforCosmosInternalPeerProcessStart} from "./contract"

/** Starts only the Meta's selected participant; credentials stay in its declared directory Mass and bytes come from the pinned installed release. */
export default async function startNetwork(input: Start.Input): Promise<Start.Output> {
  const ackId = input.requestId
  let lease: MassDirectoryLease | undefined
  let node: ReleaseNode | undefined
  let constructed: Start.Input["energy"]["resource"]
  input.signal.throwIfAborted()
  try {
    const configurationFile = Bun.env.COSMOS_NODE_CONFIG
    const storeRoot = Bun.env.COSMOS_RELEASE_STORE
    const digest = Bun.env.COSMOS_RELEASE_DIGEST
    if (!ackId || !configurationFile || !isAbsolute(configurationFile) || !storeRoot || !isReleaseDigest(digest))
      throw new Error("Pinned network context is missing")
    const existing = input.energy.resource
    if (existing) {
      if (!existing.node || !existing.admission.open || existing.configurationFile !== resolve(configurationFile) || existing.digest !== digest)
        throw new Error("Existing network requires an explicit stop")
      existing.lease.signal.throwIfAborted()
      return {ackId, status: "running", error: null}
    }
    lease = await input.mass.configuration.acquire()
    const admission = {open: false}
    constructed = {lease, admission, digest, configurationFile: resolve(configurationFile)}
    lease.signal.throwIfAborted()
    if (dirname(resolve(configurationFile)) !== lease.path) throw new Error("Configuration is not in the declared directory Mass")
    const config = await readReleaseNodeConfiguration(configurationFile)
    if (config.sources !== undefined) throw new Error("Network configuration cannot select root declarations")
    if (dirname(resolve(config.tokenFile)) !== lease.path) throw new Error("Credential is not in the declared directory Mass")
    const store = createInstalledReleaseStore({root: storeRoot})
    const candidate = await store.verifyCandidate(digest)
    admission.open = true
    const observation = createReleaseNodeObservationBridge({...(Bun.env.FORCE_RPC_ADDRESS ? {origin:Bun.env.FORCE_RPC_ADDRESS}:{}), ...(Bun.env.COSMOS_QUANTUM_TOKEN ? {token:Bun.env.COSMOS_QUANTUM_TOKEN}:{})})
    node = await startReleaseNode({config, ...(observation ? {observation} : {}), source: {
      async readGraph(expectedDigest) {
        if (!admission.open || expectedDigest !== digest) throw new Error("Release source admission is closed or not pinned")
        return candidate.graph
      },
      async read(identity) {
        if (!admission.open) throw new Error("Release source admission is closed")
        return Bun.file(await store.artifactPath(digest, identity)).stream()
      },
    }})
    constructed.node = node
    input.signal.throwIfAborted()
    lease.signal.throwIfAborted()
    input.energy.resource = constructed
    return {ackId, status: "running", error: null}
  } catch {
    // Construction rollback only: policy for an already-published resource remains Meta-owned.
    if (constructed) constructed.admission.open = false
    let closed = node === undefined
    try {await node?.close(); closed = true} catch {}
    let released = lease === undefined
    if (closed) {try {await lease?.release(); released = true} catch {}}
    if ((!closed || !released) && constructed) input.energy.resource = constructed
    input.signal.throwIfAborted()
    return {ackId, status: "failed", error: "Network startup failed"}
  }
}
