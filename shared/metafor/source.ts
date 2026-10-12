/**
Server-only adapter связывает [имя Meta-пакета](../../docs/META_PACKAGES.md)
с доступным кодом. Source discovery читает только manifest и presence entry;
installed mode использует исключительно предоставленный storage root/map.
Ни один режим не исполняет декларацию и не загружает отсутствующие пакеты.
[Проверки](./source.spec.ts) фиксируют identity и файловые границы.
@packageDocumentation
*/
import {existsSync, lstatSync, readFileSync, readdirSync} from "node:fs"
import {basename, dirname, isAbsolute, relative, resolve, sep} from "node:path"
import {isMetaPackageName} from "@metafor/types/metafor/graph"

/** Identity новых Meta совпадает с package.json#name, включая scope. */
export const canonicalMetaSource = (address: string): boolean => isMetaPackageName(address)
const legacyAddress = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface MetaSourceLocation {
  readonly address: string
  readonly directory: string
  readonly metaPath: string
}

export interface MetaArtifactLocation {
  readonly directory: string
  readonly entry?: string
}

/** Source root — каталог доступных packages; installed root — отдельный storage. */
export interface MetaSourceResolverOptions {
  readonly root: string
  readonly installed?: boolean
  readonly artifacts?: Readonly<Record<string, MetaArtifactLocation>>
}

export interface MetaSourceResolver {
  readonly root: string
  readonly installed: boolean
  discover(): readonly MetaSourceLocation[]
  resolveDirectory(address: string): string
  resolveMetaPath(address: string): string
}

type Manifest = {name?: unknown, workspaces?: unknown, exports?: unknown, dependencies?: unknown, devDependencies?: unknown, optionalDependencies?: unknown}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const assertAddress = (address: string, legacy = false) => {
  if (!canonicalMetaSource(address) && !(legacy && legacyAddress.test(address))) throw new Error(`Неканонический WIMP src: ${address}. Ожидается имя package.json#name`)
}

const safe = (root: string, path: string, allowRoot = false): string => {
  const suffix = relative(root, path)
  if ((!suffix && !allowRoot) || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error("Meta path escapes supplied root")
  let current = root
  if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Meta root must not be a symlink")
  for (const part of suffix ? suffix.split(sep) : []) {
    current = resolve(current, part)
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Meta path must not contain symlinks")
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
  }
  return path
}
const manifestAt = (directory: string): Manifest | undefined => {
  const path = safe(directory, resolve(directory, "package.json"))
  if (!existsSync(path)) return
  if (!lstatSync(path).isFile()) throw new Error("Invalid Meta package manifest")
  const value: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!object(value)) throw new Error("Invalid Meta package manifest")
  return value
}
const entryAt = (directory: string, manifest: Manifest, exact?: string): string | undefined => {
  let entry: unknown = exact
  if (entry === undefined && object(manifest.exports) && Object.hasOwn(manifest.exports, "./meta")) {
    entry = manifest.exports["./meta"]
    if (object(entry)) entry = entry.bun ?? entry.node ?? entry.default
    if (typeof entry !== "string" || !entry.startsWith("./")) throw new Error("Invalid Meta package ./meta export")
  }
  entry ??= "meta.ts"
  const path = safe(directory, resolve(directory, entry as string))
  if (!existsSync(path)) {
    if (exact !== undefined || entry !== "meta.ts") throw new Error("Meta package entry is missing")
    return
  }
  if (!lstatSync(path).isFile()) throw new Error("Meta package entry must be a regular file")
  return path
}
const workspacePatterns = (manifest: Manifest): readonly string[] => {
  const value = object(manifest.workspaces) ? manifest.workspaces.packages : manifest.workspaces
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(pattern => typeof pattern === "string" && pattern && !isAbsolute(pattern) && !pattern.split(/[\\/]/).includes(".."))) throw new Error("Invalid Meta workspace pattern")
  return value
}

function sourceResolver(root: string, exact?: {directory: string, path: string}): MetaSourceResolver {
  const catalog = () => {
    const found = new Map<string, MetaSourceLocation>()
    const packages = new Map<string, Manifest>()
    const add = (directory: string, exactPath?: string) => {
      if (packages.has(directory)) return
      const manifest = manifestAt(directory)
      if (!manifest) {
        if (exactPath) throw new Error("Root Meta has no owning package.json")
        return
      }
      packages.set(directory, manifest)
      const metaPath = entryAt(directory, manifest, exactPath)
      if (metaPath) {
        if (!isMetaPackageName(manifest.name)) throw new Error("Meta package requires a valid package.json#name")
        const address = manifest.name as string
        const previous = found.get(address)
        if (previous && previous.directory !== directory) throw new Error(`Duplicate Meta source identity: ${address}`)
        found.set(address, {address, directory, metaPath})
      }
      for (const pattern of workspacePatterns(manifest)) {
        for (const match of new Bun.Glob(pattern).scanSync({cwd: directory, onlyFiles: false, followSymlinks: false})) {
          const child = safe(directory, resolve(directory, match))
          if (lstatSync(child).isDirectory()) add(child)
        }
      }
    }
    if (exact) add(exact.directory, exact.path)
    if (existsSync(resolve(root, "package.json"))) add(root)
    for (const entry of readdirSync(root, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== "node_modules" && !entry.name.startsWith(".")) add(safe(root, resolve(root, entry.name)))
    }
    return {found, packages}
  }
  const discover = (): readonly MetaSourceLocation[] => [...catalog().found.values()].sort((a, b) => a.address.localeCompare(b.address))
  const location = (address: string): MetaSourceLocation => {
    assertAddress(address)
    const {found, packages} = catalog()
    const value = found.get(address)
    if (value) return value
    // Only a requested, declared dependency is inspected; discovery never walks node_modules.
    const candidates = new Map<string, MetaSourceLocation>()
    for (const [directory, manifest] of packages) {
      const declared = [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies].some(dependencies => object(dependencies) && Object.hasOwn(dependencies, address))
      if (!declared) continue
      let current = directory
      while (true) {
        const candidate = resolve(current, "node_modules", address)
        if (existsSync(candidate)) {
          if (lstatSync(candidate).isSymbolicLink()) throw new Error(`Meta dependency link is not a registered workspace package: ${address}`)
          safe(resolve(current, "node_modules"), candidate)
          const dependency = manifestAt(candidate)
          if (dependency?.name !== address) throw new Error(`Meta dependency identity differs: ${address}`)
          const metaPath = entryAt(candidate, dependency)
          if (metaPath) candidates.set(candidate, {address, directory: candidate, metaPath})
          break
        }
        const parent = dirname(current)
        if (parent === current) break
        current = parent
      }
    }
    if (candidates.size > 1) throw new Error(`Duplicate Meta source identity: ${address}`)
    const dependency = [...candidates.values()][0]
    if (!dependency) throw new Error(`Meta source package is not available: ${address}`)
    return dependency
  }
  return Object.freeze({root, installed: false, discover, resolveDirectory: (address: string) => location(address).directory, resolveMetaPath: (address: string) => location(address).metaPath})
}

/**
Создаёт lazy source catalog либо чистый installed adapter. Discovery включает
пакеты непосредственных соседей и их declared workspaces, не произвольное дерево.
Installed map сохраняет точные package names и допускает прежние safe owner/repo
ключи только для чтения уже сохранённых artifacts, без source fallback.
*/
export function createMetaSourceResolver(options: MetaSourceResolverOptions): MetaSourceResolver {
  const root = resolve(options.root)
  const installed = options.installed === true || options.artifacts !== undefined
  if (!installed) return sourceResolver(root)
  const artifacts = options.artifacts === undefined ? undefined : Object.freeze(Object.fromEntries(Object.entries(options.artifacts).map(([address, location]) => [address, Object.freeze({...location})])))
  if (artifacts) for (const [address, location] of Object.entries(artifacts)) {
    assertAddress(address, true)
    if (!location || typeof location.directory !== "string" || !location.directory || (location.entry !== undefined && (typeof location.entry !== "string" || !location.entry))) throw new Error("Invalid installed Meta artifact location")
  }
  const resolveDirectory = (address: string): string => {
    assertAddress(address, artifacts !== undefined)
    const selected = artifacts ? artifacts[address] : address
    if (selected === undefined) throw new Error(`Meta artifact is not installed: ${address}`)
    return safe(root, resolve(root, typeof selected === "string" ? selected : selected.directory), true)
  }
  const resolveMetaPath = (address: string) => {
    const directory = resolveDirectory(address)
    const path = resolve(directory, artifacts?.[address]?.entry ?? "meta.ts")
    const suffix = relative(directory, path)
    if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw new Error("Meta entry escapes artifact directory")
    return safe(root, path)
  }
  const discover = () => {
    if (!artifacts) throw new Error("Installed discovery requires an explicit artifact mapping")
    return Object.keys(artifacts).sort().map(address => ({address, directory: resolveDirectory(address), metaPath: resolveMetaPath(address)}))
  }
  return Object.freeze({root, installed, discover, resolveDirectory, resolveMetaPath})
}

/**
Разрешает явно выбранный root meta.ts по ближайшему package.json. Чтение начинается
только при вызове; Boundary restore не требует вызова или наличия этого файла.
Resolver сохраняет exact root entry и доступные sibling/workspace package names.
*/
export function resolveRootMetaSource(path: string): {source: string, resolver: MetaSourceResolver} {
  const selected = resolve(path)
  if (!existsSync(selected) || lstatSync(selected).isSymbolicLink()) throw new Error("Root Meta path is missing or unsafe")
  const metaPath = lstatSync(selected).isDirectory() ? resolve(selected, "meta.ts") : selected
  if (basename(metaPath) !== "meta.ts") throw new Error("Root Meta must select meta.ts or its containing directory")
  let directory = dirname(metaPath)
  while (!existsSync(resolve(directory, "package.json"))) {
    const parent = dirname(directory)
    if (parent === directory) throw new Error("Root Meta has no owning package.json")
    directory = parent
  }
  const manifest = manifestAt(directory)!
  if (!isMetaPackageName(manifest.name)) throw new Error("Meta package requires a valid package.json#name")
  safe(directory, metaPath)
  entryAt(directory, manifest, metaPath)
  // An enclosing workspace owner defines the sibling catalog, not the package's nesting depth.
  let owner = directory
  let parent = dirname(directory)
  while (parent !== dirname(parent)) {
    const outer = existsSync(resolve(parent, "package.json")) ? manifestAt(parent) : undefined
    if (outer && workspacePatterns(outer).some(pattern => [...new Bun.Glob(pattern).scanSync({cwd: parent, onlyFiles: false, followSymlinks: false})].some(match => resolve(parent, match) === owner || resolve(parent, match) === directory))) owner = parent
    parent = dirname(parent)
  }
  const resolver = sourceResolver(dirname(owner), {directory, path: metaPath})
  resolver.discover()
  return {source: manifest.name as string, resolver}
}

/**
Environment задаёт source catalog, explicit root meta.ts либо installed root/map.
Installed code никогда не ищет source replacement; map file/inline взаимоисключены
и ограничены 1 MiB. Root source не читается до обращения к этому adapter.
*/
export function defaultMetaSourceResolver(): MetaSourceResolver {
  const source = process.env.METAFOR_META_SOURCE_ROOT
  const rootMeta = process.env.METAFOR_ROOT_META
  const installed = process.env.METAFOR_META_ARTIFACT_ROOT
  const mapFile = process.env.METAFOR_META_ARTIFACT_MAP_FILE
  const inline = process.env.METAFOR_META_ARTIFACT_MAP
  if ((source || rootMeta) && installed) throw new Error("Meta source and artifact roots are mutually exclusive")
  if ((mapFile || inline) && !installed) throw new Error("Meta artifact mapping requires installed root")
  if (mapFile && inline) throw new Error("Meta artifact map file and inline map are mutually exclusive")
  let raw = inline
  if (mapFile) {
    const stat = lstatSync(mapFile)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("Invalid Meta artifact map file")
    raw = readFileSync(mapFile, "utf8")
  }
  let artifacts: Readonly<Record<string, MetaArtifactLocation>> | undefined
  if (raw !== undefined) {
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error("Meta artifact map exceeds size limit")
    const value: unknown = JSON.parse(raw)
    if (!object(value)) throw new Error("Meta artifact mapping must be an object")
    artifacts = value as Readonly<Record<string, MetaArtifactLocation>>
  }
  if (rootMeta) return resolveRootMetaSource(rootMeta).resolver
  return createMetaSourceResolver({root: installed ?? source ?? resolve(import.meta.dir, "../../.."), installed: Boolean(installed), ...(artifacts === undefined ? {} : {artifacts})})
}
