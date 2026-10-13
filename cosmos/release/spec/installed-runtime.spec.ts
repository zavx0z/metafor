import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {chmod, mkdtemp, mkdir, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createHash} from "node:crypto"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {startInstalledCosmos} from "../../installed"

const font = new Uint8Array([0, 1, 0, 0, 111, 119, 110, 101, 100, 45, 102, 111, 110, 116])

/** Реальный bundled server, два независимых installed roots и RTC-доставка обновления. */
describe.each([
  {name: "Сервер получает полный выпуск по RTC и переключает своё исполнение", props: {previous: "1.0.0", next: "1.1.0"}},
])("$name", ({props}) => {
  let directory: string
  let publisher: Awaited<ReturnType<typeof startInstalledCosmos>> | undefined
  let receiver: Awaited<ReturnType<typeof startInstalledCosmos>> | undefined
  let address: string
  let nextDigest: string
  let nextServerHash: string
  let oldPid: number
  let replConfig: string
  const replToken = "test-only-native-repl-assigned-capability"
  let launcherPath: string
  let launcher: ReturnType<typeof Bun.spawn> | undefined
  const token = "test-only-installed-release-capability"

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "cosmos-installed-e2e-"))
    replConfig = join(directory, "native-repl.json")
    await Bun.write(replConfig, JSON.stringify({token: replToken, cwd: directory}))
    await chmod(replConfig, 0o600)
    const entry = resolve(import.meta.dir, "../server/index.ts")
    const build = await Bun.build({
      entrypoints: [entry], target: "bun", minify: true,
      conditions: ["cosmos:server", "internal:server"],
    })
    if (!build.success || build.outputs.length !== 1) throw new Error(build.logs.map(String).join("\n") || "Server fixture must bundle into one output")
    const bytes = new Uint8Array(await build.outputs[0]!.arrayBuffer())
    const launcherBuild = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "../../server.ts")], target: "bun", minify: true,
      conditions: ["cosmos:server", "internal:server"],
    })
    if (!launcherBuild.success || launcherBuild.outputs.length !== 1)
      throw new Error(launcherBuild.logs.map(String).join("\n") || "Launcher must bundle into one output")
    launcherPath = join(directory, "launcher.js")
    await Bun.write(launcherPath, launcherBuild.outputs[0]!)
    const sourceRoot = join(directory, "publisher")
    const targetRoot = join(directory, "receiver")
    await mkdir(sourceRoot)
    await mkdir(targetRoot)
    const previousServer = new Uint8Array(Buffer.concat([bytes, Buffer.from(`\n// Installed fixture ${props.previous}\n`)]))
    const nextServer = new Uint8Array(Buffer.concat([bytes, Buffer.from(`\n// Installed fixture ${props.next}\n`)]))
    nextServerHash = hash(nextServer)
    const previous = graph(props.previous, previousServer)
    const next = graph(props.next, nextServer)
    nextDigest = publishedReleaseGraphDigest(next)
    const main = new TextEncoder().encode("export const ready = true")
    const artifacts = new Map([[hash(previousServer), previousServer], [nextServerHash, nextServer], [hash(main), main], [hash(font), font]])
    const source = {async read(identity: {sha256: string}) {
      const artifact = artifacts.get(identity.sha256)
      if (!artifact) throw new Error("Fixture artifact is absent from the published graph")
      return artifact
    }}
    const sourceStore = createInstalledReleaseStore({root: sourceRoot})
    const targetStore = createInstalledReleaseStore({root: targetRoot})
    await sourceStore.prepare(next, source, nextDigest)
    const initial = await targetStore.prepare(previous, source)
    publisher = await startInstalledCosmos({storeRoot: sourceRoot, initialDigest: nextDigest, port: await freePort(), controlToken: token})
    const port = await freePort()
    receiver = await startInstalledCosmos({storeRoot: targetRoot, initialDigest: initial.digest, port, controlToken: token, environment: {ORACLE_REPL_CONFIG: replConfig}})
    address = `http://127.0.0.1:${port}`
    oldPid = receiver.host.active.runtime.process.pid
  }, 90_000)

  afterAll(async () => {
    if (launcher && launcher.exitCode === null && launcher.signalCode === null) {
      launcher.kill("SIGTERM")
      await launcher.exited
    }
    await Promise.allSettled([publisher?.destroy(), receiver?.destroy()])
    if (directory) await rm(directory, {recursive: true, force: true})
  })

  test("Рабочий выпуск получен без checkout", async () => {
    const response = await fetch(`${address}/code`)
    expect(response.status, "Установленный сервер обслуживает browser contract").toBe(200)
    expect(response.headers.get("X-Cosmos-Server-Version"), "Исполняется явно установленная прежняя версия").toBe(props.previous)
    expect(await response.json(), "Browser видит свою часть согласованного выпуска").toEqual({packages: [{
      name: "@cosmos/release", env: "main", version: props.previous,
      sha256: hash(new TextEncoder().encode("export const ready = true")), size: 25,
    }, {
      name: "@internal/visual", env: "main", version: props.previous,
      sha256: hash(new TextEncoder().encode("export const ready = true")), size: 25,
    }]})
    expect(await Bun.file(join(directory, "receiver", "package.json")).exists(), "Получателю не нужен source manifest Cosmos").toBeFalse()
    expect(await Bun.file(join(directory, "receiver", "node_modules", "werift", "package.json")).exists(), "Исполняемые зависимости уже связаны в доставленном artifact").toBeFalse()
  })

  test("Installed release exposes clients and assigned REPL through its actual public Oracle transport", async () => {
    const transport = new OracleTransport("installed-clients-observer", address)
    const peer = new OracleRpcPeer(transport.channel)
    try {
      await transport.open()
      expect(transport.identity).toMatch(/^observer:/)
      expect(await peer.call("cosmos-clients", "cosmos.client.inspect", {})).toMatchObject({schema: "cosmos/client-command/v1", ok: false, error: {code: "no_active_client"}})
      expect(await peer.call("cosmos-clients", "cosmos.client.events", {})).toMatchObject({schema: "cosmos/client-events/v1", entries: []})
      await expect(peer.call("cosmos-repl", "cosmos.repl.capabilities", {})).rejects.toThrow("capability")
      expect(await peer.call("cosmos-repl", "cosmos.repl.capabilities", {token: replToken})).toMatchObject({schema: "cosmos/repl-capabilities/v1", available: true, execution: "native-bun-process"})
      expect(await peer.call("dark", "meta.capabilities.read", {contractVersion: 1})).toMatchObject({contractVersion: 1, capabilities: []})
      for (const identity of ["cosmos-clients", "cosmos-repl", "dark", "energy"]) {
        const response = await fetch(`${address}/oracle/channels`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({version: 1, identity, methods: []})})
        expect(response.status).toBe(403)
      }
      expect(await peer.call("cosmos-clients", "cosmos.client.inspect", {})).toMatchObject({ok: false, error: {code: "no_active_client"}})
    } finally {peer.close(); await transport.close()}
  })

  test("Default font is served from the verified Visual artifact without source or staticRoot", async () => {
    const response = await fetch(`${address}/assets/fonts/jetbrains-mono-bold.ttf`)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(font)
    expect(await Bun.file(join(directory, "receiver", "assets", "fonts", "jetbrains-mono-bold.ttf")).exists()).toBe(false)
  })

  test("Без capability обновление не начинается", async () => {
    const response = await fetch(`${address}/release/update`, {method: "POST"})
    expect(response.status, "Операторский запрос требует выданного права").toBe(403)
    expect(receiver!.host.active.runtime.process.pid, "Отказ не перезапускает действующий процесс").toBe(oldPid)
    const rejectedMeta = await fetch(`${address}/release/metas/apply`, {method: "POST"})
    expect(rejectedMeta.status).toBe(403)
    const noAssignedRoot = await fetch(`${address}/release/metas/apply`, {method: "POST", headers: {Authorization: `Bearer ${token}`}})
    expect(noAssignedRoot.status).toBe(409)
    expect(receiver!.host.active.runtime.process.pid).toBe(oldPid)
  })

  test("RTC-получение завершается новым действующим процессом", async () => {
    const sourcePort = publisher!.host.active.runtime.process
    const env = (await publisher!.host.prepare(nextDigest)).context.env!
    expect(sourcePort.pid, "Источник является отдельным работающим процессом").toBeGreaterThan(0)
    expect(await Bun.file(join(directory, "receiver", "objects", nextServerHash)).exists(), "Новые server bytes ещё отсутствуют у получателя и должны пройти через RTC").toBeFalse()
    const accepted = await fetch(`${address}/release/update`, {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
      body: JSON.stringify({target: nextDigest, source: `http://127.0.0.1:${env.PORT}/release/peer`, token}),
    })
    expect(accepted.status, "Запрос принят до quiesce, без ожидания собственного HTTP-завершения").toBe(202)
    await until(async () => {
      const active = await receiver!.store.readActive()
      if (active?.digest === nextDigest && receiver!.host.transition?.phase === "complete") return true
      const response = await fetch(`${address}/release/state`, {headers: {Authorization: `Bearer ${token}`}}).catch(() => null)
      const state = response?.ok ? await response.json() as {update?: {state: string; error?: string}} : null
      if (state?.update?.state === "failed") throw new Error(state.update.error)
      if (receiver!.host.transition?.phase === "failed") throw new Error(receiver!.host.transition.error)
      return false
    }, 60_000)
    const response = await fetch(`${address}/code`)
    expect(response.headers.get("X-Cosmos-Release"), "HTTP уже обслуживает полученный полный состав").toBe(nextDigest)
    expect(response.headers.get("X-Cosmos-Server-Version"), "Работает новая версия server release").toBe(props.next)
    expect(receiver!.host.active.runtime.process.pid, "Startup заменил исполнение, а не только файлы на диске").not.toBe(oldPid)
    expect(receiver!.host.active.runtime.identity.sha256, "Новый процесс исполняет полученный server artifact с отличающимися bytes").toBe(nextServerHash)
    expect((await receiver!.store.readActive())?.digest, "Долговечный current совпадает с действующим выпуском").toBe(nextDigest)
  }, 70_000)

  test("Холодный запуск использует сохранённый выбор", async () => {
    await receiver!.destroy()
    launcher = Bun.spawn({
      cmd: [process.execPath, launcherPath],
      cwd: join(directory, "receiver"),
      env: {...process.env, COSMOS_ROOT: "", COSMOS_RELEASE_STORE: join(directory, "receiver"), COSMOS_RELEASE_DIGEST: "", PORT: new URL(address).port, COSMOS_CONTROL_TOKEN: token},
      stdout: "inherit", stderr: "inherit", stdin: "ignore",
    })
    await until(async () => {
      if (launcher!.exitCode !== null) throw new Error("Bundled launcher exited before serving")
      return (await fetch(`${address}/code`).catch(() => null))?.ok ?? false
    }, 10_000)
    const response = await fetch(`${address}/code`)
    expect(response.headers.get("X-Cosmos-Release"), "После нового запуска сохраняется принятый состав без получения заново").toBe(nextDigest)
    const metadata = JSON.parse(await readFile(join(directory, "receiver", "active.json"), "utf8"))
    expect(metadata.digest, "Единственная запись выбора принадлежит startup").toBe(nextDigest)
    launcher.kill("SIGTERM")
    expect(await launcher.exited, "Самодостаточный launcher завершает принадлежащий ему release process").toBe(0)
  }, 20_000)

  test("Остановка дожидается отмены ещё не установленной RTC-связи", async () => {
    receiver = await startInstalledCosmos({storeRoot: join(directory, "receiver"), port: Number(new URL(address).port), controlToken: token})
    const child = receiver.host.active.runtime.process
    let entered = false
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const signaling = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        await request.text()
        entered = true
        await pending
        return new Response(null, {status: 503})
      },
    })
    try {
      const response = await fetch(`${address}/release/update`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
        body: JSON.stringify({target: nextDigest, source: `http://127.0.0.1:${signaling.port}/release/peer`, token}),
      })
      expect(response.status, "Запрос принят, но источник ещё не вернул answer").toBe(202)
      await until(async () => entered, 15_000)
      await receiver.destroy()
      expect(await child.exited, "Отмена signaling освобождает RTC и позволяет child завершиться без SIGKILL").toBe(0)
      expect(child.signalCode, "Cleanup не потребовал принудительной остановки").toBeNull()
      expect((await receiver.store.readActive())?.digest, "Незавершённое получение не меняет сохранённый выбор").toBe(nextDigest)
    } finally {
      release()
      await signaling.stop(true)
    }
  }, 25_000)
})

function graph(version: string, server: Uint8Array): PublishedReleaseGraph {
  const main = new TextEncoder().encode("export const ready = true")
  return {schemaVersion: 1, packages: [{name: "@cosmos/release", version, dependencies: {"@internal/visual": version}, environments: [
    {env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", sha256: hash(server), size: server.length}]},
    {env: "main", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", sha256: hash(main), size: main.length}]},
  ]}, {name: "@internal/visual", version, dependencies: {}, environments: [{env: "main", publicArtifacts: {"./fonts/jetbrains-mono-bold.ttf": ".ttf"}, outputs: [
    {artifact: ".", kind: "entry-point", type: "text/javascript", sha256: hash(main), size: main.length},
    {artifact: "./fonts/jetbrains-mono-bold.ttf", kind: "asset", type: "font/ttf", sha256: hash(font), size: font.length},
  ]}]}]}
}

function hash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex") }

async function freePort() {
  const server = Bun.serve({port: 0, hostname: "127.0.0.1", fetch: () => new Response(null)})
  const port = server.port!
  await server.stop(true)
  return port
}

async function until(condition: () => Promise<boolean>, timeout: number) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await condition()) return
    await Bun.sleep(25)
  }
  throw new Error("Installed release transition did not finish")
}
