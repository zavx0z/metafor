import {expect, test} from "bun:test"
import type {
  ReleaseFactory,
  ReleaseLoader,
  ReleaseRuntime,
} from "../release/service"
import {
  createReleaseHost,
  registerReleaseListeners,
  type StartupEventScope,
} from "../startup/service/runtime"
import {captureDiagnostics} from "./fixture/diagnostics"

const releaseRequest = new Request(
  "http://127.0.0.1:4444/@cosmos/release?env=service",
)

test.serial("startup cold boot is immediate, shared, and retriable", async () => {
  const calls: string[] = []
  const first = runtime("first", calls, {startError: new Error("first failed")})
  const second = runtime("second", calls)
  const host = createReleaseHost(releaseRequest, loader([() => first, () => second]))

  const {diagnostics} = await captureDiagnostics(async () => {
    const failed = host.boot()
    await expect(failed).rejects.toThrow("first failed")
    expect(calls).toEqual(["first:start", "first:destroy"])

    await Promise.all([host.boot(), host.boot()])
  })
  expect(calls).toEqual([
    "first:start",
    "first:destroy",
    "second:start",
  ])
  expect(diagnostics.map(({level, event}) => `${level}:${String(event)}`)).toEqual([
    "debug:bootstrap release начат",
    "debug:release artifact выбран",
    "debug:release runtime подготовлен",
    "error:bootstrap release завершился с ошибкой",
    "debug:bootstrap release начат",
    "debug:release artifact выбран",
    "debug:release runtime подготовлен",
    "debug:release runtime активирован",
  ])
  expect(diagnostics[3]?.details).toEqual({
    error: "first failed",
    request: releaseRequest.url,
  })
})

test("startup passes one frozen dependency object and prepare stays inert", async () => {
  let received: unknown
  const calls: string[] = []
  const candidate = runtime("candidate", calls)
  const factory: ReleaseFactory = (dependencies) => {
    received = dependencies
    return candidate
  }
  const host = createReleaseHost(releaseRequest, loader([factory]))

  expect(host.dependencies).toBe(host.dependencies)
  expect(Object.isFrozen(host.dependencies)).toBeTrue()
  expect(Object.isFrozen(host.dependencies.loader)).toBeTrue()
  expect(Object.isFrozen(host.dependencies.runtime)).toBeTrue()

  await captureDiagnostics(async () => {
    expect(await host.prepare()).toBe(candidate)
    expect(received).toBe(host.dependencies)
    expect(calls).toEqual([])

    await host.activate(candidate)
  })
  expect(calls).toEqual(["candidate:start"])
})

test("startup registers browser listeners synchronously and extends dispatched events", async () => {
  const listeners = new Map<string, (event: never) => void>()
  const calls: string[] = []
  const host = {
    dependencies: {} as never,
    boot: async () => { calls.push("boot") },
    prepare: async () => runtime("unused", calls),
    activate: async () => {},
    fetch: async () => {
      calls.push("fetch")
      return new Response("release")
    },
    message: async () => { calls.push("message") },
  }
  const scope = {
    clients: {claim: async () => { calls.push("claim") }},
    skipWaiting: async () => { calls.push("skip") },
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, listener)
    },
  } as StartupEventScope

  registerReleaseListeners(scope, host)
  expect([...listeners.keys()]).toEqual(["install", "activate", "fetch", "message"])

  let fetchPromise: Promise<Response> | null = null
  let fetchLifetime: Promise<unknown> | null = null
  listeners.get("fetch")!({
    respondWith(promise: Promise<Response>) { fetchPromise = promise },
    waitUntil(promise: Promise<unknown>) { fetchLifetime = promise },
  } as never)
  expect(fetchPromise).not.toBeNull()
  expect(fetchLifetime).not.toBeNull()
  expect(fetchLifetime).toBe(fetchPromise)
  expect(await (fetchPromise as unknown as Promise<Response>).then((response) => response.text()))
    .toBe("release")
  await fetchLifetime

  let messagePromise: Promise<void> | null = null
  listeners.get("message")!({
    waitUntil(promise: Promise<void>) { messagePromise = promise },
  } as never)
  expect(messagePromise).not.toBeNull()
  await messagePromise
  expect(calls).toEqual(["fetch", "message"])
})

test.serial("runtime swap sends new events to candidate and destroys old after in-flight work", async () => {
  const calls: string[] = []
  const oldFetch = deferred<Response>()
  const old = runtime("old", calls, {fetch: () => oldFetch.promise})
  const next = runtime("next", calls, {fetch: async () => new Response("next")})
  const host = createReleaseHost(releaseRequest, loader([() => old, () => next]))

  const {diagnostics} = await captureDiagnostics(async () => {
    await host.boot()
    const pendingOld = host.fetch({request: new Request("http://127.0.0.1:4444/old")} as FetchEvent)
    const candidate = await host.prepare(new Request(
      "http://127.0.0.1:4444/@cosmos/release?env=service&version=0.1.4",
    ))
    const activation = host.activate(candidate)
    await Promise.resolve()

    expect(await (await host.fetch({
      request: new Request("http://127.0.0.1:4444/new"),
    } as FetchEvent)).text()).toBe("next")
    expect(calls).toEqual(["old:start", "old:fetch", "next:start", "next:fetch"])

    oldFetch.resolve(new Response("old"))
    expect(await (await pendingOld).text()).toBe("old")
    await activation
  })
  expect(calls).toEqual([
    "old:start",
    "old:fetch",
    "next:start",
    "next:fetch",
    "old:destroy",
  ])
  expect(diagnostics.map(({event}) => event)).toEqual([
    "bootstrap release начат",
    "release artifact выбран",
    "release runtime подготовлен",
    "release runtime активирован",
    "release artifact выбран",
    "release runtime подготовлен",
    "release runtime активирован",
  ])
})

function loader(factories: ReleaseFactory[]): ReleaseLoader {
  return {
    verify: (response) => response,
    cache: async () => {},
    read: async () => new Response("fixture release"),
    run(_source, bindings) {
      const module = bindings?.module as {exports: {default?: ReleaseFactory}}
      const factory = factories.shift()
      if (!factory) throw new Error("Unexpected release preparation")
      module.exports.default = factory
    },
  }
}

function runtime(
  name: string,
  calls: string[],
  options: {
    startError?: Error
    fetch?: (event: FetchEvent) => Promise<Response>
  } = {},
): ReleaseRuntime {
  let destroyed = false
  return {
    async start() {
      calls.push(`${name}:start`)
      if (options.startError) throw options.startError
    },
    async fetch(event) {
      calls.push(`${name}:fetch`)
      return await (options.fetch?.(event) ?? Promise.resolve(new Response(name)))
    },
    async message() {
      calls.push(`${name}:message`)
    },
    async destroy() {
      if (destroyed) return
      destroyed = true
      calls.push(`${name}:destroy`)
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accepted, rejected) => {
    resolve = accepted
    reject = rejected
  })
  return {promise, resolve, reject}
}
