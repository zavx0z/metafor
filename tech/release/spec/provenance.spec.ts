import {expect, test} from "bun:test"
import {mkdtemp, realpath, rename, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createPackageBuilder} from "@metafor/tech-build"
import {createRelease} from "../index"

async function fixture(provenance = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "release-provenance-")))
  const name = "@fixture/subject"
  const directory = join(root, "subject")
  const initialSource = "export const answer = 41; export const version = import.meta.env.COSMOS_PACKAGE_VERSION\n"
  await Bun.write(join(root, "package.json"), JSON.stringify({dependencies: {[name]: "workspace:^1.0.0"}}))
  await Bun.write(join(directory, "package.json"), JSON.stringify({name, version: "1.0.0", type: "module", dependencies: {},
    exports: {".": {"fixture:server": "./server/index.ts", "fixture:server-worker": "./server-worker/index.ts"}},
    scripts: {typecheck: "bun ./check.ts",
      "build:server": "bun build ./server/index.ts --conditions=fixture:server --target=bun --production --minify --drop console.debug --outfile=dist/server.js",
      "build:server-worker": "bun build ./server-worker/index.ts --conditions=fixture:server-worker --target=bun --production --minify --drop console.debug --outfile=dist/worker.js"}}))
  await Bun.write(join(directory, "server/index.ts"), initialSource)
  await Bun.write(join(directory, "server-worker/index.ts"), "export const worker = true\n")
  await Bun.write(join(directory, "check.ts"), "export {}\n")
  const calls: string[][] = []
  let failWorker = false
  let failManifest = false
  const spawn = ((command: string[], options: Parameters<typeof Bun.spawn>[1]) => {
    if (command.includes("build")) calls.push(command)
    if (failWorker && command.includes("--conditions=fixture:server-worker")) {
      failWorker = false
      return Bun.spawn([process.execPath, "-e", "process.exit(7)"], options)
    }
    return Bun.spawn(command, options)
  }) as typeof Bun.spawn
  const builder = createPackageBuilder({resolvePackage: selected => {
    if (selected !== name) throw new Error("Package is not assigned")
    return directory
  }, spawn, ...(provenance ? {provenance: {roots: [root], excludedDirectoryNames: ["dist", ".release"],
    excludedDirectoryNamePrefixes: [".package-update-", ".package-recovery-"]}} : {})})
  const release = createRelease({root, builder, isMember: selected => selected === name, io: {
    async rename(source, target) {
      if (failManifest && String(target) === join(directory, "package.json")) {
        failManifest = false
        throw new Error("Injected child manifest write failure")
      }
      await rename(source, target)
    },
  }})
  const changes = [{name, change: "patch" as const}]
  return {root, name, directory, initialSource, calls, builder, release, changes,
    failWorker() {failWorker = true},
    failManifest() {failManifest = true},
    cleanup() {return rm(root, {recursive: true, force: true})}}
}

test("guarded real publication retains partial effects, rejects changed-source reuse and resumes the same inputs", async () => {
  const f = await fixture()
  try {
    const source = await Bun.file(join(f.root, "package.json")).text()
    const plan = await f.release.planPublication(f.changes)
    expect(plan.packages[0]).toMatchObject({name: f.name, previousVersion: "1.0.0", version: "1.0.1"})
    expect(f.calls).toHaveLength(0)
    expect((await f.release.readPublicationEffects(plan)).packages[0]?.prepared).toEqual([])
    f.failWorker()
    const first = await f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await f.builder.sourceInventory()).sha256}})
    expect(first.success).toBe(false)
    expect(await Bun.file(join(f.root, "package.json")).text()).toBe(source)
    const partial = await f.release.readPublicationEffects(plan)
    expect(partial.root.matchesPlan).toBe(false)
    expect(partial.packages[0]).toMatchObject({childVersion: "1.0.0", ready: false})
    expect(partial.packages[0]?.prepared.map(item => item.env)).toEqual(["server"])
    expect(partial.packages[0]?.prepared[0]?.provenance?.targetVersion).toBe("1.0.1")
    const calls = f.calls.length
    await Bun.write(join(f.directory, "server/index.ts"), "export const answer = 99\n")
    await expect(f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await f.builder.sourceInventory()).sha256}})).rejects.toThrow("provenance")
    expect(f.calls).toHaveLength(calls)
    expect(await f.release.readPublicationEffects(plan)).toEqual(partial)
    expect(await Bun.file(join(f.root, "package.json")).text()).toBe(source)

    await Bun.write(join(f.directory, "server/index.ts"), f.initialSource)
    const complete = await f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await f.builder.sourceInventory()).sha256}})
    expect(complete.success).toBe(true)
    expect(f.calls).toHaveLength(calls + 1)
    const effects = await f.release.readPublicationEffects(plan)
    expect(effects.root.matchesPlan).toBe(true)
    expect(effects.packages[0]).toMatchObject({childVersion: "1.0.1", ready: true})
    expect(effects.packages[0]?.prepared).toHaveLength(2)
    const server = complete.results.find(item => item.env === "server")!.outputs.find(item => item.artifact === ".")!
    const loaded = await import(server.path)
    expect(loaded.answer).toBe(41)
    expect(loaded.version).toBe("1.0.1")
    const beforeRead = f.calls.length
    expect((await f.release.readPublicationEffects(plan)).packages[0]?.ready).toBe(true)
    expect(f.calls).toHaveLength(beforeRead)
  } finally {await f.cleanup()}
})

test("stale check or plan is rejected before publication effects", async () => {
  const f = await fixture()
  try {
    const plan = await f.release.planPublication(f.changes)
    const inventory = await f.builder.sourceInventory()
    const rootSource = await Bun.file(join(f.root, "package.json")).text()
    await Bun.write(join(f.directory, "server/index.ts"), "export const changed = true\n")
    await expect(f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: inventory.sha256}})).rejects.toThrow("before intent")
    expect(await Bun.file(join(f.root, "package.json")).text()).toBe(rootSource)
    expect((await f.release.readPublicationEffects(plan)).packages[0]?.prepared).toEqual([])
    await Bun.write(join(f.root, "package.json"), rootSource + "\n")
    await expect(f.release.publishPackages(f.changes, {expectedPlan: plan})).rejects.toThrow("plan changed")
    expect(f.calls).toHaveLength(0)
  } finally {await f.cleanup()}
})

test("legacy callers keep immutable reuse while guarded publication requires provenance", async () => {
  const f = await fixture(false)
  try {
    const plan = await f.release.planPublication(f.changes)
    f.failWorker()
    expect((await f.release.publishPackages(f.changes)).success).toBe(false)
    const prepared = (await f.release.readPublicationEffects(plan)).packages[0]!.prepared
    expect(prepared).toHaveLength(1)
    expect(prepared[0]?.provenance).toBeUndefined()
    const guardedBuilder = createPackageBuilder({resolvePackage: () => f.directory, provenance: {roots: [f.root],
      excludedDirectoryNames: ["dist", ".release"], excludedDirectoryNamePrefixes: [".package-update-"]}})
    const guarded = createRelease({root: f.root, builder: guardedBuilder, isMember: name => name === f.name})
    await expect(guarded.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await guardedBuilder.sourceInventory()).sha256}})).rejects.toThrow("Prepared provenance is missing")
    const calls = f.calls.length
    expect((await f.release.publishPackages(f.changes)).success).toBe(true)
    expect(f.calls).toHaveLength(calls + 1)
    expect((await f.release.readPublicationEffects(plan)).packages[0]?.prepared.find(item => item.env === "server")?.outputs).toEqual(prepared[0]?.outputs)
  } finally {await f.cleanup()}
})

test("manifest failure exposes ready versions and their provenance without continuing publication", async () => {
  const f = await fixture()
  try {
    const plan = await f.release.planPublication(f.changes)
    f.failManifest()
    await expect(f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await f.builder.sourceInventory()).sha256}})).rejects.toThrow("child manifest write failure")
    const effects = await f.release.readPublicationEffects(plan)
    expect(effects.root.matchesPlan).toBe(false)
    expect(effects.packages[0]).toMatchObject({childVersion: "1.0.0", ready: true})
    expect(effects.packages[0]?.prepared.map(item => item.provenance?.targetVersion)).toEqual(["1.0.1", "1.0.1"])
    const calls = f.calls.length
    expect(await f.release.readPublicationEffects(plan)).toEqual(effects)
    expect(f.calls).toHaveLength(calls)
    expect((await f.release.publishPackages(f.changes, {expectedPlan: plan,
      provenance: {inventorySha256: (await f.builder.sourceInventory()).sha256}})).success).toBe(true)
    expect(f.calls).toHaveLength(calls)
  } finally {await f.cleanup()}
})
