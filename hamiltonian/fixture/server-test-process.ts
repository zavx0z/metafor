/**
 * Изолированный process fixture интеграционных тестов. До импорта штатного
 * singleton server он подменяет только внешние build/Web Push effects.
 */
import {mock} from "bun:test"
import * as productionFs from "node:fs"
import {PeerProcessSupervisor as ProductionPeerProcessSupervisor} from "../peer-supervisor.ts"
import {hamiltonianServiceWorkerRelease} from "../update/host/browser-release.ts"

type SourceWatchListener = (
  eventType: "rename" | "change",
  filename: string | Buffer<ArrayBufferLike> | null,
) => void

const sourceWatchListeners = new Set<SourceWatchListener>()
const fixtureWatch = ((...args: unknown[]) => {
  const optionsOrListener = args[1]
  const listener = (typeof optionsOrListener === "function" ? optionsOrListener : args[2]) as
    | SourceWatchListener
    | undefined
  if (listener !== undefined) sourceWatchListeners.add(listener)
  const watcher = Reflect.apply(productionFs.watch, productionFs, args) as productionFs.FSWatcher
  if (listener !== undefined) watcher.once("close", () => sourceWatchListeners.delete(listener))
  return watcher
}) as typeof productionFs.watch

mock.module("node:fs", () => ({...productionFs, watch: fixtureWatch}))

type PeerSupervisorOptions = ConstructorParameters<typeof ProductionPeerProcessSupervisor>[0]
let peerStateObserver: PeerSupervisorOptions["onState"]
let nextPeerBeginFailure: Error | null = null

class FixturePeerProcessSupervisor extends ProductionPeerProcessSupervisor {
  constructor(options: PeerSupervisorOptions) {
    super(options)
    peerStateObserver = options.onState
  }

  override async begin(peerId: string, sessionEpoch: string): Promise<void> {
    const failure = nextPeerBeginFailure
    nextPeerBeginFailure = null
    if (failure !== null) throw failure
    await super.begin(peerId, sessionEpoch)
  }
}

mock.module("../peer-supervisor.ts", () => ({PeerProcessSupervisor: FixturePeerProcessSupervisor}))

type FixtureBundleName =
  | "HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64"
  | "HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64"
  | "HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64"
  | "HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64"

const fixtureBundleByEntrypoint = new Map<string, FixtureBundleName>([
  ["/browser/orchestration.ts", "HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64"],
  ["/visual/browser/layout-worker.ts", "HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64"],
  ["/browser/service-worker.ts", "HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64"],
  ["/pkg/web-push/src/client.ts", "HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64"],
])
const pendingBundles = new Map<FixtureBundleName, PromiseWithResolvers<string>>()
const fixtureBundles = new Map<FixtureBundleName, Promise<string>>()

for (const name of fixtureBundleByEntrypoint.values()) {
  const encoded = Bun.env[name]
  if (encoded !== undefined) {
    fixtureBundles.set(name, Promise.resolve(Buffer.from(encoded, "base64").toString("utf8")))
  } else if (Bun.env[`${name}_PENDING`] === "1") {
    const pending = Promise.withResolvers<string>()
    pendingBundles.set(name, pending)
    fixtureBundles.set(name, pending.promise)
  }
}

const productionBuild = Bun.build.bind(Bun)
Bun.build = ((options: Bun.BuildConfig) => {
  const entrypoint = String(options.entrypoints?.[0] ?? "").replaceAll("\\", "/")
  const fixtureName = [...fixtureBundleByEntrypoint]
    .find(([suffix]) => entrypoint.endsWith(suffix))?.[1]
  const source = fixtureName === undefined ? undefined : fixtureBundles.get(fixtureName)
  if (source === undefined) return productionBuild(options)
  return source.then((text) => ({
    success: true,
    logs: [],
    outputs: [{text: async () => text}],
  })) as ReturnType<typeof Bun.build>
}) as typeof Bun.build

const pendingWebPush = new Map<number, PromiseWithResolvers<unknown>>()
let nextWebPushRequestId = 0

if (Bun.env.HAMILTONIAN_FIXTURE_WEB_PUSH_IPC === "1") {
  mock.module("@metafor/web-push/server/bun", () => ({
    createBunWebPushVapidCredentials: (subject = "mailto:hamiltonian@localhost") => ({
      schema: 1 as const,
      subject,
      publicKey: "hamiltonian-fixture-public-key",
      privateKey: "hamiltonian-fixture-private-key",
    }),
    createBunWebPushSender: (options: {
      subject: string
      publicKey: string
      privateKey: string
    }) => async (
      subscription: unknown,
      payload: string,
      requestOptions: {ttl?: number; urgency?: string; topic?: string; timeout?: number},
    ) => {
      const requestId = ++nextWebPushRequestId
      const pending = Promise.withResolvers<unknown>()
      pendingWebPush.set(requestId, pending)
      process.send?.({
        kind: "hamiltonian-test-web-push",
        requestId,
        subscription,
        payload,
        requestOptions: {
          ...(requestOptions.ttl === undefined ? {} : {TTL: requestOptions.ttl}),
          ...(requestOptions.urgency === undefined ? {} : {urgency: requestOptions.urgency}),
          ...(requestOptions.topic === undefined ? {} : {topic: requestOptions.topic}),
          ...(requestOptions.timeout === undefined ? {} : {timeout: requestOptions.timeout}),
          vapidDetails: {
            subject: options.subject,
            publicKey: options.publicKey,
            privateKey: options.privateKey,
          },
        },
      })
      const result = await pending.promise
      return typeof result === "object" && result !== null ? result : {}
    },
  }))
}

process.on("message", (rawMessage) => {
  const message = rawMessage as {
    kind?: string
    name?: string
    requestId?: number
    ok?: boolean
    source?: string
    value?: unknown
    error?: string
  }
  if (message.kind === "hamiltonian-test-bundle-result") {
    const name = message.name as FixtureBundleName
    const pending = pendingBundles.get(name)
    if (!pending) return
    pendingBundles.delete(name)
    if (message.ok) pending.resolve(message.source ?? "")
    else pending.reject(new Error(message.error ?? "Hamiltonian fixture bundle failed"))
    return
  }
  if (message.kind === "hamiltonian-test-web-push-result" && typeof message.requestId === "number") {
    const pending = pendingWebPush.get(message.requestId)
    if (!pending) return
    pendingWebPush.delete(message.requestId)
    if (message.ok) pending.resolve(message.value)
    else pending.reject(new Error(message.error ?? "Hamiltonian fixture Web Push failed"))
  }
})

const {server, stopHamiltonianServer} = await import("../server.ts")
const {
  bunReady,
  getHamiltonianStatus,
  identity,
  placement,
  token,
  version,
} = await import("../server-runtime.ts")
const initialStatus = getHamiltonianStatus()

let bunRebirthOperations: Promise<void> = Promise.resolve()

function triggerBunProcessRebirth(role: string) {
  const operation = bunRebirthOperations.then(async () => {
    const before = getHamiltonianStatus().serverEmbodiments[role]
    if (before?.pid === null || before?.pid === undefined) {
      throw new Error(`Hamiltonian fixture cannot crash missing Bun role: ${role}`)
    }
    process.kill(before.pid, "SIGKILL")
    const deadline = Date.now() + 10_000
    while (true) {
      const replacement = getHamiltonianStatus().serverEmbodiments[role]
      if (
        replacement?.state === "ready" &&
        replacement.pid !== before.pid &&
        replacement.incarnation !== before.incarnation
      ) return replacement
      if (Date.now() >= deadline) throw new Error(`Hamiltonian Bun role did not recover: ${role}`)
      await Bun.sleep(5)
    }
  })
  bunRebirthOperations = operation.then(() => undefined, () => undefined)
  return operation
}

async function updateFixtureServiceWorkerRelease(source: string) {
  const target = hamiltonianServiceWorkerRelease(source)
  fixtureBundles.set("HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64", Promise.resolve(source))
  const eventOffset = getHamiltonianStatus().events.length
  const listener = sourceWatchListeners.values().next().value
  if (listener === undefined) throw new Error("Hamiltonian source watcher was not captured by fixture")
  listener("change", "service-worker.ts")
  const deadline = Date.now() + 10_000
  while (true) {
    const status = getHamiltonianStatus()
    const sourceUpdateObserved = status.events.slice(eventOffset).some(({kind}) => kind === "source-update")
    const staleApplicationsRevoked = status.connections.every((connection) =>
      !connection.identityConfirmed ||
      connection.workerCodeVersion === target.version ||
      connection.workerUpdateRequired
    )
    if (sourceUpdateObserved && staleApplicationsRevoked) return target
    if (Date.now() >= deadline) throw new Error("Hamiltonian fixture source update timed out")
    await Bun.sleep(5)
  }
}

process.send?.({
  kind: "hamiltonian-test-ready",
  server: {
    url: server.url.href,
    hostname: server.hostname,
    port: server.port,
    protocol: server.protocol,
  },
  identity,
  version,
  token,
  hostEpoch: initialStatus.hostEpoch,
  placement,
})

void bunReady.then((embodiments) => {
  process.send?.({kind: "hamiltonian-test-bun-ready", embodiments})
})

process.on("message", async (rawMessage) => {
  const message = rawMessage as {
    kind?: string
    id?: number
    command?: string
    args?: unknown[]
  }
  if (message.kind !== "hamiltonian-test-command" || typeof message.id !== "number") return
  try {
    const args = message.args ?? []
    let value: unknown
    switch (message.command) {
      case "rebirth-bun":
        value = await triggerBunProcessRebirth(
          typeof args[0] === "string" ? args[0] : placement === "server" ? "main" : "main-probe",
        )
        break
      case "crash-bun": {
        const role = typeof args[0] === "string" ? args[0] : placement === "server" ? "main" : "main-probe"
        const pid = getHamiltonianStatus().serverEmbodiments[role]?.pid ?? null
        if (pid !== null) process.kill(pid, "SIGKILL")
        value = pid
        break
      }
      case "crash-peer": {
        const pid = getHamiltonianStatus().peer.process.pid
        if (pid !== null) process.kill(pid, "SIGKILL")
        value = pid
        break
      }
      case "fail-next-peer-begin":
        nextPeerBeginFailure = new Error(String(args[0] ?? "Hamiltonian fixture peer begin failed"))
        value = null
        break
      case "report-peer-error":
        peerStateObserver?.(
          getHamiltonianStatus().peer.snapshot,
          String(args[1] ?? ""),
          String(args[0] ?? ""),
        )
        value = null
        break
      case "update-service-worker-release":
        value = await updateFixtureServiceWorkerRelease(String(args[0] ?? ""))
        break
      case "stop":
        await stopHamiltonianServer()
        value = {serverEmbodiments: getHamiltonianStatus().serverEmbodiments}
        break
      default:
        throw new Error(`Unknown Hamiltonian fixture command: ${message.command}`)
    }
    process.send?.({kind: "hamiltonian-test-command-result", id: message.id, ok: true, value})
    if (message.command === "stop") setTimeout(() => process.exit(0), 0)
  } catch (error) {
    process.send?.({
      kind: "hamiltonian-test-command-result",
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
