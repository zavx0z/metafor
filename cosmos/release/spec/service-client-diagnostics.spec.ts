import {expect, test} from "bun:test"
import {createServiceDiagnostics} from "../service/client-diagnostics"
import {createServiceDiagnosticsClient, readClientCache} from "../main/service-diagnostics"
import {SERVICE_DIAGNOSTICS_SCHEMA, isClientResult} from "../shared/clients"

function fixture() {
  const events = new EventTarget(), calls: unknown[][] = []
  const console = Object.fromEntries(["log", "debug", "info", "warn", "error"].map(level => [level, (...values: unknown[]) => calls.push([level, ...values])])) as unknown as Console
  // Fixture исполняет первоначальный forwarding Worker до запуска сменяемого collector.
  events.addEventListener("error", event => {const value = event as ErrorEvent; console.error("service.error", value.error ?? value.message)})
  events.addEventListener("unhandledrejection", event => console.error("service.unhandledrejection", (event as PromiseRejectionEvent).reason))
  const original = console.error
  const service = createServiceDiagnostics({version: "0.2.8", scriptURL: "http://client.test/sw?version=0.2.8&token=private", scope: "http://client.test/", console,
    async client(id) {return id === "own-window" ? {type: "window", url: "http://client.test/"} : {type: "window", url: "https://foreign.test/"}}})
  const source = {id: "own-window"} as Client
  const controller = {postMessage(data: unknown, ports: Transferable[]) {void service.message({data, ports: ports as unknown as readonly MessagePort[], source})}}
  const browser = createServiceDiagnosticsClient({controller} as unknown as Pick<ServiceWorkerContainer, "controller">)
  return {service, browser, console, calls, events, original, source}
}

test("actual MessageChannel relays five service console levels and errors with bounded own safe values and producer identity", async () => {
  const f = fixture()
  f.service.start()
  let getters = 0, serializers = 0
  const object = {get value() {getters++; throw new Error("getter")}, toJSON() {serializers++; throw new Error("toJSON")}, token: "private"}
  try {
    for (const level of ["log", "debug", "info", "warn", "error"] as const) f.console[level]("service", object)
    f.events.dispatchEvent(Object.assign(new Event("error"), {error: new Error("worker failed")}))
    f.events.dispatchEvent(Object.assign(new Event("unhandledrejection"), {reason: "rejected"}))
    const result = await f.browser.logs()
    expect(isClientResult("logs", result)).toBe(true)
    expect(result.from).toBe("release-service")
    expect(result.owner).toMatchObject({kind: "ServiceWorker", releaseVersion: "0.2.8", scriptURL: "http://client.test/sw?version=0.2.8"})
    expect(result.entries.map(entry => entry.level)).toEqual(["log", "debug", "info", "warn", "error", "error", "error"])
    expect(result.entries.at(-1)!.message).toContain("service.unhandledrejection")
    expect(result.entries[0]!.values?.[1]).toMatchObject({value: "[accessor]", token: "[redacted]"})
    expect(getters).toBe(0); expect(serializers).toBe(0)
    expect(f.calls).toHaveLength(7)
    await expect(f.browser.logs(0, 64, "wrong-producer")).rejects.toThrow("incarnation changed")
    for (let index = 0; index < 300; index++) f.console.debug(index)
    const dropped = await f.browser.logs(0, 1)
    expect(dropped.dropped).toBeGreaterThan(0)
    expect(dropped.cursor).toBe(dropped.entries[0]!.sequence)
  } finally {f.browser.dispose(); f.service.destroy()}
  expect(f.console.error).toBe(f.original)
})

test("worker diagnostics reject foreign source and malformed queries without log echo", async () => {
  const f = fixture()
  f.service.start()
  let replies = 0
  const port = {postMessage() {replies++}, close() {}} as unknown as MessagePort
  try {
    const data = {schema: SERVICE_DIAGNOSTICS_SCHEMA, type: "logs", requestId: "request-1", afterSequence: 0, limit: 64}
    await f.service.message({data, ports: [port], source: {id: "foreign"} as Client})
    expect(replies).toBe(0)
    expect(await f.service.message({data: {...data, limit: 999}, ports: [port], source: f.source})).toBe(false)
    expect(f.calls).toHaveLength(0)
  } finally {f.browser.dispose(); f.service.destroy()}
})

test("cache inventory reads exact canonical URLs and body hashes without opening transaction or mutating caches", async () => {
  const origin = "http://client.test", main = origin + "/@cosmos/release?env=main&version=0.2.8", privateKey = origin + "/profile?token=private"
  const entries = new Map<string, Map<string, Response>>([
    ["release", new Map([[main, new Response("actual-main")], [privateKey, new Response("private-profile")]])],
    ["transaction", new Map([[origin + "/transaction", new Response("marker")], [origin + "/transaction/failure", new Response("failure")]])],
    ["other-profile-cache", new Map([[origin + "/private", new Response("private-body")]])],
  ])
  const opened: string[] = []
  let mutations = 0
  const storage = {async keys() {return [...entries.keys()]}, async open(name: string) {opened.push(name); if (!entries.has(name)) throw new Error("must not create"); return {async keys() {return [...entries.get(name)!.keys()].map(url => new Request(url))}, async put() {mutations++}, async delete() {mutations++}}},
    async match(request: Request, options: {cacheName: string}) {return entries.get(options.cacheName)?.get(request.url)?.clone()}, async delete() {mutations++; return false}} as unknown as CacheStorage
  const result = await readClientCache({hash: true}, storage, origin)
  expect(isClientResult("cache", result)).toBe(true)
  expect(opened).toEqual(["release"])
  expect(mutations).toBe(0)
  expect(result.transaction).toBe("marker-only")
  expect(result.entries.find(entry => entry.url === main)).toMatchObject({bytes: 11, status: 200, sha256: Bun.CryptoHasher.hash("sha256", "actual-main", "hex")})
  expect(JSON.stringify(result)).not.toContain("private-body")
  expect(JSON.stringify(result)).not.toContain("private-profile")
  expect(JSON.stringify(result)).not.toContain("token=private")
  expect(result.entries.filter(entry => entry.cache === "transaction")).toHaveLength(2)
  const page = await readClientCache({limit: 1}, storage, origin)
  expect(page.cursor).toBe(1); expect(page.truncated).toBe(true)
})


