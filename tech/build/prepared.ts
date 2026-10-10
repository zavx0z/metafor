import {realpath} from "node:fs/promises"
import {isAbsolute, posix, relative, resolve} from "node:path"
import {createHash} from "node:crypto"
import type {PackageBuildReportImport, PackageOwner} from "./contracts"

/**
Готовый граф прямой зависимости, переданный политикой приложения сборщику.
Entries содержат public specifiers, files — package-relative пути и SHA-256
неизменяемых байтов. Root указывает каталог этих готовых файлов, не исходников.
Граф не является самостоятельным release membership или browser state.
*/
export interface PreparedPackageDependency {
  name: string
  version: string
  root: string
  entries: Readonly<Record<string, string>>
  files: readonly {path: string; digest: string}[]
}

/** Проверенный временный input isolated compiler; не сохраняется как release state. */
export interface PreparedDependencyGraph extends PreparedPackageDependency {
  identity: string
  files: readonly {path: string; digest: string; imports: readonly PackageBuildReportImport[]}[]
}

/** Проверяет bytes, public entry ownership и замкнутость ESM до запуска compiler. */
export async function preparePackageDependencies(
  owner: PackageOwner,
  dependencies: readonly PreparedPackageDependency[],
): Promise<PreparedDependencyGraph[]> {
  const manifest = await Bun.file(owner.manifest).json()
  const names = new Set<string>()
  return await Promise.all(dependencies.map(async dependency => {
    if (!Object.hasOwn(manifest.dependencies ?? {}, dependency.name) || names.has(dependency.name))
      throw new Error(`Prepared dependency must be one direct runtime dependency: ${dependency.name}`)
    names.add(dependency.name)
    if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(dependency.version))
      throw new Error(`Prepared dependency version is invalid: ${dependency.name}`)
    const range = manifest.dependencies[dependency.name]
    if (typeof range !== "string" || !Bun.semver.satisfies(dependency.version, range))
      throw new Error(`Prepared dependency version does not satisfy ${dependency.name}@${String(range)}`)
    const root = await realpath(dependency.root)
    const paths = new Set<string>()
    for (const file of dependency.files) {
      readyPath(file.path)
      if (paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.digest))
        throw new Error(`Prepared dependency file is invalid: ${file.path}`)
      paths.add(file.path)
    }
    if (paths.size === 0) throw new Error("Prepared dependency graph is empty")
    for (const [specifier, path] of Object.entries(dependency.entries)) {
      if (specifier !== dependency.name && !specifier.startsWith(`${dependency.name}/`))
        throw new Error(`Prepared entry belongs to another package: ${specifier}`)
      readyPath(path)
      if (!paths.has(path)) throw new Error(`Prepared entry is missing: ${specifier}`)
      if (!/\.[cm]?js$/.test(path)) throw new Error(`Prepared entry must be ready JavaScript: ${specifier}`)
    }
    if (Object.keys(dependency.entries).length === 0) throw new Error("Prepared dependency has no public entries")
    const files = await Promise.all(dependency.files.map(async file => {
      const source = await realpath(resolve(root, file.path))
      if (isAbsolute(relative(root, source)) || relative(root, source).startsWith(".."))
        throw new Error(`Prepared file escapes dependency root: ${file.path}`)
      const bytes = await Bun.file(source).arrayBuffer()
      if (digest(bytes) !== file.digest) throw new Error(`Prepared dependency digest differs: ${file.path}`)
      const imports: PackageBuildReportImport[] = []
      if (/\.[cm]?js$/.test(file.path)) {
        for (const imported of new Bun.Transpiler({loader: "js"}).scan(new TextDecoder().decode(bytes)).imports) {
          if (!imported.path.startsWith("./") && !imported.path.startsWith("../"))
            throw new Error(`Prepared dependency import is not closed: ${file.path} -> ${imported.path}`)
          const path = posix.normalize(posix.join(posix.dirname(file.path), imported.path))
          if (!paths.has(path)) throw new Error(`Prepared dependency import is missing: ${file.path} -> ${path}`)
          imports.push({path, kind: imported.kind, external: false})
        }
      }
      return {...file, imports}
    }))
    const identity = createHash("sha256").update(JSON.stringify([
      dependency.name, dependency.version, Object.entries(dependency.entries).sort(),
      files.map(({path, digest}) => [path, digest]).sort(),
    ])).digest("hex")
    return {...dependency, root, files, identity}
  }))
}

/** Общий путь готового graph внутри generated artifacts принимающего package. */
export function preparedFileRelative(graph: PreparedDependencyGraph, path: string) {
  return `chunk/${graph.identity}/${path}`
}

export function digest(bytes: ArrayBuffer) {
  return createHash("sha256").update(new Uint8Array(bytes)).digest("hex")
}

function readyPath(path: string) {
  if (typeof path !== "string" || path.split("/").some(segment =>
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment === ".." || segment === "." || segment === "node_modules"))
    throw new Error(`Prepared dependency path is invalid: ${path}`)
}
