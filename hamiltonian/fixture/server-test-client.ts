import type {EmbodimentAuthority} from "../bun-embodiment.ts"
import {authorityKey} from "../core/runtime.js"
import type {HamiltonianWebPushOptions} from "../web-push.ts"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

type HamiltonianStatus = ReturnType<typeof import("../server-runtime.ts").getHamiltonianStatus>
type BunEmbodiments = Awaited<typeof import("../server-runtime.ts").bunReady>

export interface HamiltonianTestServerOptions {
  hostname?: string
  port?: number
  identity?: string
  version?: string
  token?: string
  tlsCertPath?: string
  tlsKeyPath?: string
  heartbeatMs?: number
  placement?: "browser" | "server"
  browserBundles?: Readonly<{
    orchestration: string | Promise<string>
    layoutWorker: string | Promise<string>
    serviceWorker: string | Promise<string>
    webPushClient?: string | Promise<string>
  }>
  webPush?: HamiltonianWebPushOptions
}

export interface HamiltonianTestServer {
  server: {
    url: URL
    hostname: string
    port: number
    protocol: string
  }
  identity: string
  version: string
  token: string
  hostEpoch: ReturnType<typeof crypto.randomUUID>
  placement: string
  bunReady: Promise<BunEmbodiments>
  bunEmbodiments: {snapshot(): BunEmbodiments}
  getStatus(): HamiltonianStatus
  rebirthBunEmbodiment(role?: string): Promise<BunEmbodiments[string]>
  crashBunEmbodimentForTest(role?: string): Promise<number | null>
  acceptsServerAuthorityForTest(candidate: EmbodimentAuthority | null): Promise<boolean>
  crashPeerProcessForTest(): Promise<number | null>
  failNextPeerBeginForTest(error: string): Promise<void>
  reportPeerErrorForTest(peerId: string, error: string): Promise<void>
  updateServiceWorkerReleaseForTest(source: string): Promise<{
    version: string
    sha256: string
  }>
  stop(): Promise<void>
}

interface ChildReadyMessage {
  kind: "hamiltonian-test-ready"
  server: {url: string; hostname: string; port: number; protocol: string}
  identity: string
  version: string
  token: string
  hostEpoch: ReturnType<typeof crypto.randomUUID>
  placement: string
}

interface ChildCommandResult {
  kind: "hamiltonian-test-command-result"
  id: number
  ok: boolean
  value?: unknown
  error?: string
}

const experimentRoot = new URL(".", import.meta.url).pathname

/** Запускает штатный singleton entrypoint в отдельном integration-test process. */
export async function createHamiltonianTestServer(
  options: HamiltonianTestServerOptions = {},
): Promise<HamiltonianTestServer> {
  const ownedStorageDirectory = options.webPush?.storagePath === undefined
    ? mkdtempSync(join(tmpdir(), "hamiltonian-server-fixture-"))
    : null
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  environment.NODE_ENV = "test"
  environment.HAMILTONIAN_HOST = options.hostname ?? "127.0.0.1"
  environment.HAMILTONIAN_PORT = String(options.port ?? 0)
  environment.HAMILTONIAN_ID = options.identity ?? "hamiltonian-lab"
  environment.HAMILTONIAN_VERSION = options.version ?? "v1"
  environment.HAMILTONIAN_TOKEN = options.token ?? crypto.randomUUID()
  environment.HAMILTONIAN_HEARTBEAT_MS = String(options.heartbeatMs ?? 10_000)
  environment.HAMILTONIAN_PLACEMENT = options.placement ?? "browser"
  setOptionalEnvironment(environment, "HAMILTONIAN_TLS_CERT", options.tlsCertPath)
  setOptionalEnvironment(environment, "HAMILTONIAN_TLS_KEY", options.tlsKeyPath)
  setOptionalEnvironment(environment, "HAMILTONIAN_VAPID_PUBLIC_KEY", options.webPush?.publicKey)
  setOptionalEnvironment(environment, "HAMILTONIAN_VAPID_PRIVATE_KEY", options.webPush?.privateKey)
  setOptionalEnvironment(environment, "HAMILTONIAN_VAPID_SUBJECT", options.webPush?.subject)
  environment.HAMILTONIAN_WEB_PUSH_STORAGE_PATH = options.webPush?.storagePath ??
    join(ownedStorageDirectory!, "web-push.json")
  if (options.webPush?.send === undefined) delete environment.HAMILTONIAN_FIXTURE_WEB_PUSH_IPC
  else environment.HAMILTONIAN_FIXTURE_WEB_PUSH_IPC = "1"

  if (options.browserBundles === undefined) {
    delete environment.HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64
    delete environment.HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64_PENDING
    delete environment.HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64
    delete environment.HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64_PENDING
    delete environment.HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64
    delete environment.HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64_PENDING
    delete environment.HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64
    delete environment.HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64_PENDING
  } else {
    configureTestBundle(environment, "HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64", options.browserBundles.orchestration)
    configureTestBundle(environment, "HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64", options.browserBundles.layoutWorker)
    configureTestBundle(environment, "HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64", options.browserBundles.serviceWorker)
    if (options.browserBundles.webPushClient === undefined) {
      delete environment.HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64
      delete environment.HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64_PENDING
    } else {
      configureTestBundle(
        environment,
        "HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64",
        options.browserBundles.webPushClient,
      )
    }
  }

  let nextCommandId = 0
  let stopped = false
  const pendingCommands = new Map<number, {
    resolve(value: unknown): void
    reject(error: Error): void
  }>()
  let resolveReady!: (message: ChildReadyMessage) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<ChildReadyMessage>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  let resolveBunReady!: (value: BunEmbodiments) => void
  let rejectBunReady!: (error: Error) => void
  const bunReady = new Promise<BunEmbodiments>((resolve, reject) => {
    resolveBunReady = resolve
    rejectBunReady = reject
  })

  const child = Bun.spawn({
    cmd: [process.execPath, "run", "server-test-process.ts"],
    cwd: experimentRoot,
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    ipc: (rawMessage, subprocess) => {
      const message = rawMessage as Record<string, unknown>
      if (message.kind === "hamiltonian-test-ready") {
        resolveReady(message as unknown as ChildReadyMessage)
        return
      }
      if (message.kind === "hamiltonian-test-bun-ready") {
        resolveBunReady(message.embodiments as BunEmbodiments)
        return
      }
      if (message.kind === "hamiltonian-test-command-result") {
        const result = message as unknown as ChildCommandResult
        const pending = pendingCommands.get(result.id)
        if (!pending) return
        pendingCommands.delete(result.id)
        if (result.ok) pending.resolve(result.value)
        else pending.reject(new Error(result.error ?? "Hamiltonian test command failed"))
        return
      }
      if (message.kind === "hamiltonian-test-web-push") {
        const requestId = Number(message.requestId)
        void Promise.resolve(options.webPush?.send?.(
          message.subscription as Parameters<NonNullable<HamiltonianWebPushOptions["send"]>>[0],
          String(message.payload),
          message.requestOptions as Parameters<NonNullable<HamiltonianWebPushOptions["send"]>>[2],
        )).then(
          (value) => subprocess.send({
            kind: "hamiltonian-test-web-push-result", requestId, ok: true, value,
          }),
          (error) => subprocess.send({
            kind: "hamiltonian-test-web-push-result", requestId, ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      }
    },
  })

  if (options.browserBundles !== undefined) {
    forwardTestBundle(child, "HAMILTONIAN_FIXTURE_ORCHESTRATION_BUNDLE_BASE64", options.browserBundles.orchestration)
    forwardTestBundle(child, "HAMILTONIAN_FIXTURE_LAYOUT_WORKER_BUNDLE_BASE64", options.browserBundles.layoutWorker)
    forwardTestBundle(child, "HAMILTONIAN_FIXTURE_SERVICE_WORKER_BUNDLE_BASE64", options.browserBundles.serviceWorker)
    if (options.browserBundles.webPushClient !== undefined) {
      forwardTestBundle(child, "HAMILTONIAN_FIXTURE_WEB_PUSH_CLIENT_BUNDLE_BASE64", options.browserBundles.webPushClient)
    }
  }

  const command = <T>(name: string, args: unknown[] = []): Promise<T> => {
    const id = ++nextCommandId
    return new Promise<T>((resolve, reject) => {
      pendingCommands.set(id, {resolve: (value) => resolve(value as T), reject})
      child.send({kind: "hamiltonian-test-command", id, command: name, args})
    })
  }

  void child.exited.then(async (exitCode) => {
    if (ownedStorageDirectory !== null) rmSync(ownedStorageDirectory, {recursive: true, force: true})
    if (stopped && exitCode === 0) return
    const stderr = await new Response(child.stderr).text()
    const error = new Error(`Hamiltonian test process exited (${exitCode}): ${stderr.trim()}`)
    rejectReady(error)
    rejectBunReady(error)
    for (const pending of pendingCommands.values()) pending.reject(error)
    pendingCommands.clear()
  })

  const started = await Promise.race([
    ready,
    Bun.sleep(10_000).then(() => {
      throw new Error("Hamiltonian test process start timed out")
    }),
  ])
  const serverInfo = {
    url: new URL(started.server.url),
    hostname: started.server.hostname,
    port: started.server.port,
    protocol: started.server.protocol,
  }
  let lastServerEmbodiments: BunEmbodiments = {}
  let bufferedStatus: HamiltonianStatus | null = null
  void bunReady.then((value) => {
    lastServerEmbodiments = value
  })

  return {
    server: serverInfo,
    identity: started.identity,
    version: started.version,
    token: started.token,
    hostEpoch: started.hostEpoch,
    placement: started.placement,
    bunReady,
    bunEmbodiments: {
      snapshot: () => {
        if (!stopped) {
          const current = readStatus(serverInfo.url, started.token)
          lastServerEmbodiments = current.serverEmbodiments
        }
        return lastServerEmbodiments
      },
    },
    getStatus() {
      const current = bufferedStatus ?? readStatus(serverInfo.url, started.token)
      bufferedStatus = null
      lastServerEmbodiments = current.serverEmbodiments
      return current
    },
    rebirthBunEmbodiment: (role) => command("rebirth-bun", role === undefined ? [] : [role]),
    crashBunEmbodimentForTest: (role) => command("crash-bun", role === undefined ? [] : [role]),
    acceptsServerAuthorityForTest: async (candidate) => {
      const current = readStatus(serverInfo.url, started.token).serverAuthority
      return started.placement === "server" && authorityKey(candidate) === authorityKey(current)
    },
    crashPeerProcessForTest: () => command("crash-peer"),
    failNextPeerBeginForTest: async (error) => {
      await command("fail-next-peer-begin", [error])
    },
    reportPeerErrorForTest: async (peerId, error) => {
      await command("report-peer-error", [peerId, error])
    },
    updateServiceWorkerReleaseForTest: (source) => command("update-service-release", [source]),
    async stop() {
      if (stopped) return
      stopped = true
      try {
        const result = await command<{serverEmbodiments: BunEmbodiments}>("stop")
        lastServerEmbodiments = result.serverEmbodiments
      } finally {
        await child.exited
      }
    },
  }
}

function setOptionalEnvironment(environment: Record<string, string>, name: string, value: string | undefined): void {
  if (value === undefined) delete environment[name]
  else environment[name] = value
}

function encodeBundle(source: string): string {
  return Buffer.from(source).toString("base64")
}

function configureTestBundle(
  environment: Record<string, string>,
  name: string,
  source: string | Promise<string>,
): void {
  if (typeof source === "string") {
    environment[name] = encodeBundle(source)
    delete environment[`${name}_PENDING`]
    return
  }
  delete environment[name]
  environment[`${name}_PENDING`] = "1"
}

function forwardTestBundle(
  child: Bun.Subprocess,
  name: string,
  source: string | Promise<string>,
): void {
  if (typeof source === "string") return
  void source.then(
    (value) => child.send({kind: "hamiltonian-test-bundle-result", name, ok: true, source: value}),
    (error) => child.send({
      kind: "hamiltonian-test-bundle-result",
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function readStatus(serverUrl: URL, authorizationToken: string): HamiltonianStatus {
  const response = Bun.spawnSync({
    cmd: [
      "/usr/bin/curl",
      "-sS",
      "-H",
      `authorization: Bearer ${authorizationToken}`,
      new URL("/lab/status", serverUrl).href,
    ],
    stdout: "pipe",
    stderr: "pipe",
  })
  if (response.exitCode !== 0) throw new Error(response.stderr.toString())
  return JSON.parse(response.stdout.toString()) as HamiltonianStatus
}
