import {builtinModules} from "node:module"
import {readFile, realpath} from "node:fs/promises"
import {dirname, join} from "node:path"
import {dependencyDirectory, metaPackageScope, resolveServerExport} from "./meta-imports"

/** Build-only public condition selection follows each importing package owner. */
export function serverConditionPlugin(env: string, external: readonly string[] = []): Bun.BunPlugin {
  const manifests = new Map<string, Promise<Record<string, unknown>>>()
  const owners = new Map<string, Promise<{root: string; manifest: Record<string, unknown>} | undefined>>()
  const manifest = (root: string) => {
    let value = manifests.get(root)
    if (!value) {
      value = readFile(join(root, "package.json"), "utf8").then(bytes => JSON.parse(bytes))
      manifests.set(root, value)
    }
    return value
  }
  const owner = (file: string) => {
    let value = owners.get(file)
    if (!value) {
      value = (async () => {
        let root = dirname(file)
        for (;;) {
          try { return {root, manifest: await manifest(root)} }
          catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error }
          const parent = dirname(root)
          if (parent === root) return undefined
          root = parent
        }
      })()
      owners.set(file, value)
    }
    return value
  }
  return {name: "package-server-conditions", setup(build) {
    build.onResolve({filter: /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/.*)?$/i}, async args => {
      if (!args.importer || args.path === "bun" || builtinModules.includes(args.path) || external.some(pattern => matchesExternal(pattern, args.path))) return
      const importing = await owner(args.importer)
      if (!importing) return
      const segments = args.path.split("/")
      const name = segments.slice(0, args.path.startsWith("@") ? 2 : 1).join("/")
      const self = importing.manifest.name === name
      const dependencies = importing.manifest.dependencies
      const declared = !!dependencies && typeof dependencies === "object" && Object.hasOwn(dependencies, name)
      // Non-package aliases and optional/native imports remain Bun's job.
      // This resolver only supplies an owner's explicitly declared custom part.
      if (!self && !declared) return
      const directory = self ? await realpath(importing.root) : await dependencyDirectory(importing.root, name).catch(error => {
        if (error.code === "MODULE_NOT_FOUND") return undefined
        throw error
      })
      if (!directory) return
      const dependency = await manifest(directory)
      if (!hasCondition(dependency.exports, `${metaPackageScope(name)}:${env}`)) return
      return {path: await resolveServerExport(directory, args.path, env)}
    })
  }}
}

function hasCondition(value: unknown, condition: string): boolean {
  if (!value || typeof value !== "object") return false
  return Object.entries(value).some(([key, target]) => key === condition || hasCondition(target, condition))
}

function matchesExternal(pattern: string, path: string) {
  if (!pattern.includes("*")) return path === pattern || path.startsWith(`${pattern}/`)
  const expression = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")
  return new RegExp(`^${expression}$`).test(path)
}
