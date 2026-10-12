import {lstat, readFile, realpath} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"

export function metaPackageScope(name: string) {
  const match = /^(?:@([a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)$/i.exec(name)
  if (!match) throw new Error(`Invalid Meta package name ${name}`)
  return match[1] ?? match[2]!
}

// Native public server exports are selected before the compiler sees a source.
// No private-path or package-main fallback may turn a missing export into code.
export async function resolveMetaDependency(root: string, manifest: {name?: unknown; dependencies?: unknown}, specifier: string, env = "server"): Promise<string> {
  const segments = specifier.split("/")
  const count = specifier.startsWith("@") ? 2 : 1
  const name = segments.slice(0, count).join("/")
  metaPackageScope(name)
  if (/[\\:%?#*]/u.test(specifier) || segments.some(part => !part || part === "." || part === ".." || part === "node_modules"))
    throw new Error(`Invalid public dependency export reference: ${specifier}`)
  if (name === manifest.name || !Object.hasOwn(isObject(manifest.dependencies) ? manifest.dependencies : {}, name))
    throw new Error(`Serialized Meta import must name a direct runtime dependency: ${specifier}`)
  const directory = await dependencyDirectory(root, name)
  return await resolveServerExport(directory, specifier, env)
}

export async function dependencyDirectory(root: string, name: string): Promise<string> {
  let current = root
  let directory: string | undefined
  for (;;) {
    const candidate = join(current, "node_modules", name)
    try { directory = await realpath(candidate); break }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error }
    const parent = dirname(current)
    if (parent === current) throw Object.assign(new Error(`Cannot resolve public export of direct dependency: ${name}`), {code: "MODULE_NOT_FOUND"})
    current = parent
  }
  return directory
}

export async function resolveServerExport(directory: string, specifier: string, env = "server"): Promise<string> {
  const segments = specifier.split("/")
  const count = specifier.startsWith("@") ? 2 : 1
  const name = segments.slice(0, count).join("/")
  const dependency = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {name?: unknown; exports?: unknown}
  if (dependency.name !== name) throw new Error(`Dependency export owner differs: ${specifier}`)
  const key = segments.length === count ? "." : `./${segments.slice(count).join("/")}`
  const exports = dependency.exports
  let target: unknown
  if (typeof exports === "string" || (isObject(exports) && !Object.keys(exports).some(key => key.startsWith(".")))) {
    if (key === ".") target = exports
  } else if (isObject(exports)) {
    if (Object.hasOwn(exports, key)) target = exports[key]
    else {
      const patterns = Object.keys(exports).filter(pattern => pattern.includes("*") && pattern.split("*").length === 2)
        .sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length)
      for (const pattern of patterns) {
        const [prefix, suffix] = pattern.split("*") as [string, string]
        if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length < prefix.length + suffix.length) continue
        const replacement = key.slice(prefix.length, key.length - suffix.length)
        target = substitute(exports[pattern], replacement)
        break
      }
    }
  }
  target = select(target, `${metaPackageScope(name)}:${env}`)
  if (typeof target !== "string" || !target.startsWith("./")) throw new Error(`Missing public ${env} export of direct dependency: ${specifier}`)
  if (target.includes("\\") || target.includes("%") || target.slice(2).split("/").some(part => !part || part === "." || part === ".." || part === "node_modules"))
    throw new Error(`Dependency public export escapes package root: ${specifier}`)
  const path = await realpath(resolve(directory, target))
  const suffix = relative(directory, path)
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix) || !(await lstat(path)).isFile())
    throw new Error(`Dependency public export escapes package root: ${specifier}`)
  return path
}

function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) }
function select(value: unknown, condition: string): unknown {
  if (!isObject(value)) return value
  // Preserve native declaration order among conditions supported by a Bun ESM server.
  for (const [key, target] of Object.entries(value)) if ([condition, "bun", "node", "import", "default"].includes(key)) {
    const selected = select(target, condition)
    if (selected !== undefined) return selected
  }
}
function substitute(value: unknown, replacement: string): unknown {
  if (typeof value === "string") return value.replaceAll("*", replacement)
  if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, target]) => [key, substitute(target, replacement)]))
  return value
}
