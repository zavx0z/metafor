import {lstat} from "node:fs/promises"
import {resolve} from "node:path"

/** Resolve only explicit installed configuration through the public code-store API; never print credentials. */
export async function configuredInstalledReleaseArtifacts(cosmos: string, environment: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  const configured = environment.COSMOS_RELEASE_STORE
  if (!configured) return []
  const root = resolve(cosmos, configured)
  const status = await lstat(root)
  if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Configured installed release root is not a real directory")
  const library = await import(Bun.resolveSync("@metafor/tech-release/installed", cosmos)) as typeof import("../../../../tech/release/installed")
  const store = library.createInstalledReleaseStore({root})
  const active = await store.readActive()
  const candidates = active ? [active] : []
  const configuredDigest = environment.COSMOS_RELEASE_DIGEST
  if (configuredDigest && configuredDigest !== active?.digest) {
    const selected = await store.readCandidate(configuredDigest)
    if (!selected) throw new Error("Configured installed release candidate is unavailable")
    candidates.push(selected)
  }
  if (!candidates.length) throw new Error("Configured installed release has no selected candidate")
  const artifacts: string[] = []
  for (const candidate of candidates) {
    const member = candidate.graph.packages.find(member => member.name === "@cosmos/release")
    const output = member?.environments.find(part => part.env === "server")?.outputs.find(output => output.artifact === "." && output.kind === "entry-point")
    if (!member || !output || !/^\d+\.\d+\.\d+$/.test(member.version)) throw new Error("Configured installed release has no stable server entry")
    artifacts.push(await store.artifactPath(candidate.digest, {name: member.name, env: "server", artifact: ".", version: member.version, sha256: output.sha256, size: output.size}))
  }
  return [...new Set(artifacts)]
}

if (import.meta.main) {
  try {
    for (const artifact of await configuredInstalledReleaseArtifacts(process.argv[2] ?? process.cwd(), Bun.env)) console.log(artifact)
  } catch {
    console.error("Configured installed release identity is unavailable")
    process.exitCode = 1
  }
}
