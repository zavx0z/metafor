import {join, dirname, relative} from "node:path"
import {packageArtifact, type PackageBuildArtifact, type PackageOwner} from "@metafor/tech-build"
import {
  browserPackageArtifactUrl,
  isBrowserPackageEnvironment,
  rootPackageArtifact,
  type PackageArtifactKey,
} from "@metafor/tech-build/identity"
import {resolveVersionedPackageArtifactPath, versionedPackageGraphDirectory} from "./artifact-path"

/** Принимает существующие immutable bytes старого формата без их пересборки. */
export async function readExistingVersion(name: string, owner: PackageOwner, version: string) {
  const rootPath = await resolveVersionedPackageArtifactPath(owner, version, rootPackageArtifact)
  const root = rootPath && (await packageArtifact(rootPath))
  if (!root) return null
  const outputs: PackageBuildArtifact[] = [
    {...root, artifact: rootPackageArtifact, kind: "entry-point", load: "eager"},
  ]
  const graph = versionedPackageGraphDirectory(owner, version)
  const publicRoot = join(dirname(dirname(graph)), ".public", owner.env)
  for (const [directory, generated] of [
    [graph, true],
    [publicRoot, false],
  ] as const) {
    for (const path of await Array.fromAsync(
      new Bun.Glob("**/*").scan({cwd: directory, onlyFiles: true, absolute: true}),
    ).catch(() => [])) {
      if (path.endsWith(".map")) continue
      const local = relative(directory, path)
      const key = (generated ? `./.cosmos/${local}` : `./${dirname(local)}`) as PackageArtifactKey
      const artifact = await packageArtifact(path)
      if (!artifact) throw new Error(`Published artifact is empty: ${path}`)
      outputs.push({...artifact, artifact: key, kind: generated ? "chunk" : "copy", load: "lazy"})
    }
  }
  // Читаем import edges из сохранённого кода; компиляция исходников не выполняется.
  if (isBrowserPackageEnvironment(owner.env)) {
    const urls = new Map(
      outputs.map((output) => [
        browserPackageArtifactUrl(name, owner.env as "main", output.artifact!, version),
        output,
      ]),
    )
    const pending = [outputs[0]!]
    const visited = new Set<string>()
    while (pending.length) {
      const current = pending.pop()!
      if (visited.has(current.path)) continue
      visited.add(current.path)
      const source = await Bun.file(current.path).text()
      const imports = current.type.includes("javascript")
        ? new Bun.Transpiler({loader: "js"}).scan(source).imports
        : []
      for (const [url, output] of urls) {
        const staticImport = imports.some(
          (entry) => entry.path === url && entry.kind !== "dynamic-import",
        )
        const resource = !output.type.includes("javascript") && source.includes(url)
        if (!staticImport && !resource) continue
        output.load = "eager"
        pending.push(output)
      }
    }
  }
  for (const output of [...outputs]) {
    const map = await packageArtifact(`${output.path}.map`)
    if (map)
      outputs.push({
        ...map,
        artifact: `./.cosmos/asset/maps/${Bun.hash(output.artifact!).toString(16)}.map`,
        kind: "sourcemap",
        sourceMapFor: output.artifact!,
      })
  }
  return outputs
}
