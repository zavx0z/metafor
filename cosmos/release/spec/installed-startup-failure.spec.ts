import {beforeAll, afterAll, expect, test} from "bun:test"
import {mkdtemp, mkdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {serverProcessCommandMessage, serverProcessIdentityEnvironment, serverProcessLaunchEnvironment,
  type ServerProcessIdentity} from "../../shared/package/process"

let directory: string
let bytes: Uint8Array<ArrayBuffer>
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "installed-startup-failure-"))
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "../server/index.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"]})
  if (!build.success || build.outputs.length !== 1) throw new Error(build.logs.map(String).join("\n"))
  bytes = new Uint8Array(await build.outputs[0]!.arrayBuffer())
})
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

for (const reason of ["occupied-port", "invalid-installed-root"] as const) test(`failed ${reason} exits after cleanup instead of retaining pending startup`, async () => {
  const root = join(directory, reason)
  const store = createInstalledReleaseStore({root})
  const integrity = await artifactIntegrity(bytes.buffer)
  const output = {artifact: "." as const, kind: "entry-point" as const, type: "text/javascript", ...integrity}
  const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: "@cosmos/release", version: "1.0.0", dependencies: {},
    environments: [{env: "server", publicArtifacts: {}, outputs: [output]}]}]}
  const candidate = await store.prepare(graph, {async read() {return bytes}})
  const identity: ServerProcessIdentity = {name: "@cosmos/release", version: "1.0.0", env: "server", ...integrity}
  const entry = await store.artifactPath(candidate.digest, {...identity, artifact: "."})
  const state = join(root, "state")
  await mkdir(state, {recursive: true})
  const invalidRoot = join(root, "unverified", "meta.ts")
  await Bun.write(invalidRoot, "export default {}")
  // Match the default host, so Bun cannot bind the same port on a different interface.
  const blocker = reason === "occupied-port" ? Bun.serve({port: 0, fetch: () => new Response()}) : undefined
  const messages: {type: string; error?: string; operation?: string}[] = []
  const child = Bun.spawn([process.execPath, entry], {cwd: state, stdout: "pipe", stderr: "pipe",
    env: {PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, PORT: String(blocker?.port ?? 0), COSMOS_RELEASE_STORE: root,
      COSMOS_RELEASE_DIGEST: candidate.digest, METAFOR_STATE_ROOT: state, COSMOS_QUANTUM: reason === "occupied-port" ? "0" : "1",
      METAFOR_WEAK_BACKEND: "cpu", METAFOR_ROOT_META: invalidRoot,
      ...serverProcessIdentityEnvironment(identity), ...serverProcessLaunchEnvironment({mode: "prepared", transitionId: "initial"})},
    ipc(value) {messages.push(value as typeof messages[number])}})
  const stderr = new Response(child.stderr).text()
  const stdout = new Response(child.stdout).text()
  try {
    await until(() => messages.some(message => message.type === "prepared"), 5000)
    child.send(serverProcessCommandMessage("bind", identity, "initial"))
    await until(() => messages.some(message => message.type === "failed"), 10_000)
    const failure = messages.find(message => message.type === "failed")!
    expect(failure.operation).toBe("bind")
    expect(failure.error).toContain(reason === "occupied-port" ? "Failed to start server" : "Selected installed root")
    // Parent requests teardown after receiving failure; a generous parent SIGKILL
    // budget must not hide a permanently pending runInstalledRelease top-level await.
    child.kill("SIGTERM")
    await until(() => child.exitCode !== null, 3000)
    expect(await child.exited).not.toBe(0)
    expect(await stderr).toContain(failure.error!)
    await stdout
    if (blocker) expect((await fetch(`http://127.0.0.1:${blocker.port}`)).ok).toBeTrue()
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await Promise.all([stderr, stdout])
    await blocker?.stop(true)
  }
}, 20_000)

async function until(check: () => boolean, timeout: number) {
  const deadline = Date.now() + timeout
  while (!check()) {if (Date.now() > deadline) throw new Error("Installed failed startup did not settle"); await Bun.sleep(10)}
}
