import {dirname, relative} from "node:path"
import type {createInstalledReleaseStore, PublishedReleaseGraph} from "@metafor/tech-release/installed"
import type {MetaArtifactLocation} from "shared/metafor/source"

/** Matches only store-verified entries or their version base, without reading the caller's former root path. */
export async function findInstalledRootMeta(options: {
  store: Pick<ReturnType<typeof createInstalledReleaseStore>, "artifactPath">
  digest: string
  graph: PublishedReleaseGraph
  path: string
}): Promise<string | undefined> {
  for (const member of options.graph.packages) {
    const server = member.environments.find(part => part.env === "server")
    const product = server?.outputs.find(output => output.artifact === "." && output.kind === "entry-point")
    if (!product) continue
    const identity = {name: member.name, version: member.version, env: "server" as const}
    const root = await options.store.artifactPath(options.digest, {...identity, ...product})
    const meta = server!.outputs.find(output => output.artifact === "./meta" && output.kind === "entry-point")
    const entry = meta ? await options.store.artifactPath(options.digest, {...identity, ...meta}) : root
    if (options.path === dirname(root) || options.path === entry) return member.name
  }
}

/**
Maps only declared public Meta entries of the verified composition. The product
root supplies the package-version base; the declaration may live under a public
alias. A legacy Meta-only product root requires an explicit known owner, never
namespace guessing. Every selected path is verified by the existing store.
[Installed Meta law](../../../../docs/META_PACKAGES.md), [checks](../../spec/installed-metas.spec.ts).
*/
export async function createInstalledMetaMapping(options: {
  store: Pick<ReturnType<typeof createInstalledReleaseStore>, "artifactPath">
  digest: string
  graph: PublishedReleaseGraph
  knownRoots?: readonly string[]
}): Promise<Record<string, MetaArtifactLocation>> {
  const known = new Set(options.knownRoots ?? [])
  const mapping: Record<string, MetaArtifactLocation> = {}
  for (const member of options.graph.packages) {
    const server = member.environments.find(part => part.env === "server")
    const meta = server?.outputs.find(output => output.artifact === "./meta" && output.kind === "entry-point")
    if (server && Object.hasOwn(server.publicArtifacts, "./meta") && !meta)
      throw new Error(`Installed Meta declaration is not a server entry: ${member.name}`)
    if (!meta && !known.has(member.name)) continue
    const product = server?.outputs.find(output => output.artifact === "." && output.kind === "entry-point")
    if (!product) throw new Error(`Installed Meta package has no server product root: ${member.name}`)
    const identity = {name: member.name, version: member.version, env: "server" as const}
    const root = await options.store.artifactPath(options.digest, {...identity, ...product})
    const entry = meta ? await options.store.artifactPath(options.digest, {...identity, ...meta}) : root
    const directory = dirname(root)
    mapping[member.name] = {directory, entry: relative(directory, entry)}
  }
  for (const name of known) if (!mapping[name]) throw new Error(`Known Meta root is missing from the installed composition: ${name}`)
  return mapping
}
