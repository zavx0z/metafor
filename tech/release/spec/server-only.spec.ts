import {expect, test} from "bun:test"
import {mkdtemp, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createPackageBuilder} from "@metafor/tech-build"
import {createPublishedReleaseSource, createRelease, readPublishedReleaseGraph, validateBrowserReleaseEnvironments} from "../index"
import {createInstalledReleaseStore} from "../installed"

test("source publication принимает все Bun environments server-only package и сохраняет пустую browser projection", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "release-server-only-")))
  const name = "@fixture/server-only"
  const packageRoot = join(root, "package")
  try {
    await Bun.write(join(root, "package.json"), JSON.stringify({dependencies: {[name]: "workspace:^1.0.0"}}))
    await Bun.write(join(packageRoot, "package.json"), JSON.stringify({
      name, version: "1.0.0", type: "module", dependencies: {},
      exports: {".": {"fixture:server": "./server/index.ts", "fixture:server-worker": "./server-worker/index.ts"}},
      scripts: {
        typecheck: "bun ./check.ts",
        "build:server": "bun build ./server/index.ts --conditions=fixture:server --target=bun --production --minify --drop console.debug --outfile=dist/server.js",
        "build:server-worker": "bun build ./server-worker/index.ts --conditions=fixture:server-worker --target=bun --production --minify --drop console.debug --outfile=dist/server-worker.js",
      },
    }))
    await Bun.write(join(packageRoot, "check.ts"), "export {}\n")
    for (const env of ["server", "server-worker"])
      await Bun.write(join(packageRoot, env, "index.ts"), `export const environment=${JSON.stringify(env)};export const version=import.meta.env.COSMOS_PACKAGE_VERSION\n`)
    const builder = createPackageBuilder({resolvePackage: requested => {
      if (requested !== name) throw new Error("Unselected package")
      return packageRoot
    }})
    const builds: string[] = []
    const release = createRelease({root, isMember: selected => selected === name, builder: {
      ...builder,
      async buildPackage(selected, options) {
        builds.push(`${selected}:${options?.env}`)
        return await builder.buildPackage(selected, options)
      },
    }})
    await release.recoverPublication()
    expect(builds.sort()).toEqual([`${name}:server`, `${name}:server-worker`])
    const composition = await release.readReleaseComposition()
    expect(composition[0]!.owners.map(owner => owner.env).sort()).toEqual(["server", "server-worker"])
    expect(() => validateBrowserReleaseEnvironments(name, composition[0]!.owners)).toThrow("has no browser environment")
    expect(await release.releasedPackages()).toEqual([])
    expect(release.readDesiredBrowserArtifacts()).toEqual([])
    const graph = await readPublishedReleaseGraph(release)
    expect(graph.packages[0]!.environments.map(part => part.env)).toEqual(["server", "server-worker"])
    const receiver = createInstalledReleaseStore({root: join(root, "receiver")})
    const offer = await createPublishedReleaseSource(release)
    const candidate = await receiver.prepare(offer.graph, offer.artifacts, offer.digest)
    for (const part of graph.packages[0]!.environments) {
      const output = part.outputs.find(output => output.artifact === ".")!
      const artifact = await receiver.artifactPath(candidate.digest, {name, version: "1.0.0", env: part.env, artifact: ".", sha256: output.sha256, size: output.size})
      const runtime = await import(artifact)
      expect(runtime.environment).toBe(part.env)
      expect(runtime.version).toBe("1.0.0")
    }
    const published = await release.publishPackages([{name, change: "patch"}])
    expect(published.success).toBe(true)
    expect(published.results.map(result => [result.env, result.version]).sort()).toEqual([["server", "1.0.1"], ["server-worker", "1.0.1"]])
    expect(published.packages).toEqual([])
    expect((await release.readReleaseComposition())[0]!.version).toBe("1.0.1")
    expect(await release.releasedPackages()).toEqual([])
    expect(release.readDesiredBrowserArtifacts()).toEqual([])
    const before = builds.length
    await release.recoverPublication()
    expect(builds).toHaveLength(before)
  } finally {await rm(root, {recursive: true, force: true})}
})
