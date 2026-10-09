import {copyFile, link, mkdir, mkdtemp, realpath, rename, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  createPackageBuilder,
  packageArtifact,
  type PackageBuildArtifact,
  type PackageOwner,
  type PackageManifest,
} from "@metafor/tech-build"
import {type PackageEnvironment, type PackageArtifactKey} from "@metafor/tech-build/identity"
import {
  createRelease,
  versionedPackageArtifactPath,
  type PackageChange,
} from "@metafor/tech-release"
import {createReleaseStorage} from "../storage"

export interface SnapshotArtifact {
  name: string
  version: string
  env: PackageEnvironment
  artifact: PackageArtifactKey
  bytes: string
  sha256: string
  size: number
}
export interface ReleaseSnapshot {
  current: Record<string, string> | null
  rootIntent: Record<string, string>
  childVersions: Record<string, string>
  dependencies: Record<string, Record<string, string>>
  published: SnapshotArtifact[]
  prepared: SnapshotArtifact[]
  storageCopies?: SnapshotArtifact[]
  maps?: Array<
    Omit<SnapshotArtifact, "artifact" | "sha256" | "size"> & {sourceMapFor: PackageArtifactKey}
  >
  sourceChanges?: Record<string, string>
  requestedProfile?: "production" | "development"
  buildResults?: Array<{name: string; success: boolean; exitCode?: number; stderr?: string}>
  fault?: {operation: "write-child-manifest"; error: string; name?: string; persistent?: boolean}
  storageSupportsHardlinks?: boolean
  storageReceipts?: boolean
  receiptDamage?: Array<{name: string; version: string; env: PackageEnvironment; state: "missing" | "corrupt" | "incomplete"; artifact?: PackageArtifactKey}>
  files?: Record<string, string>
  manifestChanges?: Record<string, Partial<PackageManifest>>
  unverifiedReady?: Array<{name: string; version: string}>
  objectDamage?: Array<{sha256: string; bytes?: string}>
  request: {packages?: PackageChange[]; target?: Record<string, string>} | null
}

/** Материализует существующий JSON-пример в собственном временном каталоге. */
export async function releaseFixture(path: string, hooks: {
  beforeBuild?(name: string, env?: PackageEnvironment): Promise<void>
  beforeRename?(path: string): Promise<void>
  afterRename?(path: string): Promise<void>
} = {}) {
  const snapshot = (await Bun.file(path).json()) as ReleaseSnapshot
  const root = await realpath(await mkdtemp(join(tmpdir(), "tech-release-scenario-")))
  const packageRoot = (name: string) => join(root, "packages", name.split("/")[1]!)
  const builds: Array<{name: string; env?: PackageEnvironment}> = []
  const ioEvents: Array<{operation: string; path: string}> = []
  const buildSnapshots: Array<{name: string; env?: PackageEnvironment; root: unknown; children: Record<string, unknown>}> = []
  const manifestWrites: Array<{path: string; value: unknown}> = []
  let faultPending = true
  const io = {
    async copyFile(source: Parameters<typeof copyFile>[0], target: Parameters<typeof copyFile>[1], mode?: number) {
      ioEvents.push({operation: "copy", path: String(target)})
      await copyFile(source, target, mode)
    },
    async rename(source: Parameters<typeof rename>[0], target: Parameters<typeof rename>[1]) {
      const path = String(target)
      ioEvents.push({operation: "rename", path})
      if (snapshot.fault && (faultPending || snapshot.fault.persistent) && path.startsWith(join(root, "packages")) && path.endsWith("package.json") && (!snapshot.fault.name || path === join(packageRoot(snapshot.fault.name), "package.json"))) {
        faultPending = false
        const error = Object.assign(new Error(`${snapshot.fault.error}: write-child-manifest ${path}`), {code: snapshot.fault.error})
        throw error
      }
      await hooks.beforeRename?.(path)
      await rename(source, target)
      if (path.endsWith("package.json")) manifestWrites.push({path, value: await Bun.file(path).json()})
      await hooks.afterRename?.(path)
    },
    async link(source: Parameters<typeof link>[0], target: Parameters<typeof link>[1]) {
      ioEvents.push({operation: "link", path: String(target)})
      if (snapshot.storageSupportsHardlinks === false) throw Object.assign(new Error("EXDEV: hard links unsupported"), {code: "EXDEV"})
      await link(source, target)
    },
  }
  try {
    await Bun.write(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: Object.fromEntries(
          Object.entries(snapshot.rootIntent).map(([name, version]) => [
            name,
            `workspace:^${version}`,
          ]),
        ),
      }),
    )
    for (const [name, version] of Object.entries(snapshot.childVersions)) {
      const directory = packageRoot(name)
      const environments =
        name === "@example/host" ? ["main", "service", "server"] : ["main", "server"]
      const exports: Record<string, unknown> = {
        ".": Object.fromEntries(environments.map((env) => [`example:${env}`, `./${env}/index.ts`])),
      }
      if (name === "@example/view") {
        exports["./editor"] = {"example:main": "./main/editor.ts"}
        exports["./theme.css"] = {"example:main": "./theme.css"}
      }
      const scripts: Record<string, string> = {typecheck: "bun ./check.ts"}
      const failure = snapshot.buildResults?.find((result) => result.name === name && !result.success)
      await Bun.write(join(directory, "check.ts"), failure
        ? `console.error(${JSON.stringify(failure.stderr ?? "typecheck failed")})\nprocess.exit(${failure.exitCode ?? 1})\n`
        : "export {}\n")
      for (const env of environments) {
        scripts[`build:${env}`] =
          `bun build ./${env}/index.ts --conditions=example:${env} --target=${env === "server" ? "bun" : "browser"} --production --minify --drop console.debug ${name === "@example/view" && env === "main" ? `--outdir=dist/${env} --splitting` : `--outfile=dist/${env}.js`}`
        await Bun.write(
          join(directory, env, "index.ts"),
          `export const identity = ${JSON.stringify(`${name}:${env}`)}\n`,
        )
      }
      await Bun.write(join(directory, "main/editor.ts"), "export const editor = true\n")
      await Bun.write(join(directory, "theme.css"), ":root { --accent: #2478ff }\n")
      await Bun.write(
        join(directory, "package.json"),
        JSON.stringify({
          name,
          version: /^\d+\.\d+\.\d+$/.test(version) ? version : "1.0.0",
          type: "module",
          exports,
          scripts,
          dependencies: snapshot.dependencies[name],
        }),
      )
    }
    const builder = createPackageBuilder({
      resolvePackage: packageRoot,
      profile: snapshot.requestedProfile ?? "production",
    })
    const storage = createReleaseStorage(root, io)
    const groups = new Map<string, SnapshotArtifact[]>()
    for (const artifact of [
      ...snapshot.prepared,
      ...snapshot.published,
      ...(snapshot.storageCopies ?? []),
    ]) {
      const key = `${artifact.name}:${artifact.version}:${artifact.env}`
      const group = groups.get(key) ?? []
      if (!group.some(({artifact: key}) => key === artifact.artifact)) group.push(artifact)
      groups.set(key, group)
    }
    const owners = new Map<string, PackageOwner[]>()
    for (const name of Object.keys(snapshot.childVersions))
      owners.set(name, await builder.packageOwners(name))
    for (const group of groups.values()) {
      const first = group[0]!
      const packageOwners = owners.get(first.name)!
      const owner = packageOwners.find(({env}) => env === first.env)!
      const outputs: PackageBuildArtifact[] = []
      const sources: PackageBuildArtifact[] = []
      for (const artifact of group) {
        const staged = join(root, "staging", crypto.randomUUID())
        await Bun.write(staged, artifact.bytes)
        const bytes = (await packageArtifact(staged))!
        const output: PackageBuildArtifact = {
          ...bytes,
          sha256: artifact.sha256,
          size: artifact.size,
          artifact: artifact.artifact,
          path: versionedPackageArtifactPath(owner, first.version, artifact.artifact),
          kind:
            artifact.artifact === "."
              ? "entry-point"
              : artifact.artifact.endsWith(".css")
                ? "copy"
                : "chunk",
          load: artifact.artifact === "." || artifact.artifact.endsWith(".css") ? "eager" : "lazy",
        }
        outputs.push(output)
        sources.push({...output, ...bytes, path: staged})

      }
      for (const map of snapshot.maps ?? []) {
        if (map.name !== first.name || map.version !== first.version || map.env !== first.env)
          continue
        const path = `${versionedPackageArtifactPath(owner, first.version, map.sourceMapFor)}.map`
        await Bun.write(path, map.bytes)
        const bytes = (await packageArtifact(path))!
        const output: PackageBuildArtifact = {
          ...bytes,
          artifact: "./.cosmos/asset/root.js.map",
          kind: "sourcemap",
          sourceMapFor: map.sourceMapFor,
        }
        outputs.push(output)
        sources.push(output)
      }
      if (snapshot.storageReceipts !== false) await storage.save(
        {
          name: first.name,
          version: first.version,
          env: first.env,
          owner,
          environments: packageOwners.map(({env}) => env),
          dependencies: snapshot.dependencies[first.name]!,
          outputs,
        },
        sources,
      )
    }
    // Опубликованные байты независимы от сохранённого receipt и доверенной копии.
    for (const artifact of snapshot.published) {
      const owner = owners.get(artifact.name)!.find(({env}) => env === artifact.env)!
      const path = versionedPackageArtifactPath(owner, artifact.version, artifact.artifact)
      await mkdir(dirname(path), {recursive: true})
      await Bun.write(path, artifact.bytes)
    }
    for (const [name, version] of Object.entries(snapshot.current ?? {}))
      if (snapshot.storageReceipts !== false && /^\d+\.\d+\.\d+$/.test(version)) await storage.markReady(name, version)
    if (snapshot.storageReceipts === false) await rm(join(root, ".release"), {recursive: true, force: true})
    for (const {name, version} of snapshot.unverifiedReady ?? [])
      await Bun.write(join(root, ".release", "versions", encodeURIComponent(name), version, "ready"), "ready\n")
    for (const damage of snapshot.receiptDamage ?? []) {
      const path = join(root, ".release", "versions", encodeURIComponent(damage.name), damage.version, `${damage.env}.json`)
      if (damage.state === "missing") await rm(path, {force: true})
      else if (damage.state === "corrupt") await Bun.write(path, "{corrupted receipt")
      else {
        const record = await Bun.file(path).json()
        record.outputs = record.outputs.filter((output: PackageBuildArtifact) => output.artifact !== damage.artifact)
        await Bun.write(path, JSON.stringify(record))
      }
    }
    for (const damage of snapshot.objectDamage ?? []) {
      const path = join(root, ".release", "objects", damage.sha256)
      if (damage.bytes === undefined) await rm(path, {force: true})
      else await Bun.write(path, damage.bytes)
    }
    for (const [name, version] of Object.entries(snapshot.childVersions)) {
      const path = join(packageRoot(name), "package.json")
      const manifest = await Bun.file(path).json()
      await Bun.write(path, JSON.stringify({...manifest, version}))
    }
    for (const [path, source] of Object.entries(snapshot.sourceChanges ?? {})) {
      const [name, file] = path.split("/")
      await Bun.write(join(root, "packages", name!, file!.replace(/\.ts$/, "/index.ts")), source)
    }
    for (const [path, bytes] of Object.entries(snapshot.files ?? {}))
      await Bun.write(join(root, path), bytes)
    for (const [name, patch] of Object.entries(snapshot.manifestChanges ?? {})) {
      const path = join(packageRoot(name), "package.json")
      await Bun.write(path, JSON.stringify({...await Bun.file(path).json(), ...patch}))
    }
    const release = createRelease({
      root,
      io,
      isMember: (name) => name.startsWith("@example/"),
      builder: {
        ...builder,
        async buildPackage(name, options) {
          builds.push({name, ...(options?.env ? {env: options.env} : {})})
          ioEvents.push({operation: "build", path: name})
          buildSnapshots.push({name, ...(options?.env ? {env: options.env} : {}), root: await Bun.file(join(root, "package.json")).json(), children: Object.fromEntries(await Promise.all(Object.keys(snapshot.childVersions).map(async (child) => [child, await Bun.file(join(packageRoot(child), "package.json")).json()])))})
          await hooks.beforeBuild?.(name, options?.env)
          return await builder.buildPackage(name, options)
        },
      },
    })
    const publishedArtifacts = snapshot.published.map((artifact) => ({...artifact, path: versionedPackageArtifactPath(owners.get(artifact.name)!.find(({env}) => env === artifact.env)!, artifact.version, artifact.artifact)}))
    ioEvents.length = 0
    manifestWrites.length = 0
    return {
      root,
      release,
      snapshot,
      builds,
      ioEvents,
      manifestWrites,
      buildSnapshots,
      publishedArtifacts,
      storage,
      packageRoot,
      /** Устраняет исходную причину отказа, чтобы проверять повтор операции тем же выпуском. */
      async clearBuildFailures() {
        for (const result of snapshot.buildResults ?? [])
          if (!result.success) await Bun.write(join(packageRoot(result.name), "check.ts"), "export {}\n")
      },
      cleanup: () => rm(root, {recursive: true, force: true}),
    }
  } catch (error) {
    await rm(root, {recursive: true, force: true})
    throw error
  }
}
