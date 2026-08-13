import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  hamiltonianDataChannelTransportId,
  hamiltonianLifecycleEntityId,
  hamiltonianLogicalContourId,
  hamiltonianRtcPeerEntityId,
  isHamiltonianLifecycleOwnershipClosed,
  isHamiltonianNodeSystemDeclaration,
  type HamiltonianNodeSystemDeclaration,
} from "./core/lifecycle.js"
import {hamiltonianBrowserNodeId} from "./core/orchestration.js"
import {sourceRevisionRequiresReload} from "./update/browser/page-update.js"
import {HamiltonianLifecycleProjection} from "./browser/orchestration/lifecycle-projection.ts"
import {HAMILTONIAN_SERVICE_WORKER_CODE_VERSION} from "./update/browser/service-worker-code-version.ts"
import {
  createHamiltonianHost,
  hamiltonianBrowserSourceRevision,
  hamiltonianServerBootstrapDeclaration,
  hamiltonianServiceWorkerApplicationMessageAllowed,
  hamiltonianServiceWorkerRelease,
} from "./host.ts"
import {WeriftPeer, type PeerSignal} from "./peer/werift-peer.ts"

const running: Array<ReturnType<typeof createHamiltonianHost>> = []
const temporaryDirectories: string[] = []
const browserRuntimeStartedAt = new Map<string, number>()
let nextBrowserRuntimeStartedAt = 1

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${label}`)
  return value
}

function browserIdentityMessage(
  profileId: string,
  workerIdentity: string,
  workerRuntimeIncarnation: string,
  resumeNonce: string,
  extra: Record<string, unknown> = {},
) {
  const workerCodeVersion = typeof extra.workerCodeVersion === "string"
    ? extra.workerCodeVersion
    : HAMILTONIAN_SERVICE_WORKER_CODE_VERSION
  return {
    kind: "identity",
    workerIdentity,
    workerRuntimeIncarnation,
    workerCodeVersion,
    resumeNonce,
    lifecycleSnapshot: browserProfileLifecycleSnapshot(
      profileId,
      workerIdentity,
      workerRuntimeIncarnation,
      [],
      workerCodeVersion,
    ),
    ...extra,
  }
}

function browserProfileLifecycleSnapshot(
  profileId: string,
  workerIdentity: string,
  workerRuntimeIncarnation: string,
  additional: Array<ReturnType<typeof createHamiltonianLifecycleObservation>> = [],
  workerCodeVersion = HAMILTONIAN_SERVICE_WORKER_CODE_VERSION,
) {
  const browserEntityId = hamiltonianBrowserNodeId(profileId)
  const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
  const runtimeKey = `${profileId}\u0000${workerRuntimeIncarnation}`
  const startedAt = browserRuntimeStartedAt.get(runtimeKey) ?? nextBrowserRuntimeStartedAt++
  browserRuntimeStartedAt.set(runtimeKey, startedAt)
  const source = new HamiltonianLifecycleSource({
    id: workerEntityId,
    kind: "service-worker",
    incarnation: workerRuntimeIncarnation,
    startedAt,
  })
  const journal = new HamiltonianLifecycleRetainedJournal(workerEntityId)
  journal.observe(source.next(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: browserEntityId,
    subjectKind: "browser-runtime",
    ownerId: browserEntityId,
    attributes: {profileId, runtime: "Chrome", state: "active"},
  })))
  journal.observe(source.next(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "born",
    subjectId: workerEntityId,
    subjectKind: "service-worker",
    ownerId: browserEntityId,
    attributes: {
      identity: workerIdentity,
      runtimeIncarnation: workerRuntimeIncarnation,
      codeVersion: workerCodeVersion,
      state: "active",
    },
  })))
  for (const observation of additional) journal.observe(source.next(observation))
  return journal.snapshot()
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((host) => host.stop()))
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

async function nextMessage(
  socket: WebSocket,
  kind: string,
  accept: (message: Record<string, unknown>) => boolean = () => true,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${kind}`)), timeoutMs)
    const receive = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>
      if (message.kind !== kind || !accept(message)) return
      clearTimeout(timeout)
      socket.removeEventListener("message", receive)
      resolve(message)
    }
    socket.addEventListener("message", receive)
  })
}

async function openSocket(
  url: URL,
  frames?: Array<Record<string, unknown>>,
): Promise<WebSocket> {
  if (url.pathname === "/control") {
    url.searchParams.set("transport", url.searchParams.get("transport") ?? `websocket:${crypto.randomUUID()}`)
    url.searchParams.set("worker", url.searchParams.get("worker") ?? `service-worker:${crypto.randomUUID()}`)
  }
  const socket = new WebSocket(url)
  if (frames) {
    socket.addEventListener("message", (event) => {
      frames.push(JSON.parse(String(event.data)) as Record<string, unknown>)
    })
  }
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), {once: true})
    socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
  })
  return socket
}

async function waitUntil(
  predicate: () => boolean,
  label: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
    await Bun.sleep(1)
  }
}

async function registerTestPushSubscription(
  host: ReturnType<typeof createHamiltonianHost>,
  workerIdentity: string,
  deviceId: string,
  endpoint: string,
  frames?: Array<Record<string, unknown>>,
): Promise<WebSocket> {
  const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
  const controlUrl = new URL("/control", host.server.url)
  controlUrl.protocol = "ws:"
  controlUrl.searchParams.set("token", host.token)
  controlUrl.searchParams.set("device", deviceId)
  controlUrl.searchParams.set("worker", workerEntityId)
  const socket = await openSocket(controlUrl)
  await nextMessage(socket, "hello")
  if (frames) {
    socket.addEventListener("message", (event) => {
      frames.push(JSON.parse(String(event.data)) as Record<string, unknown>)
    })
  }
  socket.send(JSON.stringify(browserIdentityMessage(
    deviceId,
    workerIdentity,
    `registration-runtime:${workerIdentity}`,
    `registration-resume:${workerIdentity}`,
  )))
  await nextMessage(socket, "service-worker-current")
  const registrationId = crypto.randomUUID()
  const confirmed = nextMessage(socket, "push-subscription-confirmed", (message) =>
    message.registrationId === registrationId)
  socket.send(JSON.stringify({
    kind: "push-subscription",
    registrationId,
    subscription: {
      endpoint,
      expirationTime: null,
      keys: {p256dh: "public_key", auth: "auth_key"},
    },
  }))
  await confirmed
  return socket
}

async function openDirectBrowserPeer(
  host: ReturnType<typeof createHamiltonianHost>,
  {
    deviceId,
    tabId,
    workerIdentity = `fixture-worker:${deviceId}`,
    workerRuntimeIncarnation = `fixture-runtime:${deviceId}`,
    resumeNonce = crypto.randomUUID(),
  }: {
    deviceId: string
    tabId: string
    workerIdentity?: string
    workerRuntimeIncarnation?: string
    resumeNonce?: string
  },
) {
  await host.bunReady
  const controlUrl = new URL("/control", host.server.url)
  controlUrl.protocol = "ws:"
  controlUrl.searchParams.set("token", host.token)
  controlUrl.searchParams.set("device", deviceId)
  controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
  const socket = await openSocket(controlUrl)
  const hello = await nextMessage(socket, "hello")

  const queuedPeers: WeriftPeer[] = []
  const peerWaiters: Array<(peer: WeriftPeer) => void> = []
  const answerers = new Map<string, WeriftPeer>()
  let currentPeerId: string | null = null
  let currentPeerGeneration = 0
  const nextPeer = async () => {
    const queued = queuedPeers.shift()
    const peer = queued ?? await new Promise<WeriftPeer>((resolve) => peerWaiters.push(resolve))
    return {peer, protocol: await peer.protocolReady, sessionEpoch: peer.sessionEpoch}
  }
  const publishPeer = (peer: WeriftPeer) => {
    const waiter = peerWaiters.shift()
    if (waiter) waiter(peer)
    else queuedPeers.push(peer)
  }
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      kind?: string
      at?: number
      seq?: number
      peerId?: string
      sessionEpoch?: string
      peerGeneration?: number
      authorityKey?: string
      tabId?: string
      signal?: PeerSignal
    }
    if (message.kind === "ping" && typeof message.at === "number" && typeof message.seq === "number") {
      socket.send(JSON.stringify({
        kind: "pong",
        at: message.at,
        seq: message.seq,
        workerIdentity,
        workerRuntimeIncarnation,
      }))
      return
    }
    if (
      message.kind !== "peer-signal" ||
      !message.peerId ||
      !message.sessionEpoch ||
      !message.peerGeneration ||
      !message.authorityKey ||
      !message.tabId ||
      !message.signal
    ) return
    if (message.peerGeneration < currentPeerGeneration) return
    let answerer = answerers.get(message.peerId) ?? null
    if (message.peerId !== currentPeerId) {
      const peerId = message.peerId
      const sessionEpoch = message.sessionEpoch
      const peerGeneration = message.peerGeneration
      const peerAuthorityKey = message.authorityKey
      const assignedTabId = message.tabId
      answerer = new WeriftPeer({
        peerId: `browser-answerer:${peerId}`,
        sessionEpoch,
        initiator: false,
        serveProtocol: false,
        onSignal: (signal) => socket.send(JSON.stringify({
          kind: "peer-signal",
          peerId,
          sessionEpoch,
          peerGeneration,
          authorityKey: peerAuthorityKey,
          tabId: assignedTabId,
          signal,
        })),
      })
      currentPeerId = peerId
      currentPeerGeneration = peerGeneration
      answerers.set(peerId, answerer)
      publishPeer(answerer)
    }
    if (answerer) void answerer.signal(message.signal)
  })

  const admitted = nextMessage(socket, "service-worker-current")
  socket.send(JSON.stringify(browserIdentityMessage(
    deviceId,
    workerIdentity,
    workerRuntimeIncarnation,
    resumeNonce,
  )))
  await admitted
  socket.send(JSON.stringify({
    kind: "tabs",
    windows: [{tabId, joinedAt: 10, visible: true}],
  }))
  const initial = await nextPeer()
  return {
    socket,
    peer: initial.peer,
    protocol: initial.protocol,
    connectionId: String(hello.connectionId),
    sessionEpoch: initial.sessionEpoch,
    workerIdentity,
    workerRuntimeIncarnation,
    resumeNonce,
    nextPeer,
  }
}

describe("isolated Hamiltonian host", () => {
  test("uses the executable Worker version by default without rewriting explicit release fixtures", () => {
    const defaultIdentity = browserIdentityMessage(
      "default-version-profile",
      "default-version-worker",
      "default-version-runtime",
      "default-version-resume",
    )
    expect(defaultIdentity.workerCodeVersion).toBe(HAMILTONIAN_SERVICE_WORKER_CODE_VERSION)
    expect(defaultIdentity.lifecycleSnapshot.envelopes.find((envelope) =>
      envelope.observation.subjectKind === "service-worker")?.observation.attributes?.codeVersion,
    ).toBe(HAMILTONIAN_SERVICE_WORKER_CODE_VERSION)

    const explicitIdentity = browserIdentityMessage(
      "explicit-version-profile",
      "explicit-version-worker",
      "explicit-version-runtime",
      "explicit-version-resume",
      {workerCodeVersion: "1.0.0"},
    )
    expect(explicitIdentity.workerCodeVersion).toBe("1.0.0")
    expect(explicitIdentity.lifecycleSnapshot.envelopes.find((envelope) =>
      envelope.observation.subjectKind === "service-worker")?.observation.attributes?.codeVersion,
    ).toBe("1.0.0")
  })

  test("projects an exact server bootstrap that an empty Worker registry can accept", () => {
    const serverLogicalContourId = hamiltonianLogicalContourId("server", "bootstrap-host")
    const browserLogicalContourId = hamiltonianLogicalContourId("browser-profile", "old-profile")
    const serverEntityId = hamiltonianLifecycleEntityId("server", "bootstrap-host-runtime")
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", "old-worker")
    const source = new HamiltonianLifecycleSource({
      id: serverEntityId,
      kind: "server",
      incarnation: "bootstrap-host-runtime",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(serverEntityId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: serverEntityId,
      subjectKind: "server",
      ownerId: serverEntityId,
      attributes: {identity: "bootstrap-host", hostEpoch: "bootstrap-host-runtime", version: "v1"},
    })))
    const declaration = createHamiltonianNodeSystemDeclaration({
      logicalContourId: serverLogicalContourId,
      incarnation: "bootstrap-host-runtime",
      incarnationStartedAt: 1,
      revision: journal.snapshot().revision,
      rootId: serverEntityId,
      snapshot: journal.snapshot(),
      boundaryTransports: [{
        transportId: "websocket:old-worker",
        kind: "websocket",
        phase: "opened",
        owner: {
          logicalContourId: browserLogicalContourId,
          incarnation: "old-worker-runtime",
          entityId: workerEntityId,
        },
        source: {
          logicalContourId: browserLogicalContourId,
          incarnation: "old-worker-runtime",
          entityId: workerEntityId,
        },
        target: {
          logicalContourId: serverLogicalContourId,
          incarnation: "bootstrap-host-runtime",
          entityId: serverEntityId,
        },
        attributes: {state: "open"},
      }],
    })
    const emptyRegistry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(emptyRegistry.accept(declaration)).toBeNull()

    const bootstrap = hamiltonianServerBootstrapDeclaration(declaration)
    expect(bootstrap).toMatchObject({
      logicalContourId: declaration.logicalContourId,
      incarnation: declaration.incarnation,
      incarnationStartedAt: declaration.incarnationStartedAt,
      revision: declaration.revision,
      rootId: declaration.rootId,
      snapshot: declaration.snapshot,
      boundaryTransports: [],
    })
    expect(emptyRegistry.accept(bootstrap)).not.toBeNull()
  })

  test("keys page source reloads by served browser code instead of host incarnation", async () => {
    const servedByHostA = {
      orchestrationBundle: "orchestration-a",
      layoutWorkerBundle: "layout-worker-a",
      serviceWorkerBundle: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-worker-a',
      webPushClientBundle: "web-push-client-a",
      directlyServedText: {
        "/app.js": "app-a",
        "/core/browser-control.js": "browser-control-a",
        "/update/page-update.js": "page-update-a",
      },
    }
    const revisionA = hamiltonianBrowserSourceRevision(servedByHostA)
    const revisionB = hamiltonianBrowserSourceRevision({
      ...servedByHostA,
      directlyServedText: {
        "/core/browser-control.js": "browser-control-a",
        "/update/page-update.js": "page-update-a",
        "/app.js": "app-a",
      },
    })
    expect(revisionB).toBe(revisionA)
    expect(sourceRevisionRequiresReload(revisionA, revisionB)).toBeFalse()

    const browserBundles = {
      orchestration: servedByHostA.orchestrationBundle,
      layoutWorker: servedByHostA.layoutWorkerBundle,
      serviceWorker: servedByHostA.serviceWorkerBundle,
      webPushClient: servedByHostA.webPushClientBundle,
    }
    const hostA = createHamiltonianHost({
      port: 0,
      token: "source-host-a",
      identity: "stable-source-host",
      browserBundles,
    })
    const hostB = createHamiltonianHost({
      port: 0,
      token: "source-host-b",
      identity: "stable-source-host",
      browserBundles,
    })
    running.push(hostA, hostB)
    const [bootstrapA, bootstrapB] = await Promise.all([
      fetch(hostA.server.url).then((response) => response.text()),
      fetch(hostB.server.url).then((response) => response.text()),
    ])
    const bootstrapValue = (source: string, name: string) => requireValue(
      source.match(new RegExp(`meta name="${name}" content="([^"]+)"`))?.[1],
      `${name} bootstrap`,
    )
    expect(bootstrapValue(bootstrapB, "hamiltonian-host-epoch"))
      .not.toBe(bootstrapValue(bootstrapA, "hamiltonian-host-epoch"))
    const hostRevisionA = bootstrapValue(bootstrapA, "hamiltonian-browser-source-revision")
    const hostRevisionB = bootstrapValue(bootstrapB, "hamiltonian-browser-source-revision")
    expect(hostRevisionB).toBe(hostRevisionA)
    expect(sourceRevisionRequiresReload(hostRevisionA, hostRevisionB)).toBeFalse()

    for (const changedArtifacts of [
      {...servedByHostA, orchestrationBundle: "orchestration-b"},
      {...servedByHostA, layoutWorkerBundle: "layout-worker-b"},
      {...servedByHostA, serviceWorkerBundle: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-worker-b'},
      {...servedByHostA, webPushClientBundle: "web-push-client-b"},
      {
        ...servedByHostA,
        directlyServedText: {...servedByHostA.directlyServedText, "/app.js": "app-b"},
      },
      {
        ...servedByHostA,
        directlyServedText: {
          ...servedByHostA.directlyServedText,
          "/update/page-update.js": "page-update-b",
        },
      },
    ]) {
      const changedRevision = hamiltonianBrowserSourceRevision(changedArtifacts)
      expect(changedRevision).not.toBe(revisionA)
      expect(sourceRevisionRequiresReload(revisionA, changedRevision)).toBeTrue()
    }
  })

  test("derives each Service Worker manifest release from the exact successive build output", () => {
    const moduleRelease = {version: "module-v1", sha256: "module-hash"}
    const releaseA = hamiltonianServiceWorkerRelease(
      'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.0.0";\nrelease A',
    )
    const releaseB = hamiltonianServiceWorkerRelease(
      'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0";\nrelease B',
    )
    expect(releaseA).toEqual({
      version: "1.0.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(releaseB).toEqual({
      version: "1.1.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(releaseB.sha256).not.toBe(releaseA.sha256)
    expect(moduleRelease).toEqual({version: "module-v1", sha256: "module-hash"})
  })

  test("admits only technical Worker messages before exact profile identity is current", () => {
    expect(hamiltonianServiceWorkerApplicationMessageAllowed(false, "identity")).toBeTrue()
    expect(hamiltonianServiceWorkerApplicationMessageAllowed(false, "pong")).toBeTrue()
    expect(hamiltonianServiceWorkerApplicationMessageAllowed(false, "tabs")).toBeFalse()
    expect(hamiltonianServiceWorkerApplicationMessageAllowed(false, "peer-signal")).toBeFalse()
    expect(hamiltonianServiceWorkerApplicationMessageAllowed(true, "tabs")).toBeTrue()
  })

  test("rejects a Service Worker identity whose code version is not SemVer", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token"})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "invalid-version-profile")
    controlUrl.searchParams.set("worker", "service-worker:invalid-version-worker")
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify(browserIdentityMessage(
      "invalid-version-profile",
      "invalid-version-worker",
      "invalid-version-runtime",
      "invalid-version-resume",
      {workerCodeVersion: "v1"},
    )))
    expect((await closed).code).toBe(1008)
  })

  test("rejects a Service Worker code version that does not match its lifecycle snapshot", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token"})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "mismatched-version-profile")
    controlUrl.searchParams.set("worker", "service-worker:mismatched-version-worker")
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    const identity = browserIdentityMessage(
      "mismatched-version-profile",
      "mismatched-version-worker",
      "mismatched-version-runtime",
      "mismatched-version-resume",
      {workerCodeVersion: "1.1.0"},
    )
    identity.lifecycleSnapshot = browserProfileLifecycleSnapshot(
      "mismatched-version-profile",
      "mismatched-version-worker",
      "mismatched-version-runtime",
      [],
      "2.0.0",
    )
    socket.send(JSON.stringify(identity))
    expect((await closed).code).toBe(1008)
  })

  test("rejects a code version change without a new Service Worker execution", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      heartbeatMs: 10_000,
      browserBundles: {
        orchestration: "orchestration",
        layoutWorker: "layout-worker",
        serviceWorker: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-worker-release',
        webPushClient: "web-push-client",
      },
    })
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "stable-version-profile")
    controlUrl.searchParams.set("worker", "service-worker:stable-version-worker")

    const first = await openSocket(controlUrl)
    await nextMessage(first, "hello")
    const observed = nextMessage(first, "lifecycle", (message) => {
      const observation = (message.envelope as {
        observation?: {subjectId?: string; attributes?: {codeVersion?: string}}
      } | undefined)?.observation
      return observation?.subjectId === "service-worker:stable-version-worker" &&
        observation.attributes?.codeVersion === "1.1.0"
    })
    first.send(JSON.stringify(browserIdentityMessage(
      "stable-version-profile",
      "stable-version-worker",
      "stable-version-runtime",
      "stable-version-resume-a",
      {workerCodeVersion: "1.1.0"},
    )))
    await observed
    const firstClosed = new Promise<CloseEvent>((resolve) => first.addEventListener("close", resolve, {once: true}))
    first.close()
    await firstClosed

    const second = await openSocket(controlUrl)
    await nextMessage(second, "hello")
    const rejected = new Promise<CloseEvent>((resolve) => second.addEventListener("close", resolve, {once: true}))
    second.send(JSON.stringify(browserIdentityMessage(
      "stable-version-profile",
      "stable-version-worker",
      "stable-version-runtime",
      "stable-version-resume-b",
      {workerCodeVersion: "2.0.0"},
    )))
    expect((await rejected).code).toBe(1008)
  })

  test("keeps a stale profile out of application topology until a new target-version execution connects", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      heartbeatMs: 10_000,
      browserBundles: {
        orchestration: "orchestration",
        layoutWorker: "layout-worker",
        serviceWorker: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-worker-release',
        webPushClient: "web-push-client",
      },
    })
    running.push(host)
    const profileId = "stale-profile"
    const workerIdentity = "stale-worker"
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", profileId)
    controlUrl.searchParams.set("worker", workerEntityId)

    const staleFrames: Array<Record<string, unknown>> = []
    const stale = await openSocket(controlUrl, staleFrames)
    await waitUntil(() => staleFrames.some(({kind}) => kind === "hello"), "stale profile hello")
    stale.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "pre-identity-tab", joinedAt: 0, visible: true}],
    }))
    await Bun.sleep(10)
    expect(host.getStatus().topology.peers.flatMap(({windows}) => windows)).toHaveLength(0)
    const updateFrame = nextMessage(stale, "service-worker-update")
    stale.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      "stale-runtime",
      "stale-resume",
      {workerCodeVersion: "1.0.0"},
    )))
    stale.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "stale-tab", joinedAt: 1, visible: true}],
    }))
    const update = await updateFrame
    expect(update.target).toEqual({
      version: "1.1.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    await Bun.sleep(10)
    expect(host.getStatus().connections[0]).toMatchObject({
      deviceId: profileId,
      workerCodeVersion: "1.0.0",
      identityConfirmed: false,
      workerUpdateRequired: true,
    })
    expect(host.getStatus().topology.peers.flatMap(({windows}) => windows)).toHaveLength(0)
    expect(host.getStatus().peer.assignment).toBeNull()
    expect(staleFrames.some(({kind}) => kind === "topology")).toBeFalse()
    expect(staleFrames.some((frame) =>
      frame.kind === "node-system-declaration" &&
      (frame.declaration as {logicalContourId?: string})?.logicalContourId ===
        hamiltonianLogicalContourId("browser-profile", profileId)
    )).toBeFalse()
    const staleClosed = new Promise<void>((resolve) =>
      stale.addEventListener("close", () => resolve(), {once: true}))
    stale.close()
    await staleClosed

    const forged = await openSocket(controlUrl)
    const forgedClosed = new Promise<CloseEvent>((resolve) =>
      forged.addEventListener("close", resolve, {once: true}))
    forged.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      "stale-runtime",
      "forged-resume",
      {workerCodeVersion: "1.1.0"},
    )))
    expect((await forgedClosed).code).toBe(1008)

    const current = await openSocket(controlUrl)
    const acceptedFrame = nextMessage(current, "service-worker-current")
    current.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      "target-runtime",
      "target-resume",
      {workerCodeVersion: "1.1.0"},
    )))
    const accepted = await acceptedFrame
    expect(accepted.target).toEqual(update.target)
    current.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "target-tab", joinedAt: 2, visible: true}],
    }))
    await waitUntil(() => host.getStatus().topology.peers.some(({windows}) =>
      windows.some(({tabId}) => tabId === "target-tab")), "target profile topology")
    expect(host.getStatus().connections.find(({workerRuntimeIncarnation}) =>
      workerRuntimeIncarnation === "target-runtime")).toMatchObject({
      identityConfirmed: true,
      workerUpdateRequired: false,
    })
    current.close()
  })

  test("revokes every admitted profile before sending one rebuilt Worker release", async () => {
    const releaseA = 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; release-a'
    const releaseB = 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.2.0"; release-b'
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      heartbeatMs: 10_000,
      browserBundles: {
        orchestration: "orchestration",
        layoutWorker: "layout-worker",
        serviceWorker: releaseA,
        webPushClient: "web-push-client",
      },
    })
    running.push(host)

    const connect = async (
      profileId: string,
      workerIdentity: string,
      runtimeIncarnation: string,
      tabId: string,
      version = "1.1.0",
    ) => {
      const controlUrl = new URL("/control", host.server.url)
      controlUrl.protocol = "ws:"
      controlUrl.searchParams.set("token", host.token)
      controlUrl.searchParams.set("device", profileId)
      controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
      const socket = await openSocket(controlUrl)
      await nextMessage(socket, "hello")
      const current = nextMessage(socket, "service-worker-current")
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        runtimeIncarnation,
        `resume:${runtimeIncarnation}`,
        {workerCodeVersion: version},
      )))
      await current
      socket.send(JSON.stringify({
        kind: "tabs",
        windows: [{tabId, joinedAt: 10, visible: true}],
      }))
      await waitUntil(() => host.getStatus().topology.peers.some((peer) =>
        peer.deviceId === profileId && peer.windows.some((window) => window.tabId === tabId)),
      `${profileId} topology`)
      return socket
    }

    const profileA = await connect("release-profile-a", "release-worker-a", "release-runtime-a1", "release-tab-a")
    const profileB = await connect("release-profile-b", "release-worker-b", "release-runtime-b1", "release-tab-b")
    expect(host.getStatus().topology.leader).not.toBeNull()
    expect(host.getStatus().peer.assignment).not.toBeNull()

    const updateA = nextMessage(profileA, "service-worker-update")
    const updateB = nextMessage(profileB, "service-worker-update")
    const target = await host.updateServiceWorkerReleaseForTest(releaseB)
    const [sentA, sentB] = await Promise.all([updateA, updateB])
    expect(sentA.target).toEqual(target)
    expect(sentB.target).toEqual(target)
    expect(target).toEqual({
      version: "1.2.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(host.getStatus().topology.peers).toHaveLength(0)
    expect(host.getStatus().topology.leader).toBeNull()
    expect(host.getStatus().peer.assignment).toBeNull()
    expect(host.getStatus().connections.filter(({workerUpdateRequired}) => workerUpdateRequired)).toHaveLength(2)

    const replacementA = await connect(
      "release-profile-a",
      "release-worker-a",
      "release-runtime-a2",
      "release-tab-a",
      "1.2.0",
    )
    const replacementB = await connect(
      "release-profile-b",
      "release-worker-b",
      "release-runtime-b2",
      "release-tab-b",
      "1.2.0",
    )
    expect(host.getStatus().topology.peers.map(({deviceId, windows}) => ({
      deviceId,
      tabs: windows.map(({tabId}) => tabId),
    }))).toEqual(expect.arrayContaining([
      {deviceId: "release-profile-a", tabs: ["release-tab-a"]},
      {deviceId: "release-profile-b", tabs: ["release-tab-b"]},
    ]))

    profileA.close()
    profileB.close()
    replacementA.close()
    replacementB.close()
  })

  test("serves bootstrap and an authenticated, hashed version from one listener", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      version: "v-test",
      browserBundles: {
        orchestration: "export const testOrchestrationBundle = true",
        layoutWorker: "export const testLayoutWorkerBundle = true",
        serviceWorker: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; export const testServiceWorkerBundle = true',
        webPushClient: "export const testWebPushClientBundle = true",
      },
    })
    running.push(host)

    const localJoinUrl = new URL(host.server.url)
    expect(localJoinUrl.pathname).toBe("/")
    expect(localJoinUrl.search).toBe("")

    const bootstrap = await fetch(localJoinUrl, {redirect: "manual"})
    expect(bootstrap.status).toBe(200)
    const bootstrapPolicy = bootstrap.headers.get("content-security-policy") ?? ""
    expect(bootstrapPolicy).toContain("connect-src 'self' ws: wss: data:")
    expect(bootstrapPolicy).toContain("img-src 'self' data: blob:")
    const bootstrapSource = await bootstrap.text()
    expect(bootstrapSource).toContain("<title>Оркестрация Гамильтониана</title>")
    expect(bootstrapSource).toContain('meta name="hamiltonian-host-version" content="v-test"')
    const bootstrapSourceRevision = requireValue(
      bootstrapSource.match(/meta name="hamiltonian-browser-source-revision" content="([^"]+)"/)?.[1],
      "browser source revision bootstrap",
    )
    expect(bootstrapSourceRevision).toMatch(/^source:[0-9a-f]{64}$/)
    expect(bootstrapSource).toContain('meta name="hamiltonian-local-join-token" content="test-token"')
    expect(bootstrapSource).not.toContain("__HAMILTONIAN_HOST_EPOCH__")
    expect(bootstrapSource).toContain('<link rel="icon" href="data:image/svg+xml,')
    expect(bootstrapSource).toContain('src="/window-entry.js"')
    expect(bootstrapSource).toContain(
      '<canvas id="orchestration-canvas" aria-label="Интерактивная топология инфраструктуры Гамильтониана"></canvas>',
    )
    expect(bootstrapSource).toContain('<p id="orchestration-status" role="status">')
    for (const legacyMarker of [
      'class="legacy-debug"',
      'class="status-grid"',
      'class="identity"',
      'class="actions"',
      'id="secure"',
      'id="control"',
      'id="socket"',
      'id="role"',
      'id="host"',
      'id="version"',
      'id="device"',
      'id="tab"',
      'id="module"',
      'id="source-hash"',
      'id="main-embodiment"',
      'id="singleton-authority"',
      'id="worker-embodiment"',
      'id="bun-embodiment"',
      'id="peer-carrier"',
      'id="oracle-proof"',
      'id="force-proof"',
      'id="caches"',
      'id="topology"',
      'id="events"',
      'id="new-tab"',
      'id="rebirth-worker"',
      'id="reload-main"',
      'id="reconnect"',
      'id="enable-push"',
      'id="reload"',
      "Резервный экран оркестрации",
      "Состояние стенда",
      "Топология хоста",
      "Наблюдаемые события",
    ]) {
      expect(bootstrapSource).not.toContain(legacyMarker)
    }

    const stylesResponse = await fetch(new URL("/styles.css", host.server.url))
    expect(stylesResponse.status).toBe(200)
    const stylesSource = await stylesResponse.text()
    expect(stylesSource).toBe(await Bun.file(new URL("./visual/browser/styles.css", import.meta.url)).text())
    expect(stylesSource).toContain('.orchestration-failed #orchestration-status')
    expect(stylesSource).not.toContain(".legacy-debug")
    expect(stylesSource).not.toContain(".status-grid")
    expect(stylesSource).not.toContain(".identity")
    expect(stylesSource).not.toContain(".actions")
    expect(stylesSource).not.toContain("section:has")

    const windowEntry = await fetch(new URL("/window-entry.js", host.server.url))
    expect(windowEntry.status).toBe(200)
    const windowEntrySource = await windowEntry.text()
    const monitorImportIndex = windowEntrySource.indexOf('import "/core/monitor.js"')
    expect(monitorImportIndex).toBeGreaterThan(-1)
    expect(windowEntrySource).not.toContain('import "/app.js"')
    expect(windowEntrySource).not.toContain('import "/orchestration.js"')
    expect(monitorImportIndex).toBeLessThan(windowEntrySource.indexOf('import("/app.js")'))
    expect(monitorImportIndex).toBeLessThan(windowEntrySource.indexOf('import("/orchestration.js")'))

    const monitorBootstrap = await fetch(new URL("/core/monitor.js", host.server.url))
    expect(monitorBootstrap.status).toBe(200)
    const monitorSource = await monitorBootstrap.text()
    expect(monitorSource).toContain("metafor.hamiltonian.lifecycle.v1")
    expect(monitorSource).toContain('meta("hamiltonian-browser-source-revision")')
    expect(monitorSource).not.toContain("metafor.hamiltonian.edge-traffic.v1")
    expect(monitorSource).not.toContain("metafor.hamiltonian.orchestration.v1")

    const trafficBootstrap = await fetch(new URL("/core/traffic.js", host.server.url))
    expect(trafficBootstrap.status).toBe(404)

    const unauthorized = await fetch(new URL("/manifest.json", host.server.url))
    expect(unauthorized.status).toBe(401)
    expect((await fetch(new URL("/lab/status", host.server.url))).status).toBe(401)

    const manifestResponse = await fetch(new URL("/manifest.json", host.server.url), {
      headers: {authorization: "Bearer test-token"},
    })
    const manifest = await manifestResponse.json() as {
      version: string
      moduleUrl: string
      sha256: string
      serviceWorker?: {version?: string; sha256?: string}
    }
    expect(manifest.version).toBe("v-test")
    expect(manifest.sha256).toHaveLength(64)
    expect(manifest.serviceWorker).toEqual({
      version: "1.1.0",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(manifest.serviceWorker?.sha256).not.toBe(manifest.sha256)

    const moduleResponse = await fetch(new URL(manifest.moduleUrl, host.server.url), {
      headers: {authorization: "Bearer test-token"},
    })
    expect(moduleResponse.status).toBe(200)
    expect(moduleResponse.headers.get("x-hamiltonian-sha256")).toBe(manifest.sha256)
    const source = await moduleResponse.text()
    expect(source).toContain('export const version = "v-test"')
    expect(source).toContain("export function createEmbodiment")

    const controlFrames: Array<Record<string, unknown>> = []
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "source-bootstrap-profile")
    controlUrl.searchParams.set("worker", "service-worker:source-bootstrap-worker")
    const controlSocket = await openSocket(controlUrl, controlFrames)
    controlSocket.send(JSON.stringify(browserIdentityMessage(
      "source-bootstrap-profile",
      "source-bootstrap-worker",
      "source-bootstrap-runtime",
      "source-bootstrap-resume",
      {workerCodeVersion: "1.1.0"},
    )))
    await nextMessage(controlSocket, "service-worker-current")
    const admittedSourceRevision = await fetch(host.server.url).then((response) => response.text()).then((html) =>
      requireValue(
        html.match(/meta name="hamiltonian-browser-source-revision" content="([^"]+)"/)?.[1],
        "admitted browser source revision",
      ))
    await waitUntil(() => controlFrames.some((frame) =>
      frame.kind === "source-update" && frame.revision === admittedSourceRevision
    ), "matching browser source revision over control")
    controlSocket.close()

    const workerBootstrap = await fetch(new URL("/embodiment-worker.js", host.server.url))
    expect(workerBootstrap.status).toBe(200)
    const workerSource = await workerBootstrap.text()
    expect(workerSource).toContain('runtime: "dedicated-worker"')
    expect(workerSource).toContain('subjectKind: "dedicated-worker"')
    expect(workerSource).toContain('subjectKind: "worker-message"')
    expect(workerSource).toContain("new HamiltonianLifecycleRetainedJournal(workerEntityId)")
    expect(workerSource).toContain('self.postMessage({kind: "lifecycle-snapshot"')

    const workerEntry = await fetch(new URL("/embodiment-worker-entry.js", host.server.url))
    expect(workerEntry.status).toBe(200)
    const workerEntrySource = await workerEntry.text()
    const workerMonitorImportIndex = workerEntrySource.indexOf('import "/core/monitor.js"')
    expect(workerMonitorImportIndex).toBeGreaterThan(-1)
    expect(workerMonitorImportIndex)
      .toBeLessThan(workerEntrySource.indexOf('import "/embodiment-worker.js"'))

    const browserBootstrap = await fetch(new URL("/app.js", host.server.url))
    expect(browserBootstrap.status).toBe(200)
    const browserSource = await browserBootstrap.text()
    expect(browserSource).toContain('channel.label !== "oracle"')
    expect(browserSource).toContain("lanes: {oracle, force}")
    expect(browserSource).toContain('localStorage.getItem("hamiltonian-service-worker-id")')
    expect(browserSource).toContain("attachedWorkerEntityId,")
    expect(browserSource).toContain("emitHamiltonianLifecycle(createHamiltonianLifecycleObservation")
    expect(browserSource).toContain('subjectKind: "browser-runtime"')
    expect(browserSource).toContain("browserEntityId,")
    expect(browserSource).toContain('subjectKind: "page"')
    expect(browserSource).toContain("closeDedicatedWorkerFromOwner(previous")
    expect(browserSource).toContain('observeAttachedWorkerQuiet("page-channel-quiet")')
    expect(browserSource).toContain('attributes: {state: "standby", heartbeat: "paused", reason}')
    expect(browserSource).toContain("pageBootstrap?.browserSourceRevision")
    expect(browserSource).toContain("sessionStorage.setItem(sourceRevisionStorageKey")
    expect(browserSource).toContain('from "/update/page-update.js"')

    const pageUpdateContract = await fetch(new URL("/update/page-update.js", host.server.url))
    expect(pageUpdateContract.status).toBe(200)
    const pageUpdateSource = await pageUpdateContract.text()
    expect(pageUpdateSource).toContain("export function mainRealmRequiresReload(")
    expect(pageUpdateSource).toContain("export function sourceRevisionRequiresReload(")

    const webPushClientEntry = await fetch(new URL("/web-push-client.js", host.server.url))
    expect(webPushClientEntry.status).toBe(200)
    expect(await webPushClientEntry.text()).toContain("testWebPushClientBundle")

    const serviceWorkerEntry = await fetch(new URL("/sw-entry.js", host.server.url))
    expect(serviceWorkerEntry.status).toBe(200)
    expect(serviceWorkerEntry.headers.get("content-security-policy")).toContain("connect-src 'self' ws: wss: data:")
    expect(serviceWorkerEntry.headers.get("service-worker-allowed")).toBe("/")
    expect(serviceWorkerEntry.headers.get("cache-control")).toBe("no-cache")
    const serviceWorkerEntrySource = await serviceWorkerEntry.text()
    expect(serviceWorkerEntrySource).toContain("testServiceWorkerBundle")

    const orchestrationContract = await fetch(new URL("/core/orchestration.js", host.server.url))
    expect(orchestrationContract.status).toBe(200)
    const orchestrationContractSource = await orchestrationContract.text()
    expect(orchestrationContractSource).toContain("parseLocalHamiltonianWindowAction")
    expect(orchestrationContractSource).toContain("hamiltonianBrowserNodeId")

    const lifecycleContract = await fetch(new URL("/core/lifecycle.js", host.server.url))
    expect(lifecycleContract.status).toBe(200)
    expect(await lifecycleContract.text()).toContain('HAMILTONIAN_LIFECYCLE_KIND = "hamiltonian-lifecycle"')

    const orchestrationBundle = await fetch(new URL("/orchestration.js", host.server.url))
    if (!orchestrationBundle.ok) throw new Error(await orchestrationBundle.text())
    const orchestrationSource = await orchestrationBundle.text()
    expect(orchestrationSource).toContain("testOrchestrationBundle")

    const layoutWorkerBundle = await fetch(new URL("/layout-worker.js", host.server.url))
    expect(layoutWorkerBundle.status).toBe(200)
    const layoutWorkerSource = await layoutWorkerBundle.text()
    expect(layoutWorkerSource).toContain("testLayoutWorkerBundle")

    const uiFont = await fetch(new URL("/engine-static/JetBrainsMono-Bold.ttf", host.server.url))
    expect(uiFont.status).toBe(200)
    expect(uiFont.headers.get("content-type")).toBe("font/ttf")

    const bunEmbodiments = await host.bunReady
    const main = requireValue(bunEmbodiments["main-probe"], "main Bun lifecycle probe")
    const worker = requireValue(bunEmbodiments["worker-probe"], "worker Bun lifecycle probe")
    expect(main).toMatchObject({
      runtime: "bun-process",
      role: "main-probe",
      state: "ready",
      version: "v-test",
      sha256: manifest.sha256,
      authority: null,
    })
    expect(worker).toMatchObject({
      runtime: "bun-process",
      role: "worker-probe",
      state: "ready",
      version: "v-test",
      sha256: manifest.sha256,
      authority: null,
    })
    expect(main.pid).toBeGreaterThan(0)
    expect(worker.pid).toBeGreaterThan(0)
    expect(worker.pid).not.toBe(main.pid)
  })

  test("registers Web Push and causally confirms reconnect of the same Service Worker", async () => {
    const deliveries: Array<{payload: string; endpoint: string}> = []
    let releaseDelivery!: () => void
    let announceDelivery!: () => void
    const deliveryStarted = new Promise<void>((resolve) => { announceDelivery = resolve })
    const deliveryReleased = new Promise<void>((resolve) => { releaseDelivery = resolve })
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      heartbeatMs: 10_000,
      webPush: {
        publicKey: "public-test-key",
        privateKey: "private-test-key",
        send: async (subscription, payload) => {
          deliveries.push({payload, endpoint: subscription.endpoint})
          announceDelivery()
          await deliveryReleased
        },
      },
    })
    running.push(host)

    const keyUrl = new URL("/push/vapid-public-key", host.server.url)
    expect((await fetch(keyUrl)).status).toBe(401)
    const keyResponse = await fetch(keyUrl, {headers: {authorization: "Bearer test-token"}})
    expect(await keyResponse.json()).toEqual({publicKey: "public-test-key"})

    const workerIdentity = "stable-push-worker"
    const registrationFrames: Array<Record<string, unknown>> = []
    const registrationSocket = await registerTestPushSubscription(
      host,
      workerIdentity,
      "push-device",
      "https://push.example.test/subscription/one",
      registrationFrames,
    )
    const readyObservation = registrationFrames.find((frame) => {
      if (frame.kind !== "lifecycle") return false
      const envelope = frame.envelope as {observation?: {
        subjectId?: string
        subjectKind?: string
        ownerId?: string
        attributes?: {push?: string}
      }} | undefined
      return envelope?.observation?.subjectId === hamiltonianLifecycleEntityId("service-worker", workerIdentity) &&
        envelope.observation.subjectKind === "service-worker" &&
        envelope.observation.attributes?.push === "ready"
    })
    expect(readyObservation).toBeDefined()
    expect((readyObservation?.envelope as {observation?: {ownerId?: string}}).observation?.ownerId)
      .toBe(hamiltonianBrowserNodeId("push-device"))
    expect(registrationFrames.some((frame) => {
      const observation = (frame.envelope as {observation?: {
        type?: string
        subjectKind?: string
        sourceEntityId?: string
        targetEntityId?: string
      }} | undefined)?.observation
      return observation?.type === "transport" &&
        observation.subjectKind === "web-push" &&
        observation.sourceEntityId === `server:${host.hostEpoch}` &&
        observation.targetEntityId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    })).toBe(true)
    registrationSocket.close()
    expect(host.getStatus().push.subscriptions).toHaveLength(1)

    const wakeResponsePromise = fetch(new URL("/lab/wake-service-worker", host.server.url), {
      method: "POST",
      headers: {authorization: "Bearer test-token", "content-type": "application/json"},
      body: JSON.stringify({workerIdentity}),
    })
    await deliveryStarted
    expect(deliveries).toHaveLength(1)
    const payload = (JSON.parse(deliveries[0]!.payload) as {data: {
      kind: string
      wakeId: string
      wakeProof: string
      token: string
      serverEntityId: string
    }}).data
    expect(payload).toMatchObject({
      kind: "wake-service-worker",
      token: "test-token",
      serverEntityId: `server:${host.hostEpoch}`,
    })
    expect(payload).not.toHaveProperty("version")
    expect(payload).not.toHaveProperty("sha256")
    expect(payload).not.toHaveProperty("code")
    expect(host.getStatus().push.pendingWakeIds).toEqual([
      expect.objectContaining({wakeId: payload.wakeId}),
    ])

    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", payload.token)
    controlUrl.searchParams.set("device", "push-device")
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const confirmed = nextMessage(socket, "wake-confirmed", (message) => message.wakeId === payload.wakeId)
    socket.send(JSON.stringify(browserIdentityMessage(
      "push-device",
      workerIdentity,
      "runtime-after-push",
      "push-resume",
      {
      wakeId: payload.wakeId,
      wakeProof: payload.wakeProof,
      },
    )))
    await confirmed
    releaseDelivery()
    const wakeResponse = await wakeResponsePromise
    expect(wakeResponse.status).toBe(200)
    const wake = await wakeResponse.json() as {wakeId: string; workerEntityId: string}
    expect(wake.wakeId).toBe(payload.wakeId)
    expect(host.getStatus().push.pendingWakeIds).toHaveLength(0)
    expect(host.getStatus().events).toContainEqual(expect.objectContaining({
      kind: "push-reconnect-confirmed",
      connectionId: expect.any(String),
    }))
    const causalKinds = host.getStatus().events
      .filter((event) => event.detail?.includes(payload.wakeId))
      .map((event) => event.kind)
    expect(causalKinds.indexOf("push-sent")).toBeLessThan(causalKinds.indexOf("push-reconnect-confirmed"))
    socket.close()
  })

  test("makes Web Push delivery failure an explicit Service Worker failure", async () => {
    const secret = "token-super-secret"
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      webPush: {
        publicKey: "public-test-key",
        privateKey: "private-test-key",
        send: async () => {
          throw new Error(secret)
        },
      },
    })
    running.push(host)
    const workerIdentity = "failed-push-worker"
    const registrationSocket = await registerTestPushSubscription(
      host,
      workerIdentity,
      "push-device",
      "https://push.example.test/subscription/failure",
    )
    registrationSocket.close()
    const wakeResponse = await fetch(new URL("/lab/wake-service-worker", host.server.url), {
      method: "POST",
      headers: {authorization: "Bearer test-token", "content-type": "application/json"},
      body: JSON.stringify({workerIdentity}),
    })
    expect(wakeResponse.status).toBe(502)
    expect(await wakeResponse.text()).toBe("Web Push delivery failed")
    expect(host.getStatus().push.pendingWakeIds).toHaveLength(0)
    expect(JSON.stringify(host.getStatus())).not.toContain(secret)
    expect(host.getStatus().events).toContainEqual(expect.objectContaining({
      kind: "push-send-failed",
      detail: expect.stringContaining("RedactedError"),
    }))

    const observerUrl = new URL("/control", host.server.url)
    observerUrl.protocol = "ws:"
    observerUrl.searchParams.set("token", "test-token")
    observerUrl.searchParams.set("device", "failure-observer-device")
    observerUrl.searchParams.set("transport", `websocket:${crypto.randomUUID()}`)
    observerUrl.searchParams.set("worker", "service-worker:failure-observer")
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retainedSnapshot = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {
        subjectId?: string
        attributes?: {state?: string; push?: string; reason?: string}
      }}>
    }
    expect(JSON.stringify(retainedSnapshot)).not.toContain(secret)
    expect(retainedSnapshot.envelopes.find(({observation}) =>
      observation.subjectId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    )?.observation.attributes).toMatchObject({
      state: "error",
      push: "failed",
      reason: "RedactedError",
    })
    observer.close()
  })

  test("supplies fresh host capability through encrypted Push after Bun restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hamiltonian-host-push-"))
    temporaryDirectories.push(directory)
    const storagePath = join(directory, "web-push.json")
    const workerIdentity = "restart-push-worker"
    const deviceId = "restart-push-device"
    const first = createHamiltonianHost({
      port: 0,
      token: "first-host-token",
      webPush: {storagePath, send: async () => {}},
    })
    running.push(first)
    const registrationSocket = await registerTestPushSubscription(
      first,
      workerIdentity,
      deviceId,
      "https://push.example.test/subscription/restart",
    )
    registrationSocket.close()
    const firstServerEntityId = `server:${first.hostEpoch}`
    await first.stop()
    running.splice(running.indexOf(first), 1)

    const deliveries: string[] = []
    const restarted = createHamiltonianHost({
      port: 0,
      token: "second-host-token",
      webPush: {
        storagePath,
        send: async (_subscription, payload) => { deliveries.push(payload) },
      },
    })
    running.push(restarted)
    expect(restarted.getStatus().push.subscriptions).toHaveLength(1)
    const wakeResponse = await fetch(new URL("/lab/wake-service-worker", restarted.server.url), {
      method: "POST",
      headers: {authorization: "Bearer second-host-token", "content-type": "application/json"},
      body: JSON.stringify({workerIdentity}),
    })
    expect(wakeResponse.status).toBe(200)
    const payload = (JSON.parse(deliveries[0]!) as {data: {
      wakeId: string
      wakeProof: string
      token: string
      serverEntityId: string
    }}).data
    expect(payload.token).toBe("second-host-token")
    expect(payload.serverEntityId).toBe(`server:${restarted.hostEpoch}`)
    expect(payload.serverEntityId).not.toBe(firstServerEntityId)

    const controlUrl = new URL("/control", restarted.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", payload.token)
    controlUrl.searchParams.set("device", deviceId)
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const confirmed = nextMessage(socket, "wake-confirmed", (message) => message.wakeId === payload.wakeId)
    socket.send(JSON.stringify(browserIdentityMessage(
      deviceId,
      workerIdentity,
      "runtime-after-host-restart",
      "persisted-restart-resume",
      {
      wakeId: payload.wakeId,
      wakeProof: payload.wakeProof,
      },
    )))
    await confirmed
    expect(restarted.getStatus().push.pendingWakeIds).toHaveLength(0)
    expect(restarted.getStatus().events).toContainEqual(expect.objectContaining({
      kind: "push-reconnect-confirmed",
    }))
    socket.close()
  })

  test("does not expose wakeProof and rejects a forged reconnect that only knows wakeId", async () => {
    const deliveries: string[] = []
    const host = createHamiltonianHost({
      port: 0,
      token: "proof-test-token",
      webPush: {
        publicKey: "public-test-key",
        privateKey: "private-test-key",
        send: async (_subscription, payload) => { deliveries.push(payload) },
      },
    })
    running.push(host)
    const workerIdentity = "proof-bound-worker"
    const deviceId = "proof-bound-device"
    const registrationSocket = await registerTestPushSubscription(
      host,
      workerIdentity,
      deviceId,
      "https://push.example.test/subscription/proof",
    )
    const response = await fetch(new URL("/lab/wake-service-worker", host.server.url), {
      method: "POST",
      headers: {authorization: "Bearer proof-test-token", "content-type": "application/json"},
      body: JSON.stringify({workerIdentity}),
    })
    expect(response.status).toBe(200)
    const payload = (JSON.parse(deliveries[0]!) as {data: {
      wakeId: string
      wakeProof: string
    }}).data
    expect(JSON.stringify(host.getStatus())).not.toContain(payload.wakeProof)

    const staleSocketRejected = new Promise<CloseEvent>((resolve) =>
      registrationSocket.addEventListener("close", resolve, {once: true})
    )
    registrationSocket.send(JSON.stringify(browserIdentityMessage(
      deviceId,
      workerIdentity,
      `registration-runtime:${workerIdentity}`,
      `registration-resume:${workerIdentity}`,
      {
      wakeId: payload.wakeId,
      wakeProof: payload.wakeProof,
      },
    )))
    expect((await staleSocketRejected).code).toBe(1008)
    expect(host.getStatus().push.pendingWakeIds).toHaveLength(1)

    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", deviceId)
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
    const forgedUrl = new URL(controlUrl)
    forgedUrl.searchParams.set("device", "forged-device")
    const forged = await openSocket(forgedUrl)
    await nextMessage(forged, "hello")
    const rejected = new Promise<CloseEvent>((resolve) => forged.addEventListener("close", resolve, {once: true}))
    forged.send(JSON.stringify(browserIdentityMessage(
      "forged-device",
      workerIdentity,
      "forged-runtime",
      "proof-resume",
      {
      wakeId: payload.wakeId,
      wakeProof: "forged-proof",
      },
    )))
    expect((await rejected).code).toBe(1008)
    expect(host.getStatus().push.pendingWakeIds).toHaveLength(1)

    const observerUrl = new URL(controlUrl)
    observerUrl.searchParams.set("worker", "service-worker:proof-observer")
    observerUrl.searchParams.set("transport", `websocket:${crypto.randomUUID()}`)
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retainedSnapshot = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {
        phase?: string
        subjectId?: string
        subjectKind?: string
        ownerId?: string
        attributes?: {state?: string; push?: string}
      }}>
    }
    expect(retainedSnapshot.envelopes.find(({observation}) =>
      observation.subjectId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    )?.observation).toMatchObject({
      ownerId: hamiltonianBrowserNodeId(deviceId),
      attributes: {state: "waking", push: "accepted"},
    })
    expect(retainedSnapshot.envelopes.some(({observation}) =>
      observation.phase === "closed" &&
      observation.subjectKind === "websocket" &&
      observation.ownerId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    )).toBeFalse()
    observer.close()

    const legitimate = await openSocket(controlUrl)
    await nextMessage(legitimate, "hello")
    const confirmed = nextMessage(legitimate, "wake-confirmed", (message) => message.wakeId === payload.wakeId)
    legitimate.send(JSON.stringify(browserIdentityMessage(
      deviceId,
      workerIdentity,
      "legitimate-runtime",
      "proof-resume",
      {
      wakeId: payload.wakeId,
      wakeProof: payload.wakeProof,
      },
    )))
    await confirmed
    expect(host.getStatus().push.pendingWakeIds).toHaveLength(0)
    legitimate.close()
  })

  test("sends retained current state and a causal frontier before live control messages", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const transportId = `websocket:${crypto.randomUUID()}`
    const workerIdentity = "journal-worker"
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "journal-browser")
    controlUrl.searchParams.set("transport", transportId)
    controlUrl.searchParams.set("worker", workerEntityId)

    const frames: Array<Record<string, unknown>> = []
    let resolveHello!: (message: Record<string, unknown>) => void
    const hello = new Promise<Record<string, unknown>>((resolve) => {
      resolveHello = resolve
    })
    const socket = new WebSocket(controlUrl)
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>
      frames.push(message)
      if (message.kind === "hello") resolveHello(message)
    })
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), {once: true})
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const helloMessage = await hello

    const technicalSnapshot = requireValue(
      frames.find((message) => message.kind === "lifecycle-snapshot")?.snapshot as {
        envelopes?: Array<{observation?: {subjectKind?: string}}>
      } | undefined,
      "technical server lifecycle snapshot",
    )
    expect(technicalSnapshot.envelopes).toBeDefined()
    socket.send(JSON.stringify(browserIdentityMessage(
      "journal-browser",
      workerIdentity,
      "journal-runtime",
      "journal-resume",
    )))
    await nextMessage(socket, "service-worker-current")

    const snapshotFrame = requireValue(
      frames.find((message) => message.kind === "lifecycle-snapshot"),
      "host lifecycle snapshot",
    )
    const snapshot = snapshotFrame.snapshot as {
      scopeId: string
      frontier: Array<{sourceId: string; sourceIncarnation: string; sequence: number}>
      envelopes: Array<{observation: {type: string}}>
    }
    const serverSourceId = `server:${host.getStatus().hostEpoch}`
    const serverFrontier = requireValue(
      snapshot.frontier.find(({sourceId}) => sourceId === serverSourceId),
      "server lifecycle frontier",
    )
    expect(snapshot.scopeId).toBe(serverSourceId)
    expect(snapshot.envelopes.every(({observation}) => observation.type !== "message")).toBeTrue()

    const serverEnvelopes = frames
      .filter((message) => message.kind === "lifecycle")
      .map((message) => message.envelope as {
        sourceKind?: string
        sequence?: number
        observation?: {phase?: string; messageId?: string; transportId?: string}
      })
      .filter((envelope) => envelope.sourceKind === "server")
    expect(serverEnvelopes[0]?.sequence).toBe(serverFrontier.sequence + 1)
    expect(serverEnvelopes.map(({sequence}) => sequence)).toEqual(
      serverEnvelopes.map((_, index) => serverFrontier.sequence + index + 1),
    )
    const helloMonitor = helloMessage.monitor as {messageId: string; transportId: string}
    expect(helloMonitor.transportId).toBe(transportId)
    expect(serverEnvelopes.some(({observation}) =>
      observation?.messageId === helloMonitor.messageId
    )).toBeFalse()

    const inboundMessageId = `message:${crypto.randomUUID()}`
    const received = nextMessage(socket, "lifecycle", (message) => {
      const envelope = message.envelope as {observation?: {phase?: string; messageId?: string; transportId?: string}}
      return envelope.observation?.phase === "received" &&
        envelope.observation.messageId === inboundMessageId &&
        envelope.observation.transportId === transportId
    })
    socket.send(JSON.stringify(browserIdentityMessage(
      "journal-browser",
      workerIdentity,
      "journal-runtime",
      "journal-resume",
      {
      monitor: {messageId: inboundMessageId, transportId},
      },
    )))
    await received
    socket.close()
  })

  test("bootstraps a new Worker without the previous browser boundary and restores only its new incarnation", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      heartbeatMs: 10_000,
      browserBundles: {
        orchestration: "orchestration",
        layoutWorker: "layout-worker",
        serviceWorker: 'const HAMILTONIAN_SERVICE_WORKER_CODE_VERSION = "1.1.0"; service-worker-release',
        webPushClient: "web-push-client",
      },
    })
    running.push(host)
    const profileId = "updated-profile"
    const workerIdentity = "updated-worker"
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    const oldRuntime = "updated-worker-runtime-old"
    const newRuntime = "updated-worker-runtime-new"
    const serverLogicalContourId = hamiltonianLogicalContourId("server", host.identity)
    const browserLogicalContourId = hamiltonianLogicalContourId("browser-profile", profileId)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", profileId)
    controlUrl.searchParams.set("worker", workerEntityId)

    const oldTransportId = "websocket:updated-worker-old"
    const oldUrl = new URL(controlUrl)
    oldUrl.searchParams.set("transport", oldTransportId)
    const oldFrames: Array<Record<string, unknown>> = []
    const oldSocket = await openSocket(oldUrl, oldFrames)
    await waitUntil(() => oldFrames.some(({kind}) => kind === "hello"), "old Worker hello")
    const oldCurrent = nextMessage(oldSocket, "service-worker-current")
    const oldBoundaryFrame = nextMessage(oldSocket, "node-system-declaration", (message) => {
      const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
      return declaration?.logicalContourId === serverLogicalContourId &&
        declaration.boundaryTransports.some(({transportId}) => transportId === oldTransportId)
    })
    oldSocket.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      oldRuntime,
      "updated-worker-resume-old",
      {workerCodeVersion: "1.1.0"},
    )))
    await oldCurrent
    const oldBoundary = (await oldBoundaryFrame).declaration as HamiltonianNodeSystemDeclaration
    expect(oldBoundary.boundaryTransports.find(({transportId}) => transportId === oldTransportId)?.owner.incarnation)
      .toBe(oldRuntime)

    const newTransportId = "websocket:updated-worker-new"
    const newUrl = new URL(controlUrl)
    newUrl.searchParams.set("transport", newTransportId)
    const newFrames: Array<Record<string, unknown>> = []
    const newSocket = await openSocket(newUrl, newFrames)
    await waitUntil(() => newFrames.some((frame) =>
      frame.kind === "node-system-declaration" &&
      (frame.declaration as HamiltonianNodeSystemDeclaration | undefined)?.logicalContourId === serverLogicalContourId),
    "new Worker server bootstrap")
    const bootstrap = newFrames.find((frame) =>
      frame.kind === "node-system-declaration" &&
      (frame.declaration as HamiltonianNodeSystemDeclaration | undefined)?.logicalContourId === serverLogicalContourId)
      ?.declaration as HamiltonianNodeSystemDeclaration
    const workerRegistry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(bootstrap.boundaryTransports).toHaveLength(0)
    expect(workerRegistry.accept(bootstrap)).not.toBeNull()

    const newBrowserFrame = nextMessage(newSocket, "node-system-declaration", (message) =>
      (message.declaration as HamiltonianNodeSystemDeclaration | undefined)?.logicalContourId ===
        browserLogicalContourId)
    const newBoundaryFrame = nextMessage(newSocket, "node-system-declaration", (message) => {
      const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
      return declaration?.logicalContourId === serverLogicalContourId &&
        declaration.boundaryTransports.some(({transportId}) => transportId === newTransportId)
    })
    const newCurrent = nextMessage(newSocket, "service-worker-current")
    newSocket.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      newRuntime,
      "updated-worker-resume-new",
      {workerCodeVersion: "1.1.0"},
    )))
    await newCurrent
    const newBrowser = (await newBrowserFrame).declaration as HamiltonianNodeSystemDeclaration
    const newBoundary = (await newBoundaryFrame).declaration as HamiltonianNodeSystemDeclaration
    expect(workerRegistry.accept(newBrowser)).not.toBeNull()
    expect(workerRegistry.accept(newBoundary)).not.toBeNull()
    expect(newBoundary.revision).toBeGreaterThan(bootstrap.revision)
    expect(newBoundary.boundaryTransports.filter(({kind}) => kind === "websocket")).toEqual([
      expect.objectContaining({
        transportId: newTransportId,
        owner: expect.objectContaining({
          logicalContourId: browserLogicalContourId,
          incarnation: newRuntime,
          entityId: workerEntityId,
        }),
      }),
    ])
    expect(JSON.stringify(newBoundary.boundaryTransports)).not.toContain(oldRuntime)
    expect(JSON.stringify(newBoundary.boundaryTransports)).not.toContain(oldTransportId)
    oldSocket.close()
    newSocket.close()
  })

  test("declares the exact identity-confirmed control WebSocket with its browser and server endpoints", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const profileId = "declared-wss-profile"
    const workerIdentity = "declared-wss-worker"
    const workerRuntimeIncarnation = "declared-wss-runtime"
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    const transportId = "websocket:declared-wss"
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", profileId)
    controlUrl.searchParams.set("worker", workerEntityId)
    controlUrl.searchParams.set("transport", transportId)

    let pendingPing: {at: number; seq: number} | null = null
    const socket = new WebSocket(controlUrl)
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; at?: number; seq?: number}
      if (message.kind === "ping" && typeof message.at === "number" && typeof message.seq === "number") {
        pendingPing = {at: message.at, seq: message.seq}
      }
    })
    const hello = nextMessage(socket, "hello")
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), {once: true})
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    await hello
    const browserDeclarationFrame = nextMessage(socket, "node-system-declaration", (message) =>
      (message.declaration as {logicalContourId?: string})?.logicalContourId ===
        hamiltonianLogicalContourId("browser-profile", profileId))
    const serverDeclarationFrame = nextMessage(socket, "node-system-declaration", (message) =>
      (message.declaration as {boundaryTransports?: Array<{transportId?: string}>})
        ?.boundaryTransports?.some(({transportId: id}) => id === transportId) === true)
    socket.send(JSON.stringify(browserIdentityMessage(
      profileId,
      workerIdentity,
      workerRuntimeIncarnation,
      "declared-wss-resume",
    )))
    const browserDeclaration = (await browserDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
    const serverDeclaration = (await serverDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
    expect(isHamiltonianNodeSystemDeclaration(browserDeclaration)).toBeTrue()
    expect(isHamiltonianNodeSystemDeclaration(serverDeclaration)).toBeTrue()
    expect(isHamiltonianLifecycleOwnershipClosed(serverDeclaration.snapshot, [serverDeclaration.rootId])).toBeTrue()
    const registry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(registry.accept(browserDeclaration)).not.toBeNull()
    expect(registry.accept(serverDeclaration)).not.toBeNull()
    const boundary = requireValue(
      serverDeclaration.boundaryTransports.find(({transportId: id}) => id === transportId),
      "declared control WebSocket",
    )
    expect(boundary).toMatchObject({
      phase: "opened",
      owner: {
        logicalContourId: browserDeclaration.logicalContourId,
        incarnation: workerRuntimeIncarnation,
        entityId: workerEntityId,
      },
      source: {entityId: workerEntityId},
      target: {
        logicalContourId: hamiltonianLogicalContourId("server", host.identity),
        incarnation: host.hostEpoch,
        entityId: hamiltonianLifecycleEntityId("server", host.hostEpoch),
      },
      attributes: {heartbeat: "awaiting", observedBy: "server"},
    })

    const ping = requireValue<{at: number; seq: number}>(pendingPing, "initial heartbeat challenge")
    const heartbeatDeclarationFrame = nextMessage(socket, "node-system-declaration", (message) => {
      const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
      return declaration?.incarnation === host.hostEpoch && declaration.boundaryTransports.some((transport) =>
        transport.transportId === transportId && transport.attributes.heartbeat === "observed")
    })
    socket.send(JSON.stringify({
      kind: "pong",
      ...ping,
      workerIdentity,
      workerRuntimeIncarnation,
    }))
    const heartbeatDeclaration = (await heartbeatDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
    expect(heartbeatDeclaration.revision).toBeGreaterThan(serverDeclaration.revision)
    expect(registry.accept(heartbeatDeclaration)).not.toBeNull()
    expect(heartbeatDeclaration.boundaryTransports.find(({transportId: id}) => id === transportId)?.attributes)
      .toMatchObject({heartbeat: "observed", heartbeatSequence: ping.seq})
    socket.close()
  })

  test("replaces host A with host B in one retained page projection without reloading the browser profile", async () => {
    const profileId = "host-restart-profile"
    const workerIdentity = "host-restart-worker"
    const workerRuntimeIncarnation = "host-restart-worker-runtime"
    const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    const identity = "stable-hamiltonian"
    const connect = async (
      host: ReturnType<typeof createHamiltonianHost>,
      transportId: string,
    ) => {
      const url = new URL("/control", host.server.url)
      url.protocol = "ws:"
      url.searchParams.set("token", host.token)
      url.searchParams.set("device", profileId)
      url.searchParams.set("worker", workerEntityId)
      url.searchParams.set("transport", transportId)
      const socket = await openSocket(url)
      await nextMessage(socket, "hello")
      const browserDeclarationFrame = nextMessage(socket, "node-system-declaration", (message) =>
        (message.declaration as {logicalContourId?: string})?.logicalContourId ===
          hamiltonianLogicalContourId("browser-profile", profileId))
      const serverDeclarationFrame = nextMessage(socket, "node-system-declaration", (message) =>
        (message.declaration as {boundaryTransports?: Array<{transportId?: string}>})
          ?.boundaryTransports?.some(({transportId: id}) => id === transportId) === true)
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        workerRuntimeIncarnation,
        "host-restart-resume",
      )))
      return {
        socket,
        browserDeclaration: (await browserDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration,
        serverDeclaration: (await serverDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration,
      }
    }

    const hostA = createHamiltonianHost({port: 0, token: "host-a-token", identity, heartbeatMs: 10_000})
    running.push(hostA)
    const transportA = "websocket:host-restart-a"
    const first = await connect(hostA, transportA)
    const projection = new HamiltonianLifecycleProjection({
      origin: hostA.server.url.href,
      deviceId: profileId,
      tabId: "host-restart-page",
      pageIncarnation: "host-restart-page-runtime",
      observedAt: Date.now(),
      navigationId: "host-restart-navigation",
      servedAt: Date.now(),
      server: {identity, hostEpoch: hostA.hostEpoch, version: "v1"},
    })
    const published = []
    expect(projection.replaceDeclaration(first.browserDeclaration)).toBeTrue()
    published.push(projection.document())
    expect(projection.replaceDeclaration(first.serverDeclaration)).toBeTrue()
    published.push(projection.document())
    first.socket.close()
    await hostA.stop()
    running.splice(running.indexOf(hostA), 1)

    await Bun.sleep(2)
    const hostB = createHamiltonianHost({port: 0, token: "host-b-token", identity, heartbeatMs: 10_000})
    running.push(hostB)
    const transportB = "websocket:host-restart-b"
    const second = await connect(hostB, transportB)
    expect(second.browserDeclaration.incarnation).toBe(first.browserDeclaration.incarnation)
    expect(projection.replaceDeclaration(second.browserDeclaration)).toBeFalse()
    expect(projection.replaceDeclaration(second.serverDeclaration)).toBeTrue()
    published.push(projection.document())
    expect(projection.replaceDeclaration(first.serverDeclaration)).toBeFalse()
    published.push(projection.document())

    for (const document of published.slice(2)) {
      const servers = document.nodes.filter(({kind}) => kind === "Bun host Hamiltonian")
      const wss = document.edges.filter(({label}) => label === "WS" || label === "WSS")
      expect(servers.map(({id}) => id)).toEqual([hamiltonianLifecycleEntityId("server", hostB.hostEpoch)])
      expect(document.nodes.some(({id}) => id === hamiltonianLifecycleEntityId("server", hostA.hostEpoch))).toBeFalse()
      expect(document.nodes.some(({id}) => id.includes(hostA.hostEpoch) && id.startsWith("rtc-peer:"))).toBeFalse()
      expect(wss, JSON.stringify({nodes: document.nodes.map(({id}) => id), edges: document.edges}))
        .toHaveLength(1)
      expect(wss[0]).toMatchObject({
        id: transportB,
        source: {nodeId: workerEntityId},
        target: {nodeId: hamiltonianLifecycleEntityId("server", hostB.hostEpoch)},
      })
    }
    second.socket.close()
  })

  test("does not retain a Service Worker or WebSocket for a control socket closed before identity", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const unconfirmedWorkerId = "service-worker:unconfirmed-observer"
    const unconfirmedTransportId = "websocket:unconfirmed-observer"
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "unconfirmed-device")
    controlUrl.searchParams.set("worker", unconfirmedWorkerId)
    controlUrl.searchParams.set("transport", unconfirmedTransportId)
    const unconfirmed = await openSocket(controlUrl)
    const closed = new Promise<CloseEvent>((resolve) =>
      unconfirmed.addEventListener("close", resolve, {once: true})
    )
    unconfirmed.close()
    await closed

    const observerUrl = new URL(controlUrl)
    observerUrl.searchParams.set("device", "snapshot-observer-device")
    observerUrl.searchParams.set("worker", "service-worker:snapshot-observer")
    observerUrl.searchParams.set("transport", "websocket:snapshot-observer")
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retained = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    const retainedIds = retained.envelopes.map(({observation}) => observation.subjectId)
    expect(retainedIds).not.toContain(unconfirmedWorkerId)
    expect(retainedIds).not.toContain(unconfirmedTransportId)
    observer.close()
  })

  test("retains a distinct browser profile owner before every identified Service Worker", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const connectProfile = async (profileId: string, workerIdentity: string) => {
      const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
      const controlUrl = new URL("/control", host.server.url)
      controlUrl.protocol = "ws:"
      controlUrl.searchParams.set("token", host.token)
      controlUrl.searchParams.set("device", profileId)
      controlUrl.searchParams.set("worker", workerEntityId)
      const socket = await openSocket(controlUrl)
      await nextMessage(socket, "hello")
      const observedWorker = nextMessage(socket, "lifecycle", (message) => {
        const envelope = message.envelope as {observation?: {subjectId?: string}} | undefined
        return envelope?.observation?.subjectId === workerEntityId
      })
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        `runtime:${workerIdentity}`,
        `resume:${workerIdentity}`,
      )))
      await observedWorker
      return socket
    }

    const profileA = await connectProfile("profile-a", "worker-a")
    const profileB = await connectProfile("profile-b", "worker-b")
    const profileAPageId = "page:profile-a-page"
    const profileATransportId = "service-worker-api:profile-a-page"
    const updated = nextMessage(profileA, "lifecycle-snapshot", (message) => {
      const snapshot = message.snapshot as {envelopes?: Array<{observation?: {subjectId?: string}}>} | undefined
      return snapshot?.envelopes?.some(({observation}) => observation?.subjectId === profileAPageId) === true
    })
    profileA.send(JSON.stringify({
      kind: "browser-lifecycle-snapshot",
      snapshot: browserProfileLifecycleSnapshot(
        "profile-a",
        "worker-a",
        "runtime:worker-a",
        [
          createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "changed",
            subjectId: profileAPageId,
            subjectKind: "page",
            ownerId: hamiltonianBrowserNodeId("profile-a"),
            attributes: {incarnation: "profile-a-page", state: "live"},
          }),
          createHamiltonianLifecycleObservation({
            type: "transport",
            phase: "opened",
            subjectId: profileATransportId,
            subjectKind: "service-worker-api",
            ownerId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
            sourceEntityId: profileAPageId,
            targetEntityId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
            transportId: profileATransportId,
            attributes: {state: "active"},
          }),
        ],
      ),
    }))
    await updated

    const observerUrl = new URL("/control", host.server.url)
    observerUrl.protocol = "ws:"
    observerUrl.searchParams.set("token", host.token)
    observerUrl.searchParams.set("device", "observer-profile")
    observerUrl.searchParams.set("worker", "service-worker:observer")
    observerUrl.searchParams.set("transport", "websocket:observer")
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retained = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {
        subjectId: string
        subjectKind: string
        ownerId: string | null
        sourceEntityId: string | null
        targetEntityId: string | null
        attributes: Record<string, unknown>
      }}>
    }
    const entities = retained.envelopes
      .map(({observation}) => observation)
      .filter(({subjectKind}) =>
        subjectKind === "browser-runtime" || subjectKind === "service-worker" || subjectKind === "page")
    expect(entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectId: hamiltonianBrowserNodeId("profile-a"),
        ownerId: hamiltonianBrowserNodeId("profile-a"),
        attributes: expect.objectContaining({profileId: "profile-a"}),
      }),
      expect.objectContaining({
        subjectId: hamiltonianBrowserNodeId("profile-b"),
        ownerId: hamiltonianBrowserNodeId("profile-b"),
        attributes: expect.objectContaining({profileId: "profile-b"}),
      }),
      expect.objectContaining({
        subjectId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
        ownerId: hamiltonianBrowserNodeId("profile-a"),
        attributes: expect.objectContaining({codeVersion: HAMILTONIAN_SERVICE_WORKER_CODE_VERSION}),
      }),
      expect.objectContaining({
        subjectId: hamiltonianLifecycleEntityId("service-worker", "worker-b"),
        ownerId: hamiltonianBrowserNodeId("profile-b"),
        attributes: expect.objectContaining({codeVersion: HAMILTONIAN_SERVICE_WORKER_CODE_VERSION}),
      }),
      expect.objectContaining({
        subjectId: profileAPageId,
        ownerId: hamiltonianBrowserNodeId("profile-a"),
      }),
    ]))
    expect(retained.envelopes.map(({observation}) => observation)).toContainEqual(expect.objectContaining({
      subjectId: profileATransportId,
      ownerId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
      sourceEntityId: profileAPageId,
      targetEntityId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
    }))

    observer.close()
    profileA.close()
    profileB.close()
  })

  test("rejects an identified browser scope whose retained owner chain is incomplete", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const profileId = "orphan-profile"
    const workerIdentity = "orphan-worker"
    const workerRuntimeIncarnation = "orphan-runtime"
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", profileId)
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const identity = browserIdentityMessage(
      profileId,
      workerIdentity,
      workerRuntimeIncarnation,
      "orphan-resume",
    )
    const incompleteSnapshot = {
      ...identity.lifecycleSnapshot,
      envelopes: identity.lifecycleSnapshot.envelopes.filter(({observation}) =>
        observation.subjectKind !== "browser-runtime"),
    }
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({...identity, lifecycleSnapshot: incompleteSnapshot}))
    expect((await closed).code).toBe(1008)

    const observerUrl = new URL(controlUrl)
    observerUrl.searchParams.set("device", "orphan-observer")
    observerUrl.searchParams.set("worker", "service-worker:orphan-observer")
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retained = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    expect(retained.envelopes.some(({observation}) =>
      observation.subjectId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
    )).toBeFalse()
    observer.close()
  })

  test("rejects a profile snapshot whose transport endpoint belongs to another retained browser profile", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const connectProfile = async (profileId: string, workerIdentity: string) => {
      const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
      const controlUrl = new URL("/control", host.server.url)
      controlUrl.protocol = "ws:"
      controlUrl.searchParams.set("token", host.token)
      controlUrl.searchParams.set("device", profileId)
      controlUrl.searchParams.set("worker", workerEntityId)
      const socket = await openSocket(controlUrl)
      await nextMessage(socket, "hello")
      const observedWorker = nextMessage(socket, "lifecycle", (message) => {
        const envelope = message.envelope as {observation?: {subjectId?: string}} | undefined
        return envelope?.observation?.subjectId === workerEntityId
      })
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        `runtime:${workerIdentity}`,
        `resume:${workerIdentity}`,
      )))
      await observedWorker
      return socket
    }

    const profileB = await connectProfile("profile-b", "worker-b")
    const profileA = await connectProfile("profile-a", "worker-a")
    const profileAPageId = "page:profile-a-cross-profile-probe"
    const crossProfileTransportId = "service-worker-api:cross-profile-probe"
    const closed = new Promise<CloseEvent>((resolve) =>
      profileA.addEventListener("close", resolve, {once: true}))
    profileA.send(JSON.stringify({
      kind: "browser-lifecycle-snapshot",
      snapshot: browserProfileLifecycleSnapshot(
        "profile-a",
        "worker-a",
        "runtime:worker-a",
        [
          createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "changed",
            subjectId: profileAPageId,
            subjectKind: "page",
            ownerId: hamiltonianBrowserNodeId("profile-a"),
            attributes: {incarnation: "profile-a-cross-profile-probe", state: "live"},
          }),
          createHamiltonianLifecycleObservation({
            type: "transport",
            phase: "opened",
            subjectId: crossProfileTransportId,
            subjectKind: "service-worker-api",
            ownerId: hamiltonianLifecycleEntityId("service-worker", "worker-a"),
            sourceEntityId: profileAPageId,
            targetEntityId: hamiltonianLifecycleEntityId("service-worker", "worker-b"),
            transportId: crossProfileTransportId,
            attributes: {state: "active"},
          }),
        ],
      ),
    }))
    expect((await closed).code).toBe(1008)

    const observerUrl = new URL("/control", host.server.url)
    observerUrl.protocol = "ws:"
    observerUrl.searchParams.set("token", host.token)
    observerUrl.searchParams.set("device", "cross-profile-observer")
    observerUrl.searchParams.set("worker", "service-worker:cross-profile-observer")
    observerUrl.searchParams.set("transport", "websocket:cross-profile-observer")
    const observer = new WebSocket(observerUrl)
    const retainedFrame = nextMessage(observer, "lifecycle-snapshot")
    await new Promise<void>((resolve, reject) => {
      observer.addEventListener("open", () => resolve(), {once: true})
      observer.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retained = (await retainedFrame).snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    const retainedIds = retained.envelopes.map(({observation}) => observation.subjectId)
    expect(retainedIds).toContain(hamiltonianLifecycleEntityId("service-worker", "worker-b"))
    expect(retainedIds).not.toContain(crossProfileTransportId)
    expect(retainedIds).not.toContain(profileAPageId)

    observer.close()
    profileB.close()
  })

  test("removes only an unreachable browser profile after its last window and control path close", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const connectProfile = async (profileId: string, workerIdentity: string, tabId: string) => {
      const workerEntityId = hamiltonianLifecycleEntityId("service-worker", workerIdentity)
      const controlUrl = new URL("/control", host.server.url)
      controlUrl.protocol = "ws:"
      controlUrl.searchParams.set("token", host.token)
      controlUrl.searchParams.set("device", profileId)
      controlUrl.searchParams.set("worker", workerEntityId)
      const socket = await openSocket(controlUrl)
      const hello = await nextMessage(socket, "hello")
      const observedWorker = nextMessage(socket, "lifecycle", (message) => {
        const envelope = message.envelope as {observation?: {subjectId?: string}} | undefined
        return envelope?.observation?.subjectId === workerEntityId
      })
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        `runtime:${workerIdentity}`,
        `resume:${workerIdentity}`,
      )))
      await observedWorker
      const topology = nextMessage(socket, "topology", (message) => {
        const peers = (message.topology as {peers?: Array<{connectionId?: string; windows?: unknown[]}>}).peers
        return peers?.some((peer) =>
          peer.connectionId === hello.connectionId && peer.windows?.length === 1) === true
      })
      socket.send(JSON.stringify({
        kind: "tabs",
        windows: [{tabId, joinedAt: 10, visible: true}],
      }))
      await topology
      return {socket, connectionId: String(hello.connectionId)}
    }

    const closingProfileId = "closing-profile"
    const closingWorkerIdentity = "closing-worker"
    const closingBrowserId = hamiltonianBrowserNodeId(closingProfileId)
    const closingWorkerId = hamiltonianLifecycleEntityId("service-worker", closingWorkerIdentity)
    const closingPageId = "page:closing-profile"
    const closingTransportId = "service-worker-api:closing-profile"
    const closing = await connectProfile(closingProfileId, closingWorkerIdentity, "closing-tab")
    const surviving = await connectProfile("surviving-profile", "surviving-worker", "surviving-tab")
    const pageMerged = nextMessage(closing.socket, "lifecycle-snapshot", (message) => {
      const snapshot = message.snapshot as {envelopes?: Array<{observation?: {subjectId?: string}}>} | undefined
      return snapshot?.envelopes?.some(({observation}) => observation?.subjectId === closingPageId) === true
    })
    closing.socket.send(JSON.stringify({
      kind: "browser-lifecycle-snapshot",
      snapshot: browserProfileLifecycleSnapshot(
        closingProfileId,
        closingWorkerIdentity,
        `runtime:${closingWorkerIdentity}`,
        [
          createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "changed",
            subjectId: closingPageId,
            subjectKind: "page",
            ownerId: closingBrowserId,
            attributes: {incarnation: "closing-profile", state: "live"},
          }),
          createHamiltonianLifecycleObservation({
            type: "transport",
            phase: "opened",
            subjectId: closingTransportId,
            subjectKind: "service-worker-api",
            ownerId: closingWorkerId,
            sourceEntityId: closingPageId,
            targetEntityId: closingWorkerId,
            transportId: closingTransportId,
            attributes: {state: "active"},
          }),
        ],
      ),
    }))
    await pageMerged

    const emptyTopology = nextMessage(closing.socket, "topology", (message) => {
      const peers = (message.topology as {peers?: Array<{connectionId?: string; windows?: unknown[]}>}).peers
      return peers?.some((peer) =>
        peer.connectionId === closing.connectionId && peer.windows?.length === 0) === true
    })
    closing.socket.send(JSON.stringify({kind: "tabs", windows: []}))
    await emptyTopology

    const retainedWithoutClosedProfile = nextMessage(surviving.socket, "lifecycle-snapshot", (message) => {
      const snapshot = message.snapshot as {envelopes?: Array<{observation?: {subjectId?: string}}>} | undefined
      const ids = snapshot?.envelopes?.map(({observation}) => observation?.subjectId) ?? []
      return ids.includes(hamiltonianBrowserNodeId("surviving-profile")) && !ids.includes(closingBrowserId)
    })
    closing.socket.close()
    const retained = (await retainedWithoutClosedProfile).snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    const retainedIds = retained.envelopes.map(({observation}) => observation.subjectId)
    expect(retainedIds).not.toContain(closingBrowserId)
    expect(retainedIds).not.toContain(closingWorkerId)
    expect(retainedIds).not.toContain(closingPageId)
    expect(retainedIds).not.toContain(closingTransportId)
    expect(retainedIds).toContain(hamiltonianBrowserNodeId("surviving-profile"))
    expect(retainedIds).toContain(hamiltonianLifecycleEntityId("service-worker", "surviving-worker"))

    surviving.socket.close()
  })

  test("expires an abruptly closed browser profile only after its reconnect grace", async () => {
    const heartbeatMs = 100
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs})
    running.push(host)
    await host.bunReady

    const connectProfile = async (profileId: string, workerIdentity: string, tabId: string) => {
      const workerRuntimeIncarnation = `runtime:${workerIdentity}`
      const controlUrl = new URL("/control", host.server.url)
      controlUrl.protocol = "ws:"
      controlUrl.searchParams.set("token", host.token)
      controlUrl.searchParams.set("device", profileId)
      controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
      const socket = await openSocket(controlUrl)
      const hello = await nextMessage(socket, "hello")
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>
        if (message.kind !== "ping") return
        socket.send(JSON.stringify({
          kind: "pong",
          at: message.at,
          seq: message.seq,
          workerIdentity,
          workerRuntimeIncarnation,
        }))
      })
      const observedWorker = nextMessage(socket, "lifecycle", (message) => {
        const envelope = message.envelope as {observation?: {subjectId?: string}} | undefined
        return envelope?.observation?.subjectId === hamiltonianLifecycleEntityId("service-worker", workerIdentity)
      })
      socket.send(JSON.stringify(browserIdentityMessage(
        profileId,
        workerIdentity,
        workerRuntimeIncarnation,
        `resume:${workerIdentity}`,
      )))
      await observedWorker
      const topology = nextMessage(socket, "topology", (message) => {
        const peers = (message.topology as {peers?: Array<{connectionId?: string; windows?: unknown[]}>}).peers
        return peers?.some((peer) =>
          peer.connectionId === hello.connectionId && peer.windows?.length === 1) === true
      })
      socket.send(JSON.stringify({
        kind: "tabs",
        windows: [{tabId, joinedAt: 10, visible: true}],
      }))
      await topology
      return socket
    }

    const closingProfileId = "abrupt-profile"
    const closingWorkerIdentity = "abrupt-worker"
    const closingBrowserId = hamiltonianBrowserNodeId(closingProfileId)
    const closingWorkerId = hamiltonianLifecycleEntityId("service-worker", closingWorkerIdentity)
    const closing = await connectProfile(closingProfileId, closingWorkerIdentity, "abrupt-tab")
    const surviving = await connectProfile("grace-survivor", "grace-surviving-worker", "surviving-tab")
    const retainedAfterGrace = nextMessage(surviving, "lifecycle-snapshot", (message) => {
      const snapshot = message.snapshot as {envelopes?: Array<{observation?: {subjectId?: string}}>} | undefined
      const ids = snapshot?.envelopes?.map(({observation}) => observation?.subjectId) ?? []
      return ids.includes(hamiltonianBrowserNodeId("grace-survivor")) && !ids.includes(closingBrowserId)
    }, heartbeatMs * 8)

    closing.close()
    const retained = (await retainedAfterGrace).snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    const retainedIds = retained.envelopes.map(({observation}) => observation.subjectId)
    expect(retainedIds).not.toContain(closingBrowserId)
    expect(retainedIds).not.toContain(closingWorkerId)
    expect(retainedIds).toContain(hamiltonianBrowserNodeId("grace-survivor"))
    expect(retainedIds).toContain(hamiltonianLifecycleEntityId("service-worker", "grace-surviving-worker"))

    surviving.close()
  })

  test("cold-rebirths the Bun embodiment as a new OS process without another listener", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", version: "v-process"})
    running.push(host)
    const first = requireValue((await host.bunReady)["main-probe"], "initial main Bun lifecycle probe")
    const second = await host.rebirthBunEmbodiment()

    expect(first.state).toBe("ready")
    expect(second.state).toBe("ready")
    expect(second.version).toBe(first.version)
    expect(second.sha256).toBe(first.sha256)
    expect(second.incarnation).not.toBe(first.incarnation)
    expect(second.pid).not.toBe(first.pid)
    expect(requireValue(host.bunEmbodiments.snapshot()["worker-probe"], "worker Bun lifecycle probe").state).toBe("ready")
    expect(host.server.port).toBeGreaterThan(0)
  })

  test("auto-rebirths a crashed ready Bun process and replaces its retained lifecycle state", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      version: "v-crash-repair",
      placement: "server",
      heartbeatMs: 10_000,
    })
    running.push(host)
    const first = requireValue((await host.bunReady).main, "initial server main")
    const worker = requireValue(host.bunEmbodiments.snapshot().worker, "initial server worker")
    const firstAuthority = requireValue(first.authority, "initial server main authority")
    const firstEntityId = `bun-process:${first.incarnation}`
    const firstTransportId = `ipc:${first.incarnation}`

    const liveUrl = new URL("/control", host.server.url)
    liveUrl.protocol = "ws:"
    liveUrl.searchParams.set("token", host.token)
    liveUrl.searchParams.set("device", "crash-observer")
    liveUrl.searchParams.set("worker", "service-worker:crash-observer-worker")
    const live = await openSocket(liveUrl)
    const liveEnvelopes: Array<{
      eventId: string
      causedBy?: string | null
      observation: {type: string; phase: string; subjectId: string}
    }> = []
    live.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; envelope?: unknown}
      if (message.kind === "lifecycle") {
        liveEnvelopes.push(message.envelope as typeof liveEnvelopes[number])
      }
    })
    const admitted = nextMessage(live, "service-worker-current")
    live.send(JSON.stringify(browserIdentityMessage(
      "crash-observer",
      "crash-observer-worker",
      "crash-observer-runtime",
      "crash-observer-resume",
    )))
    await admitted

    expect(host.crashBunEmbodimentForTest("main")).toBe(first.pid)
    const repairDeadline = Date.now() + 5_000
    let replacement = host.bunEmbodiments.snapshot().main
    while (
      replacement?.state !== "ready" ||
      replacement.incarnation === first.incarnation ||
      replacement.pid === first.pid
    ) {
      if (Date.now() >= repairDeadline) throw new Error("Crashed Bun process was not automatically reborn")
      await Bun.sleep(5)
      replacement = host.bunEmbodiments.snapshot().main
    }
    const second = requireValue(replacement, "replacement server main")
    const secondAuthority = requireValue(second.authority, "replacement server main authority")
    const secondEntityId = `bun-process:${second.incarnation}`
    const secondTransportId = `ipc:${second.incarnation}`

    while (
      !liveEnvelopes.some(({observation}) => observation.phase === "ended" && observation.subjectId === firstEntityId) ||
      !liveEnvelopes.some(({observation}) => observation.phase === "changed" && observation.subjectId === secondEntityId)
    ) {
      if (Date.now() >= repairDeadline) throw new Error("Crash lifecycle did not reach the observer")
      await Bun.sleep(5)
    }
    const closed = requireValue(
      liveEnvelopes.find(({observation}) => observation.phase === "closed" && observation.subjectId === firstTransportId),
      "crashed process IPC closure",
    )
    const ended = requireValue(
      liveEnvelopes.find(({observation}) => observation.phase === "ended" && observation.subjectId === firstEntityId),
      "crashed process end",
    )
    expect(ended.causedBy).toBe(closed.eventId)
    expect(liveEnvelopes.some(({observation}) =>
      observation.phase === "opened" && observation.subjectId === secondTransportId
    )).toBeTrue()
    expect(secondAuthority.fencingToken).toBe(firstAuthority.fencingToken + 1)
    expect(secondAuthority.leaseId).not.toBe(firstAuthority.leaseId)
    expect(host.acceptsServerAuthorityForTest(firstAuthority)).toBeFalse()
    expect(host.acceptsServerAuthorityForTest(secondAuthority)).toBeTrue()
    expect(requireValue(host.bunEmbodiments.snapshot().worker, "unchanged server worker").pid).toBe(worker.pid)
    expect(host.server.port).toBeGreaterThan(0)

    const retainedUrl = new URL("/control", host.server.url)
    retainedUrl.protocol = "ws:"
    retainedUrl.searchParams.set("token", host.token)
    retainedUrl.searchParams.set("device", "retained-crash-observer")
    retainedUrl.searchParams.set("transport", `websocket:${crypto.randomUUID()}`)
    retainedUrl.searchParams.set("worker", `service-worker:${crypto.randomUUID()}`)
    let resolveSnapshot!: (snapshot: {envelopes: Array<{observation: {subjectId: string}}>}) => void
    const retainedSnapshot = new Promise<{envelopes: Array<{observation: {subjectId: string}}>}>(
      (resolve) => { resolveSnapshot = resolve },
    )
    const retained = new WebSocket(retainedUrl)
    retained.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; snapshot?: unknown}
      if (message.kind === "lifecycle-snapshot") {
        resolveSnapshot(message.snapshot as {envelopes: Array<{observation: {subjectId: string}}>})
      }
    })
    await new Promise<void>((resolve, reject) => {
      retained.addEventListener("open", () => resolve(), {once: true})
      retained.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const retainedSubjectIds = (await retainedSnapshot).envelopes.map(({observation}) => observation.subjectId)
    expect(retainedSubjectIds).not.toContain(firstEntityId)
    expect(retainedSubjectIds).not.toContain(firstTransportId)
    expect(retainedSubjectIds).toContain(secondEntityId)
    expect(retainedSubjectIds).toContain(secondTransportId)
    live.close()
    retained.close()
  }, 10_000)

  test("serializes concurrent rebirths of one Bun role", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", version: "v-race"})
    running.push(host)
    const initial = requireValue((await host.bunReady)["main-probe"], "initial main Bun lifecycle probe")
    const [first, second] = await Promise.all([
      host.rebirthBunEmbodiment("main-probe"),
      host.rebirthBunEmbodiment("main-probe"),
    ])

    expect(first.state).toBe("ready")
    expect(second.state).toBe("ready")
    expect(first.pid).not.toBe(initial.pid)
    expect(second.pid).not.toBe(first.pid)
    expect(requireValue(host.bunEmbodiments.snapshot()["main-probe"], "current main Bun lifecycle probe").pid).toBe(second.pid)
  })

  test("runs server-only main under exclusive authority and fences its previous incarnation", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      version: "v-server",
      placement: "server",
    })
    running.push(host)
    const initial = await host.bunReady
    const firstMain = requireValue(initial.main, "server main")
    const worker = requireValue(initial.worker, "server worker")
    const firstAuthority = requireValue(firstMain.authority, "server main authority")

    expect(host.placement).toBe("server")
    expect(host.getStatus().topology.leader).toBeNull()
    expect(worker.authority).toBeNull()
    expect(host.acceptsServerAuthorityForTest(firstAuthority)).toBeTrue()

    const secondMain = await host.rebirthBunEmbodiment("main")
    const secondAuthority = requireValue(secondMain.authority, "replacement server main authority")
    expect(secondMain.pid).not.toBe(firstMain.pid)
    expect(secondMain.incarnation).not.toBe(firstMain.incarnation)
    expect(secondAuthority.fencingToken).toBe(firstAuthority.fencingToken + 1)
    expect(secondAuthority.leaseId).not.toBe(firstAuthority.leaseId)
    expect(host.acceptsServerAuthorityForTest(firstAuthority)).toBeFalse()
    expect(host.acceptsServerAuthorityForTest(secondAuthority)).toBeTrue()
    expect(requireValue(host.bunEmbodiments.snapshot().worker, "unchanged server worker").pid).toBe(worker.pid)
  })

  test("does not grant a Window authority while server placement owns main", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      placement: "server",
    })
    running.push(host)
    await host.bunReady
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "browser-observer")
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", "observer-sw"))
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const admitted = nextMessage(socket, "service-worker-current")
    const topologyMessage = nextMessage(socket, "topology", (message) =>
      (message.topology as {peers?: unknown[]}).peers?.length === 1
    )
    socket.send(JSON.stringify(browserIdentityMessage(
      "browser-observer",
      "observer-sw",
      "observer-runtime",
      "observer-resume",
    )))
    await admitted
    socket.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "observer-tab", joinedAt: 10, visible: true}],
    }))
    const topology = (await topologyMessage).topology as {leader: unknown}
    expect(topology.leader).toBeNull()
    expect(host.getStatus().peer.assignment).toBeNull()
    socket.close()
  })

  test("does not birth a Bun process after host shutdown has started", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", placement: "server"})
    running.push(host)
    await host.bunReady
    const stopping = host.stop()
    await expect(host.rebirthBunEmbodiment("main")).rejects.toThrow("Hamiltonian host is stopping")
    await stopping
    expect(host.bunEmbodiments.snapshot().main?.pid).toBeNull()
    running.splice(running.indexOf(host), 1)
  })

  test("elects one Window across two device sockets and replaces a lost leader", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 1_000})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "device-a")
    controlUrl.searchParams.set("worker", "service-worker:leader-a")
    const first = await openSocket(controlUrl)
    await nextMessage(first, "hello")

    first.send(JSON.stringify(browserIdentityMessage(
      "device-a",
      "leader-a",
      "leader-runtime-a",
      "leader-resume-a",
    )))
    await nextMessage(first, "service-worker-current")
    const firstTopologyFrame = nextMessage(first, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-a")
    first.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "tab-a", joinedAt: 10, visible: true}],
    }))
    const firstTopology = await firstTopologyFrame
    expect(firstTopology.topology).toMatchObject({leader: {deviceId: "device-a", tabId: "tab-a"}})

    controlUrl.searchParams.set("device", "device-b")
    controlUrl.searchParams.set("worker", "service-worker:leader-b")
    const second = await openSocket(controlUrl)
    await nextMessage(second, "hello")
    second.send(JSON.stringify(browserIdentityMessage(
      "device-b",
      "leader-b",
      "leader-runtime-b",
      "leader-resume-b",
    )))
    await nextMessage(second, "service-worker-current")
    const stableTopologyFrame = nextMessage(second, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-a")
    second.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "tab-b", joinedAt: 20, visible: true}],
    }))
    const stableTopology = await stableTopologyFrame
    expect(stableTopology.topology).toMatchObject({leader: {deviceId: "device-a", tabId: "tab-a"}})

    const replacementFrame = nextMessage(second, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-b"
    )
    first.send(JSON.stringify({kind: "tabs", windows: []}))
    first.close()
    const replacement = await replacementFrame
    expect(replacement.topology).toMatchObject({leader: {deviceId: "device-b", tabId: "tab-b"}})
    second.close()
  })

  test("distinguishes one acknowledged connection from a reconnect epoch", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 100})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "stable-installation")

    const workerIdentity = "stable-service-worker"
    const connect = async (workerRuntimeIncarnation: string, workerCodeVersion: string) => {
      const url = new URL(controlUrl)
      const transportId = `websocket:${crypto.randomUUID()}`
      url.searchParams.set("transport", transportId)
      url.searchParams.set("worker", `service-worker:${workerIdentity}`)
      const socket = new WebSocket(url)
      const snapshot = nextMessage(socket, "lifecycle-snapshot")
      const helloMessage = nextMessage(socket, "hello")
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as {kind?: string; at?: number; seq?: number}
        if (message.kind !== "ping") return
        socket.send(JSON.stringify({
          kind: "pong",
          at: message.at,
          seq: message.seq,
          workerIdentity,
          workerRuntimeIncarnation,
        }))
      })
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), {once: true})
        socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
      })
      const [hello, lifecycleSnapshot] = await Promise.all([helloMessage, snapshot])
      const workerObserved = nextMessage(socket, "lifecycle", (message) => {
        const observation = (message.envelope as {
          observation?: {subjectId?: string; attributes?: {codeVersion?: string; runtimeIncarnation?: string}}
        } | undefined)?.observation
        return observation?.subjectId === `service-worker:${workerIdentity}` &&
          observation.attributes?.runtimeIncarnation === workerRuntimeIncarnation &&
          observation.attributes.codeVersion === workerCodeVersion
      })
      socket.send(JSON.stringify(browserIdentityMessage(
        "stable-installation",
        workerIdentity,
        workerRuntimeIncarnation,
        crypto.randomUUID(),
        {workerCodeVersion},
      )))
      await Promise.all([workerObserved, nextMessage(socket, "service-worker-current")])
      return {socket, connectionId: String(hello.connectionId), lifecycleSnapshot, transportId}
    }

    const first = await connect("sw-runtime-a", HAMILTONIAN_SERVICE_WORKER_CODE_VERSION)
    await Bun.sleep(80)
    const firstStatus = host.getStatus()
    expect(firstStatus.connections[0]).toMatchObject({
      connectionId: first.connectionId,
      workerIdentity,
      workerRuntimeIncarnation: "sw-runtime-a",
      workerCodeVersion: HAMILTONIAN_SERVICE_WORKER_CODE_VERSION,
    })
    expect(firstStatus.connections[0]!.lastAckSeq).toBeGreaterThan(0)
    const firstClosed = new Promise<void>((resolve) => {
      first.socket.addEventListener("close", () => resolve(), {once: true})
    })
    first.socket.close()
    await firstClosed
    await waitUntil(() => host.getStatus().events.some((event) =>
      event.kind === "connection-close" && event.connectionId === first.connectionId
    ), `server close observation for ${first.connectionId}`)

    const second = await connect("sw-runtime-b", HAMILTONIAN_SERVICE_WORKER_CODE_VERSION)
    expect(second.connectionId).not.toBe(first.connectionId)
    const retained = second.lifecycleSnapshot.snapshot as {
      envelopes: Array<{observation: {phase?: string; subjectId?: string; subjectKind?: string}}>
    }
    expect(retained.envelopes.some(({observation}) =>
      observation.phase === "closed" &&
      observation.subjectKind === "websocket" &&
      observation.subjectId === first.transportId
    )).toBeTrue()
    expect(host.getStatus().hostEpoch).toBe(host.hostEpoch)
    expect(host.getStatus().connections[0]).toMatchObject({
      workerIdentity,
      workerRuntimeIncarnation: "sw-runtime-b",
      workerCodeVersion: HAMILTONIAN_SERVICE_WORKER_CODE_VERSION,
    })
    second.socket.close()
  })

  test("removes closed WS state only after a page observes the old Service Worker endpoint ended", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "endpoint-retirement-browser")

    const connect = async (workerEntityId: string, transportId: string) => {
      const url = new URL(controlUrl)
      url.searchParams.set("worker", workerEntityId)
      url.searchParams.set("transport", transportId)
      const socket = new WebSocket(url)
      const snapshot = nextMessage(socket, "lifecycle-snapshot")
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), {once: true})
        socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
      })
      const workerIdentity = decodeURIComponent(workerEntityId.slice("service-worker:".length))
      const identityMessageId = `message:${crypto.randomUUID()}`
      const current = nextMessage(socket, "service-worker-current")
      socket.send(JSON.stringify(browserIdentityMessage(
        "endpoint-retirement-browser",
        workerIdentity,
        `runtime:${workerIdentity}`,
        `resume:${workerIdentity}`,
        {
        monitor: {messageId: identityMessageId, transportId},
        },
      )))
      await current
      return {socket, snapshot: await snapshot}
    }

    const oldWorkerEntityId = "service-worker:old-worker"
    const oldTransportId = "websocket:old-worker"
    const first = await connect(oldWorkerEntityId, oldTransportId)
    first.socket.close()
    await Bun.sleep(10)

    const currentWorkerEntityId = "service-worker:current-worker"
    const currentTransportId = "websocket:current-worker"
    const current = await connect(currentWorkerEntityId, currentTransportId)
    const before = current.snapshot.snapshot as {
      envelopes: Array<{observation: {subjectId: string}}>
    }
    expect(before.envelopes.some(({observation}) => observation.subjectId === oldTransportId)).toBeTrue()

    const pageSource = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 1,
    })
    const ended = pageSource.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: oldWorkerEntityId,
      subjectKind: "service-worker",
      ownerId: hamiltonianBrowserNodeId("endpoint-retirement-browser"),
      attributes: {
        state: "ended",
        successor: currentWorkerEntityId,
        reason: "superseded-by-observed-incarnation",
      },
    }))
    const echoed = nextMessage(current.socket, "lifecycle", (message) =>
      (message.envelope as {eventId?: string} | undefined)?.eventId === ended.eventId)
    current.socket.send(JSON.stringify({
      kind: "lifecycle-retirement",
      envelope: ended,
      monitor: {
        messageId: `message:${crypto.randomUUID()}`,
        transportId: currentTransportId,
      },
    }))
    await echoed

    const observer = await connect("service-worker:observer", "websocket:observer")
    const after = observer.snapshot.snapshot as {
      frontier: Array<{sourceId: string}>
      envelopes: Array<{observation: {subjectId: string}}>
    }
    expect(after.envelopes.some(({observation}) => observation.subjectId === oldTransportId)).toBeFalse()
    expect(after.frontier.some(({sourceId}) => sourceId === "page:page-a")).toBeFalse()
    current.socket.close()
    observer.socket.close()
  })

  test("rejects a forged Service Worker retirement that does not name the current worker as successor", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const workerEntityId = "service-worker:current-worker"
    const transportId = "websocket:current-worker"
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "forged-retirement-browser")
    controlUrl.searchParams.set("worker", workerEntityId)
    controlUrl.searchParams.set("transport", transportId)
    const socket = await openSocket(controlUrl)
    socket.send(JSON.stringify(browserIdentityMessage(
      "forged-retirement-browser",
      "current-worker",
      "current-runtime",
      "current-resume",
    )))
    await nextMessage(socket, "service-worker-current")

    const pageSource = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 1,
    })
    const forged = pageSource.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: "service-worker:old-worker",
      subjectKind: "service-worker",
      ownerId: hamiltonianBrowserNodeId("forged-retirement-browser"),
      attributes: {
        state: "ended",
        successor: "service-worker:not-the-socket-owner",
      },
    }))
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({
      kind: "lifecycle-retirement",
      envelope: forged,
      monitor: {
        messageId: `message:${crypto.randomUUID()}`,
        transportId,
      },
    }))
    expect((await closed).code).toBe(1008)
  })

  test("starts the next heartbeat only after the previous pong", async () => {
    const heartbeatMs = 50
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "causal-heartbeat")
    controlUrl.searchParams.set("transport", `websocket:${crypto.randomUUID()}`)
    controlUrl.searchParams.set("worker", "service-worker:causal-heartbeat")

    const queuedPings: Array<{at: number; seq: number}> = []
    const pingWaiters: Array<(ping: {at: number; seq: number}) => void> = []
    const socket = new WebSocket(controlUrl)
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; at?: number; seq?: number}
      if (message.kind !== "ping" || typeof message.at !== "number" || typeof message.seq !== "number") return
      const ping = {at: message.at, seq: message.seq}
      const waiter = pingWaiters.shift()
      if (waiter) waiter(ping)
      else queuedPings.push(ping)
    })
    const nextPing = async () => queuedPings.shift() ?? await new Promise<{at: number; seq: number}>((resolve) => {
      pingWaiters.push(resolve)
    })
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), {once: true})
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })

    const first = await nextPing()
    expect(first.seq).toBe(1)
    await Bun.sleep(heartbeatMs + 20)
    expect(host.getStatus().connections[0]).toMatchObject({lastChallengeSeq: 1, lastAckSeq: 0})

    socket.send(JSON.stringify({
      kind: "pong",
      ...first,
      workerIdentity: "causal-heartbeat",
      workerRuntimeIncarnation: "causal-runtime",
    }))
    const second = await nextPing()
    expect(second.seq).toBe(2)
    expect(second.at - first.at).toBeGreaterThanOrEqual(heartbeatMs)
    socket.close()
  })

  test("rejects a heartbeat acknowledgement that does not match the current challenge", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 1_000})
    running.push(host)
    await host.bunReady
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "forged-heartbeat")
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({
      kind: "pong",
      at: Date.now(),
      seq: 2,
      workerIdentity: "forged-worker",
      workerRuntimeIncarnation: "forged-runtime",
    }))
    expect((await closed).code).toBe(1008)
    expect(host.getStatus().connections).toHaveLength(0)
  })

  test("rejects a worker identity that does not match the control endpoint", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 1_000})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "bound-identity")
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", "expected-worker"))
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify(browserIdentityMessage(
      "bound-identity",
      "different-worker",
      "different-runtime",
      "bound-identity-resume",
    )))
    expect((await closed).code).toBe(1008)
  })

  test("rejects a matching heartbeat sequence attributed to another worker", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 1_000})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "bound-heartbeat")
    controlUrl.searchParams.set("transport", `websocket:${crypto.randomUUID()}`)
    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", "expected-worker"))
    const socket = new WebSocket(controlUrl)
    const challenged = nextMessage(socket, "ping")
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), {once: true})
      socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
    })
    const ping = await challenged
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({
      kind: "pong",
      at: ping.at,
      seq: ping.seq,
      workerIdentity: "different-worker",
      workerRuntimeIncarnation: "different-runtime",
    }))
    expect((await closed).code).toBe(1008)
  })

  test("rejects realtime lane payload on the signaling WebSocket", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token"})
    running.push(host)
    await host.bunReady
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "invalid-client")
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({kind: "oracle-payload", payload: {must: "not relay"}}))
    expect((await closed).code).toBe(1008)
    expect(host.getStatus().peer.realtimeFramesOnControlSocket).toBe(0)
  })

  test("rejects the removed edge-traffic protocol on the control WebSocket", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token"})
    running.push(host)
    await host.bunReady
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "legacy-traffic-client")
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, {once: true}))
    socket.send(JSON.stringify({
      kind: "edge-traffic",
      envelope: {
        kind: "hamiltonian-edge-traffic",
        version: 1,
        sourceId: "legacy",
        sequence: 1,
        at: Date.now(),
        edgeId: "fake",
        direction: "forward",
        messageClass: "fake",
      },
    }))
    expect((await closed).code).toBe(1008)
    expect(host.getStatus().connections).toHaveLength(0)
  })

  test("uses the control WebSocket only for signaling and sends oracle/force payload over direct DataChannels", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "browser-fixture",
      tabId: "tab-direct",
    })
    try {
      const response = await fixture.protocol.request("probe", {transport: "direct-rtc"})
      const forceEcho = new Promise((resolve) => fixture.protocol.onForce(resolve))
      fixture.protocol.publishForce({kind: "particle", value: 9})
      expect(response).toMatchObject({echo: {transport: "direct-rtc"}})
      expect(await forceEcho).toMatchObject({
        particle: {echo: {kind: "particle", value: 9}, receivedSequence: 1},
      })

      await Bun.sleep(50)
      const statusResponse = await fetch(new URL("/lab/status", host.server.url), {
        headers: {authorization: "Bearer test-token"},
      })
      const status = await statusResponse.json() as {
        peer: {
          signalingUp: number
          signalingDown: number
          realtimeFramesOnControlSocket: number
          snapshot: {oracleRequests: number; forceEvents: number}
        }
      }
      expect(status.peer.signalingUp).toBeGreaterThan(0)
      expect(status.peer.signalingDown).toBeGreaterThan(0)
      expect(status.peer.realtimeFramesOnControlSocket).toBe(0)
      expect(status.peer.snapshot).toMatchObject({oracleRequests: 1, forceEvents: 1})
    } finally {
      await fixture.peer.close()
      fixture.socket.close()
    }
  }, 20_000)

  test("declares exact current Oracle and Force DataChannels and retires them after peer replacement", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const deviceId = "declared-rtc-profile"
    const tabId = "declared-rtc-tab"
    const pageIncarnation = "declared-rtc-page"
    const pageId = hamiltonianLifecycleEntityId("page", pageIncarnation)
    const mainId = hamiltonianLifecycleEntityId("window-main", pageIncarnation)
    const fixture = await openDirectBrowserPeer(host, {deviceId, tabId})
    try {
      await waitUntil(() => {
        const snapshot = host.getStatus().peer.snapshot
        return snapshot?.state === "connected" &&
          snapshot.channels.includes("oracle") &&
          snapshot.channels.includes("force")
      }, "physical Oracle and Force DataChannels", 10_000)

      const browserRtcId = hamiltonianRtcPeerEntityId(fixture.sessionEpoch, "browser")
      const browserSnapshot = browserProfileLifecycleSnapshot(
        deviceId,
        fixture.workerIdentity,
        fixture.workerRuntimeIncarnation,
        [
          createHamiltonianLifecycleObservation({
            type: "entity", phase: "born", subjectId: pageId, subjectKind: "page",
            ownerId: hamiltonianBrowserNodeId(deviceId),
            attributes: {incarnation: pageIncarnation, tabId, state: "live"},
          }),
          createHamiltonianLifecycleObservation({
            type: "entity", phase: "born", subjectId: mainId, subjectKind: "window-main",
            ownerId: pageId, attributes: {role: "main", state: "active"},
          }),
          createHamiltonianLifecycleObservation({
            type: "entity", phase: "born", subjectId: browserRtcId, subjectKind: "rtc-peer",
            ownerId: mainId,
            attributes: {endpoint: "browser", sessionEpoch: fixture.sessionEpoch, state: "connected"},
          }),
        ],
      )
      const browserLogicalContourId = hamiltonianLogicalContourId("browser-profile", deviceId)
      const serverLogicalContourId = hamiltonianLogicalContourId("server", host.identity)
      const transportIds = (["oracle", "force"] as const)
        .map((lane) => hamiltonianDataChannelTransportId(fixture.sessionEpoch, lane))
      const transportIdSet = new Set(transportIds)
      const browserDeclarationFrame = nextMessage(fixture.socket, "node-system-declaration", (message) => {
        const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
        return declaration?.logicalContourId === browserLogicalContourId &&
          declaration.snapshot.snapshotId === browserSnapshot.snapshotId
      }, 10_000)
      const serverDeclarationFrame = nextMessage(fixture.socket, "node-system-declaration", (message) => {
        const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
        return declaration?.logicalContourId === serverLogicalContourId &&
          transportIds.every((transportId) => declaration.boundaryTransports.some((transport) =>
            transport.transportId === transportId))
      }, 10_000)
      fixture.socket.send(JSON.stringify({kind: "browser-lifecycle-snapshot", snapshot: browserSnapshot}))

      const browserDeclaration = (await browserDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
      const serverDeclaration = (await serverDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
      expect(serverDeclaration.boundaryTransports.filter(({kind}) => kind === "data-channel"))
        .toEqual(expect.arrayContaining(([
          ["oracle", transportIds[0]],
          ["force", transportIds[1]],
        ] as const).map(([lane, transportId]) => expect.objectContaining({
          transportId,
          kind: "data-channel",
          phase: "opened",
          owner: {
            logicalContourId: serverLogicalContourId,
            incarnation: host.hostEpoch,
            entityId: hamiltonianRtcPeerEntityId(fixture.sessionEpoch, "server"),
          },
          source: expect.objectContaining({
            entityId: hamiltonianRtcPeerEntityId(fixture.sessionEpoch, "server"),
          }),
          target: expect.objectContaining({
            logicalContourId: browserLogicalContourId,
            incarnation: fixture.workerRuntimeIncarnation,
            entityId: browserRtcId,
          }),
          attributes: {endpoint: "server", lane, sessionEpoch: fixture.sessionEpoch, state: "open"},
        }))))

      const projection = new HamiltonianLifecycleProjection({
        origin: host.server.url.href,
        deviceId,
        tabId,
        pageIncarnation,
        observedAt: Date.now(),
        navigationId: "declared-rtc-navigation",
        servedAt: Date.now(),
        server: {identity: host.identity, hostEpoch: host.hostEpoch, version: "v1"},
      })
      expect(projection.replaceDeclaration(browserDeclaration)).toBeTrue()
      expect(projection.replaceDeclaration(serverDeclaration)).toBeTrue()
      expect(projection.document().edges.filter(({id}) => transportIdSet.has(id)))
        .toHaveLength(2)

      const retiredDeclarationFrame = nextMessage(fixture.socket, "node-system-declaration", (message) => {
        const declaration = message.declaration as HamiltonianNodeSystemDeclaration | undefined
        return declaration?.logicalContourId === serverLogicalContourId &&
          declaration.revision > serverDeclaration.revision &&
          transportIds.every((transportId) => !declaration.boundaryTransports.some((transport) =>
            transport.transportId === transportId))
      }, 10_000)
      const assignment = requireValue(host.getStatus().peer.assignment, "current peer assignment")
      fixture.socket.send(JSON.stringify({
        kind: "peer-failed",
        peerId: assignment.peerId,
        sessionEpoch: assignment.sessionEpoch,
        peerGeneration: assignment.peerGeneration,
        authorityKey: assignment.authorityKey,
        tabId: assignment.tabId,
        reason: "fixture peer replacement",
      }))
      const retiredDeclaration = (await retiredDeclarationFrame).declaration as HamiltonianNodeSystemDeclaration
      expect(projection.replaceDeclaration(retiredDeclaration)).toBeTrue()
      expect(projection.document().edges.some(({id}) => transportIdSet.has(id)))
        .toBeFalse()
    } finally {
      await fixture.peer.close()
      fixture.socket.close()
    }
  }, 20_000)

  test("rebinds a new control connection to the same authority and live direct peer", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const first = await openDirectBrowserPeer(host, {
      deviceId: "stable-browser",
      tabId: "stable-window",
    })
    const firstResponse = await first.protocol.request("probe", {generation: 1})
    expect(firstResponse).toMatchObject({echo: {generation: 1}})
    const firstAssignment = requireValue(host.getStatus().peer.assignment, "first peer assignment")
    const firstClosed = new Promise<void>((resolve) =>
      first.socket.addEventListener("close", () => resolve(), {once: true})
    )
    first.socket.close()
    await firstClosed

    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "stable-browser")
    const replacementWorkerRuntimeIncarnation = `${first.workerRuntimeIncarnation}:reborn`
    controlUrl.searchParams.set(
      "worker",
      hamiltonianLifecycleEntityId("service-worker", first.workerIdentity),
    )
    const secondSocket = await openSocket(controlUrl)
    const hello = await nextMessage(secondSocket, "hello")
    secondSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; at?: number; seq?: number}
      if (message.kind !== "ping") return
      secondSocket.send(JSON.stringify({
        kind: "pong",
        at: message.at,
        seq: message.seq,
        workerIdentity: first.workerIdentity,
        workerRuntimeIncarnation: replacementWorkerRuntimeIncarnation,
      }))
    })
    const resumed = nextMessage(secondSocket, "topology", (message) =>
      (message.topology as {leader?: {connectionId?: string}}).leader?.connectionId === hello.connectionId
    )
    const admitted = nextMessage(secondSocket, "service-worker-current")
    secondSocket.send(JSON.stringify(browserIdentityMessage(
      "stable-browser",
      first.workerIdentity,
      replacementWorkerRuntimeIncarnation,
      first.resumeNonce,
    )))
    await admitted
    secondSocket.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "stable-window", joinedAt: 10, visible: true}],
    }))
    await resumed
    try {
      const secondResponse = await first.protocol.request("probe", {generation: 2})
      expect(secondResponse).toMatchObject({echo: {generation: 2}})
      expect(hello.connectionId).not.toBe(first.connectionId)
      expect(host.getStatus().topology.leader).toMatchObject({
        connectionId: hello.connectionId,
        leaseId: firstAssignment.key,
        fencingToken: 1,
      })
      expect(host.getStatus().peer.assignment).toMatchObject({
        connectionId: hello.connectionId,
        sessionEpoch: first.sessionEpoch,
        peerId: firstAssignment.peerId,
      })
      expect(host.getStatus().peer.realtimeFramesOnControlSocket).toBe(0)
    } finally {
      await first.peer.close()
      secondSocket.close()
    }
  }, 35_000)

  test("starts a new peer generation when control resumes before RTC became ready", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "negotiating-browser")
    const workerIdentity = "negotiating-sw"
    const firstWorkerRuntimeIncarnation = "negotiating-runtime-a"
    const resumeNonce = "stable-profile-resume"

    controlUrl.searchParams.set("worker", hamiltonianLifecycleEntityId("service-worker", workerIdentity))
    const firstSocket = await openSocket(controlUrl)
    await nextMessage(firstSocket, "hello")
    const firstOffer = nextMessage(
      firstSocket,
      "peer-signal",
      (message) => (message.signal as {type?: string})?.type === "description",
      10_000,
    )
    const firstAdmitted = nextMessage(firstSocket, "service-worker-current")
    firstSocket.send(JSON.stringify(browserIdentityMessage(
      "negotiating-browser",
      workerIdentity,
      firstWorkerRuntimeIncarnation,
      resumeNonce,
    )))
    await firstAdmitted
    firstSocket.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "negotiating-tab", joinedAt: 10, visible: true}],
    }))
    await firstOffer
    const firstAssignment = requireValue(host.getStatus().peer.assignment, "negotiating assignment")
    const firstClosed = new Promise<void>((resolve) =>
      firstSocket.addEventListener("close", () => resolve(), {once: true})
    )
    firstSocket.close()
    await firstClosed

    const replacementWorkerRuntimeIncarnation = "negotiating-runtime-b"
    controlUrl.searchParams.set(
      "worker",
      hamiltonianLifecycleEntityId("service-worker", workerIdentity),
    )
    const secondSocket = await openSocket(controlUrl)
    const hello = await nextMessage(secondSocket, "hello")
    const resumedTopology = nextMessage(secondSocket, "topology", (message) =>
      (message.topology as {leader?: {connectionId?: string}}).leader?.connectionId === hello.connectionId
    )
    const replacementOffer = nextMessage(
      secondSocket,
      "peer-signal",
      (message) => Number(message.peerGeneration) > firstAssignment.peerGeneration,
      10_000,
    )
    const replacementAdmitted = nextMessage(secondSocket, "service-worker-current")
    secondSocket.send(JSON.stringify(browserIdentityMessage(
      "negotiating-browser",
      workerIdentity,
      replacementWorkerRuntimeIncarnation,
      resumeNonce,
    )))
    await replacementAdmitted
    secondSocket.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "negotiating-tab", joinedAt: 10, visible: true}],
    }))

    await Promise.all([resumedTopology, replacementOffer])
    const replacement = requireValue(host.getStatus().peer.assignment, "replacement assignment")
    expect(replacement.connectionId).toBe(String(hello.connectionId))
    expect(replacement.authorityKey).toBe(firstAssignment.authorityKey)
    expect(replacement.peerGeneration).toBeGreaterThan(firstAssignment.peerGeneration)
    expect(replacement.sessionEpoch).not.toBe(firstAssignment.sessionEpoch)
    secondSocket.close()
  }, 20_000)

  test("repairs RTC under the same control connection and authority", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "repair-browser",
      tabId: "repair-window",
    })
    const firstAssignment = requireValue(host.getStatus().peer.assignment, "first peer assignment")
    fixture.socket.send(JSON.stringify({
      kind: "peer-failed",
      peerId: firstAssignment.peerId,
      sessionEpoch: firstAssignment.sessionEpoch,
      peerGeneration: firstAssignment.peerGeneration,
      authorityKey: firstAssignment.authorityKey,
      tabId: firstAssignment.tabId,
      reason: "fixture DataChannel loss",
    }))

    const replacement = await fixture.nextPeer()
    try {
      const response = await replacement.protocol.request("probe", {afterRepair: true})
      const secondAssignment = requireValue(host.getStatus().peer.assignment, "replacement peer assignment")
      expect(response).toMatchObject({echo: {afterRepair: true}})
      expect(secondAssignment.connectionId).toBe(firstAssignment.connectionId)
      expect(secondAssignment.authorityKey).toBe(firstAssignment.authorityKey)
      expect(secondAssignment.peerGeneration).toBeGreaterThan(firstAssignment.peerGeneration)
      expect(secondAssignment.sessionEpoch).not.toBe(firstAssignment.sessionEpoch)
      expect(host.getStatus().peer.peerRepairs).toBe(1)

      fixture.socket.send(JSON.stringify({
        kind: "peer-signal",
        peerId: firstAssignment.peerId,
        sessionEpoch: firstAssignment.sessionEpoch,
        peerGeneration: firstAssignment.peerGeneration,
        authorityKey: firstAssignment.authorityKey,
        tabId: firstAssignment.tabId,
        signal: {type: "candidate", candidate: null},
      }))
      await Bun.sleep(10)
      expect(fixture.socket.readyState).toBe(WebSocket.OPEN)
      expect(host.getStatus().peer.stalePeerFramesDropped).toBeGreaterThan(0)
    } finally {
      await Promise.all([fixture.peer.close(), replacement.peer.close()])
      fixture.socket.close()
    }
  }, 35_000)

  test("correlates a peer begin error before the new generation publishes a snapshot", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "begin-error-browser",
      tabId: "begin-error-window",
    })
    const firstAssignment = requireValue(host.getStatus().peer.assignment, "initial peer assignment")
    const failedAssignment = requireValue(
      host.requestPeerRepairForTest("prepare begin failure"),
      "failed peer assignment",
    )
    expect(failedAssignment.peerGeneration).toBe(firstAssignment.peerGeneration + 1)
    expect(host.getStatus().peer.snapshot?.peerId).not.toBe(failedAssignment.peerId)

    host.reportPeerErrorForTest(failedAssignment.peerId, "fixture begin failed before peer-state")
    const replacement = await fixture.nextPeer()
    try {
      const response = await replacement.protocol.request("probe", {afterBeginError: true})
      const current = requireValue(host.getStatus().peer.assignment, "repaired peer assignment")
      expect(response).toMatchObject({echo: {afterBeginError: true}})
      expect(current.peerGeneration).toBeGreaterThan(failedAssignment.peerGeneration)
      expect(current.sessionEpoch).not.toBe(failedAssignment.sessionEpoch)
      expect(host.getStatus().peer.peerRepairs).toBe(2)
    } finally {
      await Promise.all([fixture.peer.close(), replacement.peer.close()])
      fixture.socket.close()
    }
  }, 35_000)

  test("keeps direct realtime alive without control signaling until lease expiry", async () => {
    const heartbeatMs = 250
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "detached-browser",
      tabId: "detached-window",
    })
    const assignment = requireValue(host.getStatus().peer.assignment, "detached peer assignment")
    const controlBefore = host.getStatus().peer.controlFramesIn
    const signalingBefore = {
      up: host.getStatus().peer.signalingUp,
      down: host.getStatus().peer.signalingDown,
    }
    const closed = new Promise<CloseEvent>((resolve) => fixture.socket.addEventListener("close", resolve, {once: true}))
    fixture.socket.close()
    await closed

    try {
      const response = await fixture.protocol.request("probe", {withoutSignaling: true})
      const forceEcho = new Promise((resolve) => fixture.protocol.onForce(resolve))
      fixture.protocol.publishForce({kind: "particle", withoutSignaling: true})
      expect(response).toMatchObject({echo: {withoutSignaling: true}})
      expect(await forceEcho).toMatchObject({
        particle: {echo: {kind: "particle", withoutSignaling: true}},
      })
      expect(host.getStatus().connections).toHaveLength(0)
      expect(host.getStatus().peer.assignment).toMatchObject({
        peerId: assignment.peerId,
        authorityKey: assignment.authorityKey,
      })
      expect(host.getStatus().peer.controlFramesIn).toBe(controlBefore)
      expect(host.getStatus().peer.signalingUp).toBe(signalingBefore.up)
      expect(host.getStatus().peer.signalingDown).toBe(signalingBefore.down)

      await Bun.sleep(heartbeatMs * 3 + 100)
      expect(host.getStatus().peer.assignment).toBeNull()
    } finally {
      await fixture.peer.close()
    }
  }, 20_000)

  test("rebirths a crashed Bun peer process and repairs direct RTC", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "process-recovery-browser",
      tabId: "process-recovery-window",
    })
    const before = host.getStatus().peer.process
    const beforeAssignment = requireValue(host.getStatus().peer.assignment, "peer assignment before process crash")
    const killedPid = host.crashPeerProcessForTest()
    expect(killedPid).toBe(before.pid)

    const replacementPromise = fixture.nextPeer()
    const replacementDeadline = Date.now() + 10_000
    while (true) {
      const observed = host.getStatus().peer
      if (observed.snapshot && observed.assignment) {
        expect(observed.snapshot.peerId).toBe(observed.assignment.peerId)
        expect(observed.snapshot.sessionEpoch).toBe(observed.assignment.sessionEpoch)
      }
      if (
        observed.process.state === "online" &&
        observed.process.unexpectedExits === 1 &&
        observed.assignment?.sessionEpoch !== beforeAssignment.sessionEpoch &&
        observed.snapshot?.state === "connected"
      ) break
      if (Date.now() >= replacementDeadline) throw new Error("Peer process did not expose one coherent replacement")
      await Bun.sleep(5)
    }
    const replacement = await replacementPromise
    try {
      const response = await replacement.protocol.request("probe", {afterProcessRebirth: true})
      const after = host.getStatus().peer.process
      expect(response).toMatchObject({echo: {afterProcessRebirth: true}})
      expect(after.state).toBe("online")
      expect(after.pid).toBeGreaterThan(0)
      expect(after.pid).not.toBe(before.pid)
      expect(after.incarnation).not.toBe(before.incarnation)
      expect(after.generation).toBeGreaterThan(before.generation)
      expect(after.unexpectedExits).toBe(1)
      expect(host.getStatus().peer.peerRepairs).toBe(1)

      const inspectionUrl = new URL("/control", host.server.url)
      inspectionUrl.protocol = "ws:"
      inspectionUrl.searchParams.set("token", host.token)
      inspectionUrl.searchParams.set("device", "process-recovery-inspector")
      inspectionUrl.searchParams.set("worker", "service-worker:process-recovery-inspector")
      const inspectionSocket = await openSocket(inspectionUrl)
      const lifecycleSnapshot = await nextMessage(inspectionSocket, "lifecycle-snapshot")
      inspectionSocket.close()
      const retained = lifecycleSnapshot.snapshot as {
        envelopes: Array<{observation: {
          type: string
          subjectId: string
          subjectKind: string
          ownerId: string | null
          attributes: Record<string, unknown>
        }}>
      }
      const serverRtc = retained.envelopes.filter(({observation}) =>
        observation.type === "entity" &&
        observation.subjectKind === "rtc-peer" &&
        observation.attributes.endpoint === "server"
      )
      expect(serverRtc).toHaveLength(1)
      expect(serverRtc[0]!.observation).toMatchObject({
        ownerId: hamiltonianLifecycleEntityId("peer-process", after.incarnation!),
        attributes: {sessionEpoch: replacement.sessionEpoch},
      })
      expect(serverRtc[0]!.observation.subjectId).not.toContain(beforeAssignment.sessionEpoch)
    } finally {
      await Promise.all([fixture.peer.close(), replacement.peer.close()])
      fixture.socket.close()
    }
  }, 35_000)

  test("repairs a crashed Bun peer process after detached control resumes", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    const fixture = await openDirectBrowserPeer(host, {
      deviceId: "detached-process-recovery-browser",
      tabId: "detached-process-recovery-window",
    })
    const firstAssignment = requireValue(host.getStatus().peer.assignment, "first peer assignment")
    const firstClosed = new Promise<void>((resolve) =>
      fixture.socket.addEventListener("close", () => resolve(), {once: true})
    )
    fixture.socket.close()
    await firstClosed

    const killedPid = host.crashPeerProcessForTest()
    expect(killedPid).toBeGreaterThan(0)
    const processRestartedAt = Date.now() + 10_000
    while (
      host.getStatus().peer.process.unexpectedExits < 1 ||
      host.getStatus().peer.process.state !== "online"
    ) {
      if (Date.now() >= processRestartedAt) throw new Error("Peer process did not restart")
      await Bun.sleep(10)
    }
    expect(host.getStatus().peer.assignment).toMatchObject({
      peerId: firstAssignment.peerId,
      peerGeneration: firstAssignment.peerGeneration,
    })
    expect(host.getStatus().peer.error).not.toBeNull()

    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", host.token)
    controlUrl.searchParams.set("device", "detached-process-recovery-browser")
    const replacementWorkerRuntimeIncarnation = `${fixture.workerRuntimeIncarnation}:reborn`
    controlUrl.searchParams.set(
      "worker",
      hamiltonianLifecycleEntityId("service-worker", fixture.workerIdentity),
    )
    const secondSocket = await openSocket(controlUrl)
    const hello = await nextMessage(secondSocket, "hello")
    const resumedTopology = nextMessage(secondSocket, "topology", (message) =>
      (message.topology as {leader?: {connectionId?: string}}).leader?.connectionId === hello.connectionId
    )
    const replacementOffer = nextMessage(
      secondSocket,
      "peer-signal",
      (message) => Number(message.peerGeneration) > firstAssignment.peerGeneration,
      10_000,
    )
    const admitted = nextMessage(secondSocket, "service-worker-current")
    secondSocket.send(JSON.stringify(browserIdentityMessage(
      "detached-process-recovery-browser",
      fixture.workerIdentity,
      replacementWorkerRuntimeIncarnation,
      fixture.resumeNonce,
    )))
    await admitted
    secondSocket.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "detached-process-recovery-window", joinedAt: 10, visible: true}],
    }))

    await Promise.all([resumedTopology, replacementOffer])
    const replacement = requireValue(host.getStatus().peer.assignment, "replacement peer assignment")
    expect(replacement.connectionId).toBe(String(hello.connectionId))
    expect(replacement.authorityKey).toBe(firstAssignment.authorityKey)
    expect(replacement.peerGeneration).toBeGreaterThan(firstAssignment.peerGeneration)
    expect(replacement.sessionEpoch).not.toBe(firstAssignment.sessionEpoch)
    expect(host.getStatus().peer.peerRepairs).toBe(1)
    await fixture.peer.close()
    secondSocket.close()
  }, 35_000)
})
