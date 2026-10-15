import {expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {chmod, mkdir, mkdtemp, readdir, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph, type PublishedReleaseOutput} from "../../../../tech/release/installed"
import {prepareOperator, installOperator} from "./operator-install"

test("замороженный operator запускает installed A, активирует B и возвращает A без исходников", async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "metafor-operator-")))
  const checkout = join(temporary, "checkout")
  const data = join(temporary, "instance")
  const storeRoot = join(data, "store")
  const sentinel = join(data, "world-profile-conversation.json")
  const original = JSON.stringify({world: "world-kept", profile: "profile-kept", conversation: ["сохранить"]})
  const processes = new Set<ReturnType<typeof Bun.spawn>>()
  const reservation = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response()})
  const port = reservation.port!
  await reservation.stop(true)
  const origin = `http://127.0.0.1:${port}`
  let diagnostics = ""
  try {
    await mkdir(join(checkout, "cosmos"), {recursive: true})
    await Bun.write(join(checkout, "package.json"), '{"name":"@fixture/operator-source"}')
    await Bun.write(sentinel, original)
    const store = createInstalledReleaseStore({root: storeRoot})
    const a = await candidate(temporary, store, "1.0.0")
    const b = await candidate(temporary, store, "1.0.1")
    const environment = {COSMOS_RELEASE_STORE: storeRoot, COSMOS_RELEASE_DIGEST: a.digest, METAFOR_STATE_ROOT: data}
    const artifact = await prepareOperator({destination: join(temporary, "operator"), checkout, environment, port,
      bunExecutable: process.execPath})
    const bin = join(temporary, "bin", "metafor-dev")
    await mkdir(join(temporary, "bin"))
    await installOperator(artifact.receipt, bin)
    expect(await Bun.file(bin).exists()).toBeTrue()

    // Изменяемый checkout заведомо непригоден для исполнения; поставка уже готова.
    await Bun.write(join(checkout, "package.json"), "{broken package")
    await Bun.write(join(checkout, "cosmos", "server.ts"), 'throw new Error("mutable source must not execute")')
    await Bun.write(join(checkout, "cosmos", "cli.ts"), 'throw new Error("mutable CLI must not execute")')
    await Bun.write(join(checkout, "cosmos", ".env"), "COSMOS_RELEASE_STORE=/missing/mutable-store\n")
    await Bun.write(join(checkout, "cosmos", "bunfig.toml"), 'preload = ["./forbidden-preload.ts"]\n')
    await Bun.write(join(checkout, "cosmos", "forbidden-preload.ts"), 'throw new Error("mutable preload must not execute")')
    await rm(join(temporary, "fixture.ts"), {force: true})
    const help = Bun.spawn([bin, "--help"], {cwd: join(checkout, "cosmos"), stdout: "pipe", stderr: "pipe"})
    processes.add(help)
    const [helpCode, helpOutput, helpError] = await Promise.all([help.exited, new Response(help.stdout).text(), new Response(help.stderr).text()])
    expect(helpCode, helpError).toBe(0)
    expect(helpOutput).toContain("downgrade")
    processes.delete(help)
    const env = {...process.env, METAFOR_OPERATOR_ROOT: artifact.root,
      METAFOR_OPERATOR_INSTANCE: artifact.instance, METAFOR_OPERATOR_INSTANCE_SHA256: artifact.instanceSha256,
      METAFOR_OPERATOR_BUN: process.execPath}
    const launch = () => {
      const child = Bun.spawn([process.execPath, "run", "dev"], {cwd: artifact.root, env, stdout: "pipe", stderr: "pipe"})
      processes.add(child)
      for (const stream of [child.stdout, child.stderr]) {
        void (async () => {for await (const bytes of stream) diagnostics += new TextDecoder().decode(bytes)})()
      }
      return child
    }
    const waitActive = async (digest: string, version: string) => {
      const deadline = Date.now() + 15_000
      let observed = ""
      while (Date.now() < deadline) {
        const activation = await store.readActivation()
        const response = await fetch(`${origin}/version`).catch(() => undefined)
        const body = response ? await response.text() : "no HTTP response"
        observed = JSON.stringify({activation, http: response?.status, body, processes: [...processes].map(child => ({pid: child.pid, exit: child.exitCode}))})
        if (activation?.digest === digest && activation.successful[0]?.digest === digest && response?.ok && body === version) return
        if ([...processes].some(child => child.exitCode !== null)) throw new Error(`Fixture launcher exited before ${version}: ${observed}\n${diagnostics}`)
        await Bun.sleep(25)
      }
      throw new Error(`Fixture did not admit ${version}: ${observed}\n${diagnostics}`)
    }
    const helper = async (...args: string[]) => {
      const child = Bun.spawn([process.execPath, join(artifact.root, "scripts", "release-selection.ts"), ...args], {
        cwd: artifact.root, env, stdout: "pipe", stderr: "pipe",
      })
      processes.add(child)
      const [code, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      processes.delete(child)
      expect(code, `${error}\n${diagnostics}`).toBe(0)
      return out.trim()
    }
    const stop = async (child: ReturnType<typeof launch>) => {
      child.kill("SIGTERM")
      const code = await Promise.race([child.exited, Bun.sleep(10_000).then(() => {throw new Error("Fixture shutdown timed out")})])
      expect(code, diagnostics).toBe(0)
      processes.delete(child)
    }
    const running = launch()
    await waitActive(a.digest, "1.0.0")
    const identity = await fetch(`${origin}/identity`).then(response => response.json()) as {pid: number; parent: number}
    expect(identity.pid).not.toBe(running.pid)
    expect(identity.parent).not.toBe(process.pid)
    expect(() => process.kill(identity.parent, 0)).not.toThrow()
    const ownerCwd = Bun.spawn(["lsof", "-a", "-p", String(identity.parent), "-d", "cwd", "-Fn"], {stdout: "pipe", stderr: "pipe"})
    const [cwdCode, cwdOutput] = await Promise.all([ownerCwd.exited, new Response(ownerCwd.stdout).text()])
    expect(cwdCode).toBe(0)
    expect(cwdOutput.split("\n")).toContain(`n${artifact.root}`)
    const duplicate = launch()
    expect(await duplicate.exited).not.toBe(0)
    processes.delete(duplicate)
    await waitActive(a.digest, "1.0.0")
    const activation = await helper("prepare", b.digest)
    await helper("apply", activation, origin)
    await waitActive(b.digest, "1.0.1")
    expect((await fetch(`${origin}/cosmos`)).status).toBe(500)
    const downgrade = await helper("prepare")
    await helper("apply", downgrade, origin)
    await helper("verify", downgrade, origin)
    await waitActive(a.digest, "1.0.0")
    expect(await Bun.file(sentinel).text()).toBe(original)
    await stop(running)
    const cold = launch()
    await waitActive(a.digest, "1.0.0")
    expect(await Bun.file(sentinel).text()).toBe(original)
    await stop(cold)
    const beforeInvalid = JSON.stringify(await store.readActivation())
    const invalid = Bun.spawn([process.execPath, join(artifact.root, "scripts", "release-selection.ts"), "prepare"], {
      cwd: artifact.root, env: {...env, METAFOR_OPERATOR_INSTANCE_SHA256: "0".repeat(64)}, stdout: "pipe", stderr: "pipe",
    })
    processes.add(invalid)
    const [invalidCode, invalidError] = await Promise.all([invalid.exited, new Response(invalid.stderr).text()])
    expect(invalidCode).not.toBe(0)
    expect(invalidError).toContain("Operator instance binding changed")
    processes.delete(invalid)
    expect(JSON.stringify(await store.readActivation())).toBe(beforeInvalid)
    const wrapperBefore = await Bun.file(bin).text()
    const frozenServer = join(artifact.root, "server.mjs")
    await chmod(frozenServer, 0o600)
    await Bun.write(frozenServer, "throw new Error('fixture tampered artifact')\n")
    await expect(installOperator(artifact.receipt, bin)).rejects.toThrow("Operator snapshot changed")
    expect(await Bun.file(bin).text()).toBe(wrapperBefore)
  } finally {
    await Promise.all([...processes].map(async child => {
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }))
    await unlockDirectories(temporary)
    await rm(temporary, {recursive: true, force: true})
  }
}, 60_000)

async function unlockDirectories(root: string): Promise<void> {
  await chmod(root, 0o700)
  for (const entry of await readdir(root, {withFileTypes: true})) {
    if (entry.isDirectory()) await unlockDirectories(join(root, entry.name))
  }
}

async function candidate(temporary: string, store: ReturnType<typeof createInstalledReleaseStore>, version: string) {
  const source = join(temporary, "fixture.ts")
  const owner = resolve(import.meta.dir, "../../../../cosmos/release/server/installed")
  await Bun.write(source, `
import {attachServerProcessControl} from ${JSON.stringify(join(owner, "control.ts"))}
import {createReleaseManagement} from ${JSON.stringify(join(owner, "management.ts"))}
let server, control, admitted = false
const management = createReleaseManagement({storeRoot: process.env.COSMOS_RELEASE_STORE,
  request: (selection, id) => control.requestHandover(selection.target, 5000, {kind: selection.kind, expected: selection.expected}, id),
  defer: work => setTimeout(() => {void work()}, 0)})
control = await attachServerProcessControl({
  async bind() {server = Bun.serve({hostname: "127.0.0.1", port: Number(process.env.PORT), fetch(request) {
    if (!admitted) return new Response("not admitted", {status: 503})
    const path = new URL(request.url).pathname
    if (path === "/release/manage") return management.fetch(request, server)
    if (path === "/identity") return Response.json({pid: process.pid, parent: process.ppid})
    if (path === "/code") return new Response("fixture", {headers: {"X-Cosmos-Release": process.env.COSMOS_RELEASE_DIGEST}})
    if (path === "/cosmos" && ${JSON.stringify(version)} === "1.0.1") return new Response("broken fixture UI", {status: 500})
    return new Response(${JSON.stringify(version)})
  }})},
  async admit() {admitted = true}, async quiesce() {admitted = false}, async resume() {admitted = true},
  async unbind() {await server?.stop(false); server = null},
  async destroy() {admitted = false; await server?.stop(true); server = null}
})
`)
  const build = await Bun.build({entrypoints: [source], target: "bun", conditions: ["cosmos:server", "internal:server"]})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  expect(build.outputs).toHaveLength(1)
  const bytes = new Map<string, Uint8Array>()
  const output = (artifact: PublishedReleaseOutput["artifact"], body: Uint8Array, kind: PublishedReleaseOutput["kind"]): PublishedReleaseOutput => {
    const sha256 = createHash("sha256").update(body).digest("hex")
    bytes.set(sha256, body)
    return {artifact, kind, type: kind === "asset" ? "application/json" : "text/javascript", sha256, size: body.length,
      ...(artifact === "." ? {load: "eager" as const} : {})}
  }
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{name: "@cosmos/release", version, dependencies: {},
    environments: [{env: "server", publicArtifacts: {"./persisted-state.json": ".json"}, outputs: [
      output(".", new Uint8Array(await build.outputs[0]!.arrayBuffer()), "entry-point"),
      output("./persisted-state.json", Buffer.from(JSON.stringify({version: 1, compatibilityLine: "operator-fixture:1"})), "asset"),
    ]}]}]})
  return store.prepare(graph, {async read(identity) {
    const body = bytes.get(identity.sha256)
    if (!body) throw new Error("Fixture artifact missing")
    return body
  }})
}
