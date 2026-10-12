import {expect, test} from "bun:test"
import {mkdtemp, mkdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

/** Настоящий release listener; публикация изолирована в отдельном test process без canonical writes. */
test("один release server сохраняет HTTP и /sw рядом с авторизованным /peer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-signaling-"))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    await mkdir(join(directory, "static"))
    await Bun.write(join(directory, "static/index.html"), "fixture-http")
    await Bun.write(join(directory, "static/manifest.json"), "{}")
    const runtime = resolve(import.meta.dir, "../release/server/runtime.ts")
    const services = resolve(import.meta.dir, "../release/server/services.ts")
    const entry = join(directory, "integration.ts")
    await Bun.write(entry, `
import {mock} from "bun:test"
mock.module(${JSON.stringify(services)}, () => ({
  builder: {knownPackage: async () => null},
  release: {recoverPublication: async () => {}, releasedPackages: async () => [], readDesiredBrowserArtifacts: async () => []},
}))
const {startReleaseServer} = await import(${JSON.stringify(runtime)})
const token = "test-only-cosmos-peer-admission"
const server = await startReleaseServer({port: 0, signalingToken: token})
const origin = "http://127.0.0.1:" + server.port
const wsOrigin = origin.replace("http:", "ws:")
const sockets: WebSocket[] = []
const next = (socket: WebSocket, type: string) => new Promise<any>((resolve, reject) => {
  const timer = setTimeout(() => { socket.removeEventListener(type, done); reject(new Error("Fixture timeout " + type)) }, 2000)
  const done = (event: Event) => { clearTimeout(timer); resolve(event) }
  socket.addEventListener(type, done, {once: true})
})
const connect = async (path: string) => {
  const socket = new WebSocket(wsOrigin + path)
  sockets.push(socket)
  await next(socket, "open")
  return socket
}
const join = async (id: string, supplied: string) => {
  const socket = await connect("/peer")
  const admitted = next(socket, supplied === token ? "message" : "close")
  socket.send(JSON.stringify({type: "join", id, token: supplied}))
  return {socket, event: await admitted}
}
try {
  const http = await (await fetch(origin)).text()
  const code = await (await fetch(origin + "/code")).json()
  const rpc = await connect("/sw")
  const delta = next(rpc, "message")
  rpc.send(JSON.stringify({type: "release-current", current: []}))
  const rpcMessage = JSON.parse((await delta).data)
  const wrong = await join("wrong", "incorrect-test-admission")
  const a = await join("a", token)
  const b = await join("b", token)
  const routed = next(b.socket, "message")
  a.socket.send(JSON.stringify({type: "signal", signal: {
    from: "forged", to: "b", generation: "fixture-generation", description: {type: "offer", sdp: "fixture"},
  }}))
  const signal = JSON.parse((await routed).data)
  const rpcAfterPeer = next(rpc, "message")
  rpc.send(JSON.stringify({type: "release-current", current: []}))
  const retainedRpc = JSON.parse((await rpcAfterPeer).data).type
  const plainPeer = (await fetch(origin + "/peer")).status
  const disabled = await startReleaseServer({port: 0})
  const disabledStatus = (await fetch("http://127.0.0.1:" + disabled.port + "/peer")).status
  await disabled.stop(true)
  const closed = sockets.filter(socket => socket.readyState === WebSocket.OPEN).map(socket => next(socket, "close"))
  await server.stop(true)
  await Promise.all(closed)
  console.log(JSON.stringify({http, code, rpcMessage, denied: wrong.event.code, from: signal.signal.from,
    retainedRpc, plainPeer, disabledStatus, allClosed: sockets.every(socket => socket.readyState === WebSocket.CLOSED)}))
} finally {
  for (const socket of sockets) socket.close()
  await server.stop(true)
}
`)
    child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", entry], {
      cwd: directory,
      env: {...process.env, COSMOS_ROOT: directory},
      stdout: "pipe",
      stderr: "pipe",
    })
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) throw new Error("Signaling fixture process pipes are unavailable")
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(exit, stderr).toBe(0)
    const result = JSON.parse(stdout.trim().split("\n").at(-1)!)
    expect(result).toEqual({
      http: "fixture-http", code: {packages: []}, rpcMessage: {type: "release-delta", update: [], remove: []},
      denied: 1008, from: "a", retainedRpc: "release-delta", plainPeer: 426, disabledStatus: 404, allClosed: true,
    })
  } finally {
    if (child && child.exitCode === null) { child.kill(); await child.exited }
    await rm(directory, {recursive: true, force: true})
  }
}, 10_000)

/** Installed lifecycle использует тот же listener; callbacks startup подменены только внутри test child. */
test("installed quiesce/resume сохраняет signaling, unbind закрывает принадлежащие ему сессии", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-installed-signaling-"))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    const runtime = resolve(import.meta.dir, "../release/server/installed/runtime.ts")
    const control = resolve(import.meta.dir, "../release/server/installed/control.ts")
    const delivery = resolve(import.meta.dir, "../release/server/installed/delivery.ts")
    const installed = resolve(import.meta.dir, "../../tech/release/installed.ts")
    const entry = join(directory, "installed-integration.ts")
    await Bun.write(entry, `
import {mock} from "bun:test"
const installedApi = await import(${JSON.stringify(installed)})
mock.module(${JSON.stringify(installed)}, () => ({...installedApi, createInstalledReleaseStore: () => ({})}))
mock.module(${JSON.stringify(delivery)}, () => ({createInstalledReleaseDelivery: async () => ({
  graph: {packages: [{name: "@cosmos/release", version: "1.0.0", environments: [{env: "server", outputs: [{artifact: ".", kind: "entry-point", sha256: "a".repeat(64), size: 1}]}]}]},
  desiredBrowserArtifacts: () => [], fetch: async () => new Response("installed-http"),
})}))
let lifecycle: any
mock.module(${JSON.stringify(control)}, () => ({attachServerProcessControl: async (runtime: any) => {
  lifecycle = runtime
  await runtime.bind()
  await runtime.admit()
  return {requestHandover: async () => {}}
}}))
const {runInstalledRelease} = await import(${JSON.stringify(runtime)})
const token = "test-only-installed-peer-admission"
const server = await runInstalledRelease({storeRoot: ".", digest: "b".repeat(64), port: 0, signalingToken: token})
const origin = "http://127.0.0.1:" + server.port
const wsOrigin = origin.replace("http:", "ws:")
const sockets: WebSocket[] = []
const next = (socket: WebSocket, type: string) => new Promise<any>((resolve, reject) => {
  const timer = setTimeout(() => { socket.removeEventListener(type, done); reject(new Error("Fixture timeout " + type)) }, 2000)
  const done = (event: Event) => { clearTimeout(timer); resolve(event) }
  socket.addEventListener(type, done, {once: true})
})
const connect = async (path: string) => {
  const socket = new WebSocket(wsOrigin + path)
  sockets.push(socket)
  await next(socket, "open")
  return socket
}
try {
  const http = await (await fetch(origin)).text()
  const signaling = await connect("/peer")
  const joined = next(signaling, "message")
  signaling.send(JSON.stringify({type: "join", id: "participant", token}))
  await joined
  const rpc = await connect("/sw")
  await lifecycle.quiesce()
  const paused = (await fetch(origin + "/peer")).status
  const retainedDuringPause = signaling.readyState === WebSocket.OPEN && rpc.readyState === WebSocket.OPEN
  await lifecycle.resume()
  const delta = next(rpc, "message")
  rpc.send(JSON.stringify({type: "release-current", current: []}))
  const rpcMessage = JSON.parse((await delta).data)
  await lifecycle.quiesce()
  const signalingClosed = next(signaling, "close")
  const rpcClosed = next(rpc, "close")
  await lifecycle.unbind()
  const codes = [(await signalingClosed).code, (await rpcClosed).code]
  await lifecycle.destroy()
  console.log(JSON.stringify({http, paused, retainedDuringPause, rpcMessage, codes}))
} finally {
  for (const socket of sockets) socket.close()
  await lifecycle.destroy()
  await server.stop(true)
}
`)
    child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", entry], {
      cwd: directory,
      env: {...process.env, COSMOS_PACKAGE_IDENTITY: JSON.stringify({name: "@cosmos/release", env: "server", version: "1.0.0", sha256: "a".repeat(64), size: 1})},
      stdout: "pipe",
      stderr: "pipe",
    })
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) throw new Error("Signaling fixture process pipes are unavailable")
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(exit, stderr).toBe(0)
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual({
      http: "installed-http", paused: 503, retainedDuringPause: true,
      rpcMessage: {type: "release-delta", update: [], remove: []}, codes: [1001, 1012],
    })
  } finally {
    if (child && child.exitCode === null) { child.kill(); await child.exited }
    await rm(directory, {recursive: true, force: true})
  }
}, 10_000)
