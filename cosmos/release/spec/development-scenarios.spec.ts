import {expect, test} from "bun:test"
import {chmod, cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {basename, dirname, join, resolve} from "node:path"
import {createDevelopmentScenarios} from "../server/development-scenarios"
import {configuredDevelopment} from "../server/development"
import {developmentScenarioCompilerDigest} from "../server/development-scenario-compiler"
import type {DevelopmentReleaseHost} from "../server/development-preparation"

const compilerPackage = Bun.resolveSync("typescript/package.json", import.meta.dir)
const nativePackage = Bun.resolveSync(`@typescript/typescript-${process.platform}-${process.arch}/package.json`, dirname(compilerPackage))
const nativeCompiler = join(dirname(nativePackage), "lib/tsc")

async function buildPreloadArtifact(directory: string): Promise<string> {
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "../server/development-scenario-preload.ts")],
    target: "bun", packages: "bundle"})
  expect(build.success, build.logs.map(String).join("\n")).toBe(true)
  for (const output of build.outputs) await Bun.write(join(directory, basename(output.path)), output)
  const main = build.outputs.find(output => basename(output.path) === "development-scenario-preload.js")
  if (!main) throw new Error("Scenario preload entry artifact is missing")
  return join(directory, basename(main.path))
}

test("сценарий через symlink родительского каталога не покидает назначенный Package", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-scenario-owner-")))
  try {
    const assigned = join(root, "assigned"), outside = join(root, "outside")
    await mkdir(assigned)
    await mkdir(outside)
    await writeFile(join(outside, "scenario.spec.ts"), 'test("outside", () => {})\n')
    await symlink(outside, join(assigned, "spec"), "dir")
    const catalog = {contentNode() {return {source: {directory: assigned}, node: {id: "package:@fixture/assigned"},
      metadata: {scenarioSpec: {sourcePaths: [join(assigned, "spec/scenario.spec.ts")]}}}}}
    const scenarios = createDevelopmentScenarios(catalog as unknown as Parameters<typeof createDevelopmentScenarios>[0],
      {tracePreloadPath: "/unused", tsserverPath: async () => "/unused"})
    try {
      await expect(scenarios.list("@fixture/assigned")).rejects.toThrow("resolves outside")
    } finally {await scenarios.close()}
  } finally {await rm(root, {recursive: true, force: true})}
})

test("назначенный сценарий настоящего @cosmos/release исполняется читателем Storybook и возвращает проверки", async () => {
  const installed = await mkdtemp(join(tmpdir(), "metafor-scenario-preload-"))
  const directory = resolve(import.meta.dir, ".."), path = join(directory, "spec/scenario.spec.ts")
  const catalog = {contentNode(packageName: string, nodeId = "package:@cosmos/release") {
    if (packageName !== "@cosmos/release" || nodeId !== "package:@cosmos/release") throw new Error("Чужой Package")
    return {source: {directory}, node: {id: nodeId}, metadata: {scenarioSpec: {sourcePaths: [path]}}}
  }}
  const scenarios = createDevelopmentScenarios(catalog as unknown as Parameters<typeof createDevelopmentScenarios>[0],
    {tracePreloadPath: await buildPreloadArtifact(installed),
      tsserverPath: async () => nativeCompiler})
  try {
    const listing = await scenarios.list("@cosmos/release")
    expect(listing).toMatchObject({packageName: "@cosmos/release", nodeId: "package:@cosmos/release",
      sources: [{path: "spec/scenario.spec.ts"}]})
    expect(listing.sources[0]?.digest).toMatch(/^[a-f0-9]{64}$/)
    await expect(scenarios.run({packageName: "@cosmos/release", sourcePath: "../foreign.spec.ts",
      expectedDigest: listing.sources[0]!.digest}, new AbortController().signal)).rejects.toThrow("changed")
    await expect(scenarios.run({packageName: "@cosmos/release", sourcePath: listing.sources[0]!.path,
      expectedDigest: "0".repeat(64)}, new AbortController().signal)).rejects.toThrow("changed")
    await expect(scenarios.run({packageName: "@cosmos/release", sourcePath: listing.sources[0]!.path,
      expectedDigest: listing.sources[0]!.digest}, AbortSignal.abort(new Error("cancelled")))).rejects.toThrow("cancelled")
    const progress: string[] = []
    const report = await scenarios.run({packageName: "@cosmos/release", sourcePath: listing.sources[0]!.path,
      expectedDigest: listing.sources[0]!.digest}, new AbortController().signal, value => progress.push(value.phase))
    expect(report.sourcePath).toBe("spec/scenario.spec.ts")
    expect(report.digest).toBe(listing.sources[0]!.digest)
    expect(report.exitCode).toBe(0)
    expect(report.validation.status).toBe("incomplete")
    expect(report.tests).toHaveLength(40)
    expect(report.tests.every(item => item.status === "passed")).toBe(true)
    expect(report.source).toContain("releaseDelta")
    expect(progress).toContain("running")
  } finally {await scenarios.close(); await rm(installed, {recursive: true, force: true})}
})

test("собранный Core исполняет 40 проверок через отдельный immutable preload artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-installed-scenarios-"))
  try {
    const compilerArtifact = join(directory, "toolchain/lib/tsc")
    await cp(join(dirname(nativePackage), "lib"), join(directory, "toolchain/lib"), {recursive: true})
    await chmod(compilerArtifact, 0o755)
    const preloadArtifact = await buildPreloadArtifact(directory)
    const entry = join(directory, "core-source.ts"), core = join(directory, "core.js")
    const scenarioDirectory = resolve(import.meta.dir, "..")
    await Bun.write(entry, `import {createDevelopmentScenarios} from ${JSON.stringify(resolve(import.meta.dir, "../server/development-scenarios.ts"))}
const directory = ${JSON.stringify(scenarioDirectory)}
const catalog = {contentNode(name, nodeId = "package:@cosmos/release") {
  if (name !== "@cosmos/release" || nodeId !== "package:@cosmos/release") throw new Error("Foreign package")
  return {source: {directory}, node: {id: nodeId}, metadata: {scenarioSpec: {sourcePaths: [directory + "/spec/scenario.spec.ts"]}}}
}}
const scenarios = createDevelopmentScenarios(catalog, {tracePreloadPath: process.argv[2], tsserverPath: async () => process.argv[3]})
try {
  const listed = await scenarios.list("@cosmos/release")
  const result = await scenarios.run({packageName: "@cosmos/release", sourcePath: listed.sources[0].path,
    expectedDigest: listed.sources[0].digest}, new AbortController().signal)
  console.log(JSON.stringify({exitCode: result.exitCode, passed: result.tests.filter(test => test.status === "passed").length,
    validation: result.validation.status}))
} finally {await scenarios.close()}
`)
    const build = await Bun.build({entrypoints: [entry], target: "bun", packages: "bundle",
      conditions: ["cosmos:server", "internal:server"]})
    expect(build.success, build.logs.map(String).join("\n")).toBe(true)
    expect(build.outputs).toHaveLength(1)
    await Bun.write(core, build.outputs[0]!)
    await rm(entry)
    const child = Bun.spawn([process.execPath, core, preloadArtifact, compilerArtifact], {cwd: directory,
      env: {...process.env, NODE_ENV: "production"}, stdout: "pipe", stderr: "pipe"})
    const deadline = setTimeout(() => child.kill(), 25_000)
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    clearTimeout(deadline)
    expect(code, stderr).toBe(0)
    expect(JSON.parse(stdout)).toEqual({exitCode: 0, passed: 40, validation: "incomplete"})
  } finally {await rm(directory, {recursive: true, force: true})}
}, 60_000)

test("HTTP reader grant передаёт list и поток фактического сценария из назначенного Package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-scenario-http-"))
  let service: Awaited<ReturnType<typeof configuredDevelopment>> | null = null
  try {
    const preload = await buildPreloadArtifact(directory)
    const compilerPath = join(directory, "toolchain/lib/tsc")
    await cp(join(dirname(nativePackage), "lib"), join(directory, "toolchain/lib"), {recursive: true})
    await chmod(compilerPath, 0o755)
    const compilerSha256 = await developmentScenarioCompilerDigest(dirname(compilerPath))
    const packageRoot = resolve(import.meta.dir, ".."), config = join(directory, "assignment.json")
    await writeFile(config, JSON.stringify({version: 1, id: "scenario-http", rootPackage: "@cosmos/release",
      roots: [{name: "@cosmos/release", directory: packageRoot, writable: false}], stateDirectory: join(directory, "state"),
      execution: {connectionId: "test", connections: [{id: "test", label: "Fixture", enabled: true,
        provider: "codex", peer: {peerId: "fixture", executorId: "fixture"}}]},
      scenarios: {compilerPath, compilerSha256}}), {mode: 0o600})
    const host = {storeRoot: directory, scenarioPreloadEntrypoint: async () => preload} as unknown as DevelopmentReleaseHost
    service = await configuredDevelopment({COSMOS_DEVELOPMENT_CONFIG: config}, null, host)
    expect(service).not.toBeNull()
    const origin = "http://127.0.0.1:4444", base = `${origin}/cosmos/development`
    const server = {requestIP: () => ({address: "127.0.0.1"}), timeout() {}}
    const post = (path: string, body: object, token?: string) => service!.fetch(new Request(`${base}/${path}`, {method: "POST",
      headers: {origin, "content-type": "application/json", ...(token ? {"x-storybook-session": token} : {})},
      body: JSON.stringify(body)}), server)
    const grant = await post("reader", {}).then(response => response.json())
    expect(typeof grant.readerToken).toBe("string")
    const listing = await post("scenarios/list", {packageName: "@cosmos/release"}, grant.readerToken).then(response => response.json())
    expect(listing.sources).toMatchObject([{path: "spec/scenario.spec.ts"}])
    const response = await post("scenarios/run", {packageName: "@cosmos/release", nodeId: listing.nodeId,
      sourcePath: listing.sources[0].path, expectedDigest: listing.sources[0].digest}, grant.readerToken)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/x-ndjson")
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line))
    expect(events.some(event => event.type === "progress")).toBe(true)
    expect(events.find(event => event.type === "result")?.result?.tests.filter((test: {status: string}) => test.status === "passed")).toHaveLength(40)
    expect(events.some(event => event.type === "error")).toBe(false)
  } finally {await service?.close(); await rm(directory, {recursive: true, force: true})}
}, 60_000)
