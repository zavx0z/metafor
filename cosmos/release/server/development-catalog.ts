import {createHash} from "node:crypto"
import {lstat, realpath} from "node:fs/promises"
import {join, resolve} from "node:path"
import readManifest from "@zavx0z/storybook-package-package-json"
import readWorkspaces from "@zavx0z/storybook-package-route-workspaces"
import {DEVELOPMENT_SCHEMA, type DevelopmentCatalog, type DevelopmentDependencyKind, type DevelopmentPackage, type DevelopmentWorkspaceAssignment} from "../shared/development"

const kinds: readonly DevelopmentDependencyKind[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
const address = (name: string) => `/cosmos/package/${encodeURIComponent(name)}`

/** Только manifest/workspaces, без исполнения сценариев или навязывания Archetype. */
export async function createDevelopmentCatalog(assignment: DevelopmentWorkspaceAssignment) {
  const packages = new Map<string, DevelopmentPackage>()
  const sources = new Map<string, {directory: string, manifest: Awaited<ReturnType<typeof readManifest>>}>()
  const dependencies: DevelopmentCatalog["dependencies"][number][] = []
  for (const owner of assignment.roots) {
    const root = await realpath(owner.directory)
    if (root !== resolve(owner.directory)) throw new Error("Development assignment requires exact canonical source roots")
    const read = async (directory: string) => {
      const path = join(directory, "package.json"), info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error("Invalid development package manifest")
      const manifest = await readManifest({path})
      if (sources.has(manifest.name)) throw new Error(`Duplicate development package identity: ${manifest.name}`)
      sources.set(manifest.name, {directory, manifest})
      packages.set(manifest.name, {name: manifest.name, label: manifest.label ?? manifest.name, address: address(manifest.name),
        owner: owner.name, resolution: "source", writable: owner.writable})
      return manifest
    }
    const manifest = await read(root)
    if (manifest.name !== owner.name) throw new Error("Assigned source owner manifest identity changed")
    if (manifest.workspaces !== undefined) {
      const workspace = await readWorkspaces({root, value: manifest.workspaces})
      for (const directory of workspace.roots) await read(directory)
    }
  }
  if (!sources.has(assignment.rootPackage)) throw new Error("Development root package is not assigned")
  for (const [from, {manifest}] of sources) for (const kind of kinds) {
    for (const [to, range] of Object.entries(manifest[kind] ?? {})) {
      dependencies.push({from, to, kind, range})
      if (!packages.has(to)) packages.set(to, {name: to, label: to, address: address(to), owner: null, resolution: "external", writable: false})
    }
  }
  const data = {schema: DEVELOPMENT_SCHEMA, workspaceId: assignment.id, rootPackage: assignment.rootPackage,
    packages: [...packages.values()], dependencies}
  const snapshot: DevelopmentCatalog = {...data, revision: createHash("sha256").update(JSON.stringify(data)).digest("hex")}
  const source = (name: string) => {
    const value = sources.get(name), entry = packages.get(name)
    if (!value || !entry) throw new Error("Package source is outside the trusted development assignment")
    return {...entry, directory: value.directory}
  }
  return {snapshot, source, subject(path: string) {
    const entry = snapshot.packages.find(entry => entry.address === path && entry.resolution === "source")
    if (!entry) throw new Error("Development subject is outside the trusted catalog")
    return source(entry.name)
  }}
}
