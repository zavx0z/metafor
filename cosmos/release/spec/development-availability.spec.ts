import {expect, test} from "bun:test"
import {createOptionalDevelopment} from "../server/development-availability"
import {configuredOptionalDevelopment} from "../server/development"
import {mkdtemp, mkdir, writeFile, realpath, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"

test("Создание optional wrapper и независимый HTTP health не ждут Source initializer", async () => {
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  let attempts = 0, created = false
  const creating = createOptionalDevelopment({
    async initialize() {
      attempts++
      started.resolve()
      await gate.promise
      return {async fetch() {return Response.json({ready: true})}, async subscribe() {return () => {}}, async close() {}}
    },
    authorize() {},
  }).then(surface => {
    created = true
    return surface
  })
  try {
    await Bun.sleep(0)
    expect(created).toBeTrue()
    expect(attempts).toBe(0)
    const surface = await creating
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request, host) {
        return new URL(request.url).pathname.startsWith("/cosmos/development/")
          ? surface.fetch(request, host)
          : Response.json({ready: true})
      },
    })
    const pending = fetch(new URL("/cosmos/development/catalog", server.url))
    try {
      await started.promise
      const health = await fetch(new URL("/health", server.url), {signal: AbortSignal.timeout(1_000)})
      expect(health.status).toBe(200)
      expect(await health.json()).toEqual({ready: true})
      gate.resolve()
      expect((await pending).status).toBe(200)
    } finally {
      gate.resolve()
      await pending
      await server.stop(true)
    }
  } finally {
    gate.resolve()
    await (await creating).close()
  }
})

test("Неавторизованный первый Source request не запускает initializer", async () => {
  let attempts = 0, authorized = false
  const timeouts: number[] = []
  const source = await createOptionalDevelopment({
    async initialize() {
      attempts++
      return {async fetch() {return Response.json({ready: true})}, async subscribe() {return () => {}}, async close() {}}
    },
    authorize() {if (!authorized) throw new Error("Unauthorized")},
  })
  const host = {timeout(_request: Request, seconds: number) {timeouts.push(seconds)}}
  const request = () => new Request("http://localhost/cosmos/development/catalog")
  try {
    expect((await source.fetch(request(), host)).status).toBe(403)
    expect(attempts).toBe(0)
    expect(timeouts).toEqual([])
    authorized = true
    expect((await source.fetch(request(), host)).status).toBe(200)
    expect(attempts).toBe(1)
    expect(timeouts).toEqual([60])
  } finally {await source.close()}
})

test("Одновременные первые Source reads разделяют один initializer", async () => {
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  let attempts = 0, reads = 0
  const timeouts: {request: Request, seconds: number}[] = []
  const host = {timeout(request: Request, seconds: number) {timeouts.push({request, seconds})}}
  const source = await createOptionalDevelopment({
    async initialize() {
      attempts++
      started.resolve()
      await gate.promise
      return {
        async fetch() {
          reads++
          return Response.json({ready: true})
        },
        async subscribe() {return () => {}},
        async close() {},
      }
    },
    authorize() {},
  })
  const requests = [new Request("http://localhost/cosmos/development/catalog"), new Request("http://localhost/cosmos/development/catalog")]
  const pending = requests.map(request => source.fetch(request, host))
  try {
    await started.promise
    await Bun.sleep(0)
    expect(attempts).toBe(1)
    expect(reads).toBe(0)
    expect(timeouts).toEqual(requests.map(request => ({request, seconds: 60})))
    gate.resolve()
    expect((await Promise.all(pending)).map(response => response.status)).toEqual([200, 200])
    expect(attempts).toBe(1)
    expect(reads).toBe(2)
  } finally {
    gate.resolve()
    await Promise.all(pending)
    await source.close()
  }
})

test("Внутренняя Source subscription лениво подготавливает окружение без HTTP authorization", async () => {
  let attempts = 0, subscriptions = 0, unsubscribed = 0
  const scope = {agentId: "source-agent"}
  const receive = () => {}
  const source = await createOptionalDevelopment({
    async initialize() {
      attempts++
      return {
        async fetch() {return new Response()},
        async subscribe(actualScope: unknown, actualReceive: (value: unknown) => void) {
          expect(actualScope).toBe(scope)
          expect(actualReceive).toBe(receive)
          subscriptions++
          return () => {unsubscribed++}
        },
        async close() {},
      }
    },
    authorize() {throw new Error("HTTP authorization must not run for an internal subscription")},
  })
  try {
    expect(attempts).toBe(0)
    const unsubscribe = await source.subscribe(scope, receive)
    expect(attempts).toBe(1)
    expect(subscriptions).toBe(1)
    unsubscribe()
    expect(unsubscribed).toBe(1)
  } finally {await source.close()}
})

test("Close ждёт поздний Source resource, закрывает его один раз и отклоняет pending read", async () => {
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const closingResource = Promise.withResolvers<void>()
  const releaseResource = Promise.withResolvers<void>()
  let reads = 0, closed = 0, completed = false
  const source = await createOptionalDevelopment({
    async initialize() {
      started.resolve()
      await gate.promise
      return {
        async fetch() {
          reads++
          return Response.json({ready: true})
        },
        async subscribe() {return () => {}},
        async close() {
          closed++
          closingResource.resolve()
          await releaseResource.promise
        },
      }
    },
    authorize() {},
  })
  const pending = source.fetch(new Request("http://localhost/cosmos/development/catalog"), {})
  await started.promise
  const closing = source.close().then(() => {completed = true})
  try {
    await Bun.sleep(0)
    expect(completed).toBeFalse()
    expect(closed).toBe(0)
    gate.resolve()
    await closingResource.promise
    expect(completed).toBeFalse()
    expect(reads).toBe(0)
    releaseResource.resolve()
    await closing
    expect((await pending).status).toBe(503)
    await source.close()
    expect(closed).toBe(1)
    expect((await source.fetch(new Request("http://localhost/cosmos/development/catalog"), {})).status).toBe(503)
    await expect(source.subscribe({}, () => {})).rejects.toThrow()
    expect(reads).toBe(0)
  } finally {
    gate.resolve()
    releaseResource.resolve()
    await closing
    await pending
  }
})

test("optional source failure remains visible, preserves the host and retries only on explicit intent", async () => {
  let attempts = 0, closed = 0, failures = 0, authorized = true
  const source = await createOptionalDevelopment({
    async initialize() {
      attempts++
      if (attempts === 1) throw new Error("PRIVATE TOKEN /private/authority.json")
      return {async fetch() {return Response.json({packages: ["metafor"]})}, async subscribe() {return () => {}}, async close() {closed++}}
    },
    authorize() {if (!authorized) throw new Error("Unauthorized")},
    failed() {failures++},
  })
  const request = () => new Request("http://localhost/cosmos/development/catalog")
  try {
    for (let count = 0; count < 3; count++) {
      const response = await source.fetch(request(), {})
      expect(response.status).toBe(503)
      const message = await response.text()
      expect(message).toContain("workspace_unavailable")
      expect(message).not.toContain("PRIVATE")
    }
    expect(attempts).toBe(1)
    expect(failures).toBe(1)
    await expect(source.subscribe({}, () => {})).rejects.toThrow("обновите каталог")
    authorized = false
    expect((await source.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), {})).status).toBe(403)
    expect(attempts).toBe(1)
    authorized = true
    expect((await source.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), {})).status).toBe(200)
    expect(await (await source.fetch(request(), {})).json()).toEqual({packages: ["metafor"]})
    expect(attempts).toBe(2)
  } finally {await source.close()}
  expect(closed).toBe(1)
})

test("broken assigned package manifest does not reject optional initialization and repairs through one explicit retry", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-optional-development-")))
  const root = join(directory, "source"), config = join(directory, "authority.json")
  await mkdir(root)
  await writeFile(join(root, "package.json"), "{ broken-manifest")
  await writeFile(config, JSON.stringify({version: 1, id: "own", rootPackage: "metafor", roots: [{name: "metafor", directory: root, writable: true}],
    stateDirectory: join(directory, "state"), execution: {connectionId: "fixture", connections: [{id: "fixture", label: "Fixture", enabled: true,
      provider: "codex", peer: {peerId: "assigned-peer", executorId: "assigned-executor"}}]}}), {mode: 0o600})
  const host = {requestIP: () => ({address: "127.0.0.1"})}
  let surface: Awaited<ReturnType<typeof configuredOptionalDevelopment>> | undefined
  try {
    surface = await configuredOptionalDevelopment({COSMOS_DEVELOPMENT_CONFIG: config}, null)
    const unavailable = await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
    expect(unavailable.status).toBe(503)
    expect(await unavailable.text()).not.toContain(directory)
    await writeFile(join(root, "package.json"), JSON.stringify({name: "metafor"}))
    expect((await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)).status).toBe(503)
    const retry = await surface.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", headers: {origin: "http://localhost"}, body: "{}"}), host)
    expect(retry.status).toBe(200)
    const response = await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
    expect(response.status).toBe(200)
    expect((await response.json()).packages[0]).toMatchObject({name: "metafor", resolution: "source"})
  } finally {await surface?.close(); await rm(directory, {recursive: true, force: true})}
})

test("ready catalog GET is a snapshot read; explicit retry refreshes once and keeps the old snapshot on failure", async () => {
  let revision = "first", refreshes = 0, fail = false
  const timeouts: number[] = []
  const host = {timeout(_request: Request, seconds: number) {timeouts.push(seconds)}}
  const surface = await createOptionalDevelopment({
    async initialize() {return {
      async fetch() {return Response.json({revision})},
      async refreshCatalog() {refreshes++; if (fail) throw new Error("source changed during scan"); revision = "second"},
      async subscribe() {return () => {}},
      async close() {},
    }},
    authorize() {},
  })
  const catalog = () => surface.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
  const retry = () => surface.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), host)
  try {
    expect(await (await catalog()).json()).toEqual({revision: "first"})
    expect(await (await catalog()).json()).toEqual({revision: "first"})
    expect(refreshes).toBe(0)
    expect(timeouts).toEqual([60])
    expect((await retry()).status).toBe(200)
    expect(refreshes).toBe(1)
    expect(timeouts).toEqual([60, 60])
    expect(await (await catalog()).json()).toEqual({revision: "second"})
    fail = true
    expect((await retry()).status).toBe(503)
    expect(refreshes).toBe(2)
    expect(timeouts).toEqual([60, 60, 60])
    expect(await (await catalog()).json()).toEqual({revision: "second"})
    expect(timeouts).toEqual([60, 60, 60])
  } finally {await surface.close()}
})

test("assigned package manifest changes enter the catalog only after explicit refresh", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-catalog-refresh-")))
  const root = join(directory, "source"), config = join(directory, "authority.json")
  await mkdir(root)
  const manifest = join(root, "package.json")
  await writeFile(manifest, JSON.stringify({name: "metafor", dependencies: {first: "1.0.0"}}))
  await writeFile(config, JSON.stringify({version: 1, id: "own", rootPackage: "metafor", roots: [{name: "metafor", directory: root, writable: true}],
    stateDirectory: join(directory, "state"), execution: {connectionId: "fixture", connections: [{id: "fixture", label: "Fixture", enabled: true,
      provider: "codex", peer: {peerId: "assigned-peer", executorId: "assigned-executor"}}]}}), {mode: 0o600})
  const host = {requestIP: () => ({address: "127.0.0.1"})}
  let surface: Awaited<ReturnType<typeof configuredOptionalDevelopment>> | undefined
  try {
    surface = await configuredOptionalDevelopment({COSMOS_DEVELOPMENT_CONFIG: config}, null)
    const catalog = () => surface!.fetch(new Request("http://localhost/cosmos/development/catalog"), host)
    const before = await (await catalog()).json()
    await writeFile(manifest, JSON.stringify({name: "metafor", dependencies: {second: "2.0.0"}}))
    expect(await (await catalog()).json()).toEqual(before)
    const refreshed = await surface.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST",
      headers: {origin: "http://localhost"}, body: "{}"}), host)
    expect(refreshed.status).toBe(200)
    const after = await (await catalog()).json()
    expect(after.revision).not.toBe(before.revision)
    expect(after.dependencies).toMatchObject([{from: "metafor", to: "second"}])
  } finally {await surface?.close(); await rm(directory, {recursive: true, force: true})}
})

test("concurrent explicit retry requests share one ready catalog refresh", async () => {
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  let scans = 0
  const surface = await createOptionalDevelopment({
    async initialize() {return {
      async fetch() {return Response.json({ready: true})},
      async refreshCatalog() {scans++; started.resolve(); await gate.promise},
      async subscribe() {return () => {}},
      async close() {},
    }},
    authorize() {},
  })
  const request = () => surface.fetch(new Request("http://localhost/cosmos/development/retry", {method: "POST", body: "{}"}), {})
  try {
    expect((await surface.fetch(new Request("http://localhost/cosmos/development/catalog"), {})).status).toBe(200)
    const first = request(), second = request()
    await started.promise
    await Bun.sleep(0)
    expect(scans).toBe(1)
    gate.resolve()
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect(scans).toBe(1)
  } finally {gate.resolve(); await surface.close()}
})
