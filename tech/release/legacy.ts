import {join, dirname, extname, relative, resolve} from "node:path"
import {packageArtifact, type PackageBuildArtifact, type PackageOwner} from "@metafor/tech-build"
import {
  browserPackageArtifactUrl,
  parseBrowserPackageArtifactUrl,
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
      new Bun.Glob("**/*").scan({cwd: directory, dot: true, onlyFiles: true, absolute: true}),
    ).catch(() => [])) {
      if (path.endsWith(".map")) continue
      const local = relative(directory, path)
      const key = (generated ? `./.cosmos/${local}` : `./${dirname(local)}`) as PackageArtifactKey
      const artifact = await packageArtifact(path)
      if (!artifact) throw new Error(`Published artifact is empty: ${path}`)
      outputs.push({...artifact, artifact: key, kind: generated ? "chunk" : "copy", load: "lazy"})
    }
  }
  const savedCode = new Map<string, {source: string; imports: ReturnType<Bun.Transpiler["scan"]>["imports"]}>()
  for (const output of outputs) {
    const source = await Bun.file(output.path).text()
    const imports = output.type.includes("javascript") ? new Bun.Transpiler({loader: "js"}).scan(source).imports : []
    savedCode.set(output.path, {source, imports})
    for (const entry of imports) {
      if (!entry.path.startsWith("./") && !entry.path.startsWith("../")) continue
      const dependency = resolve(dirname(output.path), entry.path)
      if (!(await packageArtifact(dependency)))
        throw new Error(`Published artifact dependency is missing: ${name}:${owner.env}@${version} ${entry.path} from ${output.path}`)
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
    for (const {source, imports} of savedCode.values()) {
      const references = [...imports.map(({path}) => path), ...Array.from(source.matchAll(/(["'`])(\/@[^"'`\s]+)\1/g), (match) => match[2]!)]
      for (const reference of references) {
        const identity = parseBrowserPackageArtifactUrl(new URL(reference, "http://release.invalid"))
        if (identity?.name !== name || identity.env !== owner.env || identity.version !== version) continue
        if (!urls.has(reference))
          throw new Error(`Published artifact dependency is missing: ${name}:${owner.env}@${version} ${reference}`)
      }
    }
    const pending = [outputs[0]!]
    const visited = new Set<string>()
    while (pending.length) {
      const current = pending.pop()!
      if (visited.has(current.path)) continue
      visited.add(current.path)
      const {source, imports} = savedCode.get(current.path)!
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
  const publicArtifactExtensions = Object.fromEntries(outputs.filter((output) => output.kind !== "sourcemap" && output.artifact !== rootPackageArtifact && !output.artifact?.startsWith("./.cosmos/")).map((output) => [output.artifact!, extname(output.path)]))
  return {outputs, owner: {...owner, publicArtifactExtensions}}
}
