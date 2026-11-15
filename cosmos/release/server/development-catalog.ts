import {createHash} from "node:crypto"
import {lstat, realpath} from "node:fs/promises"
import {join, relative, resolve, sep} from "node:path"
import readManifest from "@zavx0z/storybook-package-manifest"
import collectMetadata from "@zavx0z/storybook-package-metadata-collect"
import createGraph from "@zavx0z/storybook-package-graph-create"
import {DEVELOPMENT_SCHEMA, type DevelopmentCatalog, type DevelopmentDependencyKind, type DevelopmentPackage, type DevelopmentSourceNode, type DevelopmentWorkspaceAssignment} from "../shared/development"

const kinds: readonly DevelopmentDependencyKind[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
const address = (name: string) => `/cosmos/package/${encodeURIComponent(name)}`

/** Public MetadataCollect → GraphCreate: физическая структура и TSDoc без исполнения сценариев и назначения Archetype. */
export async function createDevelopmentCatalog(assignment: DevelopmentWorkspaceAssignment) {
  const packages = new Map<string, DevelopmentPackage>()
  const sources = new Map<string, {directory: string, manifest: Awaited<ReturnType<typeof readManifest>>}>()
  const dependencies: DevelopmentCatalog["dependencies"][number][] = []
  for (const owner of assignment.roots) {
    const root = await realpath(owner.directory)
    if (root !== resolve(owner.directory)) throw new Error("Development assignment requires exact canonical source roots")
    const manifest = await readManifest({path: join(root, "package.json")})
    if (manifest.name !== owner.name) throw new Error("Assigned source owner manifest identity changed")
  }
  const metadata = await collectMetadata(assignment.roots.map(owner => owner.directory), undefined, {analysis: "structure"})
  const graph = createGraph(metadata)
  const graphNodes = new Map(graph.nodes.map(node => [node.id, node]))
  const parentPackage = (id: string | null): string | null => {
    while (id !== null) {
      const node = graphNodes.get(id)
      if (!node) throw new Error("Development structural parent is unavailable")
      if (node.kind === "package") return node.packageId
      id = node.parentId
    }
    return null
  }
  for (const scope of metadata.scopes) {
    if (scope.kind !== "package") throw new Error("Development package structure is unavailable")
    const directory = scope.scopeRoot
    const owners = assignment.roots.filter(owner => directory === owner.directory || directory.startsWith(owner.directory + sep))
    const owner = owners.sort((left, right) => right.directory.length - left.directory.length)[0]
    if (!owner) throw new Error("Discovered package is outside the trusted development assignment")
    const path = join(directory, "package.json"), info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error("Invalid development package manifest")
    const manifest = await readManifest({path})
    if (sources.has(manifest.name) || manifest.name !== scope.packageName) throw new Error("Development package identity changed")
    sources.set(manifest.name, {directory, manifest})
    packages.set(manifest.name, {name: manifest.name, label: manifest.label ?? manifest.name, address: address(manifest.name),
      owner: owner.name, ownerName: parentPackage(graphNodes.get(scope.canonicalId)!.parentId), resolution: "source", writable: owner.writable})
  }
  if (!sources.has(assignment.rootPackage)) throw new Error("Development root package is not assigned")
  for (const [from, {manifest}] of sources) for (const kind of kinds) {
    for (const [to, range] of Object.entries(manifest[kind] ?? {})) {
      dependencies.push({from, to, kind, range})
      if (!packages.has(to)) packages.set(to, {name: to, label: to, address: address(to), owner: null, ownerName: null, resolution: "external", writable: false})
    }
  }
  const nodes: DevelopmentSourceNode[] = graph.nodes.flatMap(node => {
    if (node.kind === "unavailable" || node.packageId === null) return []
    const own = sources.get(node.packageId)
    if (!own) throw new Error("Development node has no assigned package")
    const sourcePath = relative(own.directory, node.source.path).split(sep).join("/") || "."
    if (sourcePath === ".." || sourcePath.startsWith("../")) throw new Error("Development node escapes its package")
    return [{id: node.id, kind: node.kind, packageName: node.packageId, label: node.label, parentId: node.parentId,
      childIds: node.childIds, routePath: node.routePath ?? "", sourcePath,
      ...(node.entryConditions ? {entryConditions: node.entryConditions} : {})}]
  })
  const data = {schema: DEVELOPMENT_SCHEMA, workspaceId: assignment.id, rootPackage: assignment.rootPackage,
    packages: [...packages.values()], dependencies, nodes}
  const snapshot: DevelopmentCatalog = {...data, revision: createHash("sha256").update(JSON.stringify(data)).digest("hex")}
  const source = (name: string) => {
    const value = sources.get(name), entry = packages.get(name)
    if (!value || !entry) throw new Error("Package source is outside the trusted development assignment")
    return {...entry, directory: value.directory}
  }
  return {snapshot, source, contentNode(name: string, id = `package:${name}`) {
    const own = source(name), node = nodes.find(node => node.id === id && node.packageName === name)
    if (!node) throw new Error("Development content is outside the selected package")
    return {source: own, node, metadata: graphNodes.get(node.id)!, manifest: sources.get(name)!.manifest}
  }, subject(path: string) {
    const entry = snapshot.packages.find(entry => entry.address === path && entry.resolution === "source")
    if (!entry) throw new Error("Development subject is outside the trusted catalog")
    return source(entry.name)
  }}
}
