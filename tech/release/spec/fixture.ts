import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  createPackageBuilder,
  packageArtifact,
  type PackageBuildArtifact,
  type PackageOwner,
} from "@metafor/tech-build"
import {type PackageEnvironment, type PackageArtifactKey} from "@metafor/tech-build/identity"
import {
  createRelease,
  versionedPackageArtifactPath,
  type PackageChange,
} from "@metafor/tech-release"
import {createReleaseStorage} from "../storage"

interface SnapshotArtifact {
  name: string
  version: string
  env: PackageEnvironment
  artifact: PackageArtifactKey
  bytes: string
  sha256: string
  size: number
}
interface ReleaseSnapshot {
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
  request: {packages?: PackageChange[]; target?: Record<string, string>} | null
}

/** Материализует существующий JSON-пример в собственном временном каталоге. */
export async function releaseFixture(path: string) {
  const snapshot = (await Bun.file(path).json()) as ReleaseSnapshot
  const root = await mkdtemp(join(tmpdir(), "tech-release-scenario-"))
  const packageRoot = (name: string) => join(root, "packages", name.split("/")[1]!)
  const builds: Array<{name: string; env?: PackageEnvironment}> = []
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
      await Bun.write(join(directory, "check.ts"), "export {}\n")
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
          version,
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
    const storage = createReleaseStorage(root)
    const groups = new Map<string, SnapshotArtifact[]>()
    for (const artifact of [
      ...snapshot.published,
      ...snapshot.prepared,
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
        sources.push({...output, path: staged})
        if (
          snapshot.published.some(
            (entry) =>
              entry.name === artifact.name &&
              entry.version === artifact.version &&
              entry.env === artifact.env &&
              entry.artifact === artifact.artifact,
          )
        ) {
          await mkdir(dirname(output.path), {recursive: true})
          await Bun.write(output.path, artifact.bytes)
        }
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
      await storage.save(
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
    for (const [name, version] of Object.entries(snapshot.current ?? {}))
      await storage.markReady(name, version)
    for (const [path, source] of Object.entries(snapshot.sourceChanges ?? {})) {
      const [name, file] = path.split("/")
      await Bun.write(join(root, "packages", name!, file!.replace(/\.ts$/, "/index.ts")), source)
    }
    const release = createRelease({
      root,
      isMember: (name) => name.startsWith("@example/"),
      builder: {
        ...builder,
        async buildPackage(name, options) {
          builds.push({name, ...(options?.env ? {env: options.env} : {})})
          return await builder.buildPackage(name, options)
        },
      },
    })
    return {
      root,
      release,
      snapshot,
      builds,
      cleanup: () => rm(root, {recursive: true, force: true}),
    }
  } catch (error) {
    await rm(root, {recursive: true, force: true})
    throw error
  }
}
