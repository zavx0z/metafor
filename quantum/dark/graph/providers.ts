import {PROVIDER_META, PROVIDER_REGISTRY_KEY, PROVIDERS_OBSERVATION_SCHEMA, type ReadProvidersReceipt} from "@metafor/types/metafor/providers"
import type {Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import {ENERGY_MASS_RESULT_READ_METHOD, type EnergyMassResultReadReceipt} from "shared/protocol/metafor/observation"
import type {OracleRpcPeer} from "shared/transport/oracle"
import {parseProviderRegistry} from "@metafor/types/metafor/provider-validation"

/**
 * Public Provider catalog projection over one ordinary Graph and fixed own Mass
 * key. No domain Store, native registry/config or executable is consulted.
 * Scope is the same trusted current root as readGraph; this method deliberately
 * grants only Provider registry content, not arbitrary Mass bytes.
 * [Tests](../../tests/graph/providers.spec.ts) verify exposure and changed Mass.
 */
export async function projectProviders(graph: Graph, peer: Pick<OracleRpcPeer, "call">): Promise<ReadProvidersReceipt> {
  const nodes: RuntimeNode[] = [...graph.runtime.roots]
  const atoms: RuntimeAtom[] = []
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    if (node.kind === "atom" && node.meta === PROVIDER_META && node.values.registryMode !== "executor") atoms.push(node)
    nodes.push(...(node.children ?? []))
  }
  if (atoms.length > 64) throw new Error("Provider projection exceeds its Atom limit")
  const providers: ReadProvidersReceipt["providers"] = []
  let total = 0
  for (const atom of atoms) {
    const registryMass = atom.mass.find(mass => mass.key === PROVIDER_REGISTRY_KEY && mass.format === "json") ?? null
    const registry: ReadProvidersReceipt["providers"][number]["registry"] = {resolution: "unknown", value: null, issues: []}
    try {
      if (!registryMass) throw new Error("Provider registry Mass is not declared")
      const read = await peer.call<EnergyMassResultReadReceipt>("energy", ENERGY_MASS_RESULT_READ_METHOD,
        {contractVersion: 1, atom: {root: graph.root, ref: atom.ref, meta: atom.meta}, key: PROVIDER_REGISTRY_KEY, maxBytes: 1024 * 1024})
      if (read.atom.root !== graph.root || read.atom.ref !== atom.ref || read.atom.meta !== atom.meta || read.key !== PROVIDER_REGISTRY_KEY ||
          read.resolution !== "exact" || !Number.isSafeInteger(read.bytes) || read.bytes < 0 || read.bytes > 1024 * 1024 ||
          read.content.format !== "json" || !read.content.present) throw new Error("Provider registry observation is unavailable")
      total += read.bytes
      if (total > 4 * 1024 * 1024) throw new Error("Provider registry observations exceed their byte limit")
      registry.value = parseProviderRegistry(read.content.value)
      registry.resolution = "exact"
    } catch {
      registry.issues.push("Provider registry is missing, invalid or unavailable through its public Mass operation")
    }
    providers.push({ref: atom.ref, meta: atom.meta, state: atom.state, discoveryStatus: typeof atom.values.discoveryStatus === "string" ? atom.values.discoveryStatus : null,
      registryMass: registryMass ? structuredClone(registryMass) : null, registry})
  }
  return {schema: PROVIDERS_OBSERVATION_SCHEMA, version: 1, root: graph.root, providers}
}
