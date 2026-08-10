import {afterEach, describe, expect, test} from "bun:test"
import {
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
} from "./core/lifecycle.js"
import {createHamiltonianHost} from "./host.ts"
import {WeriftPeer, type PeerSignal} from "./peer/werift-peer.ts"

const running: Array<ReturnType<typeof createHamiltonianHost>> = []

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) throw new Error(`Missing ${label}`)
  return value
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((host) => host.stop()))
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

async function openSocket(url: URL): Promise<WebSocket> {
  if (url.pathname === "/control") {
    url.searchParams.set("transport", url.searchParams.get("transport") ?? `websocket:${crypto.randomUUID()}`)
    url.searchParams.set("worker", url.searchParams.get("worker") ?? `service-worker:${crypto.randomUUID()}`)
  }
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), {once: true})
    socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
  })
  return socket
}

async function openDirectBrowserPeer(
  host: ReturnType<typeof createHamiltonianHost>,
  {
    deviceId,
    tabId,
    workerIncarnationId = `fixture-worker:${deviceId}`,
    resumeNonce = crypto.randomUUID(),
  }: {deviceId: string; tabId: string; workerIncarnationId?: string; resumeNonce?: string},
) {
  await host.bunReady
  const controlUrl = new URL("/control", host.server.url)
  controlUrl.protocol = "ws:"
  controlUrl.searchParams.set("token", host.token)
  controlUrl.searchParams.set("device", deviceId)
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
        workerIncarnationId,
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

  socket.send(JSON.stringify({kind: "identity", workerIncarnationId, resumeNonce}))
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
    workerIncarnationId,
    resumeNonce,
    nextPeer,
  }
}

describe("isolated Hamiltonian host", () => {
  test("serves bootstrap and an authenticated, hashed version from one listener", async () => {
    const host = createHamiltonianHost({
      port: 0,
      token: "test-token",
      version: "v-test",
      browserBundles: {
        orchestration: "export const testOrchestrationBundle = true",
        layoutWorker: "export const testLayoutWorkerBundle = true",
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
    expect(bootstrapSource).toContain('meta name="hamiltonian-local-join-token" content="test-token"')
    expect(bootstrapSource).not.toContain("__HAMILTONIAN_HOST_EPOCH__")
    expect(bootstrapSource).toContain('<link rel="icon" href="data:image/svg+xml,')
    expect(bootstrapSource).toContain('src="/window-entry.js"')

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
    }
    expect(manifest.version).toBe("v-test")
    expect(manifest.sha256).toHaveLength(64)

    const moduleResponse = await fetch(new URL(manifest.moduleUrl, host.server.url), {
      headers: {authorization: "Bearer test-token"},
    })
    expect(moduleResponse.status).toBe(200)
    expect(moduleResponse.headers.get("x-hamiltonian-sha256")).toBe(manifest.sha256)
    const source = await moduleResponse.text()
    expect(source).toContain('export const version = "v-test"')
    expect(source).toContain("export function createEmbodiment")

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
    expect(browserSource).toContain("parseLocalHamiltonianWindowAction(event.detail, deviceId, tabId, pageIncarnation)")
    expect(browserSource).toContain("emitHamiltonianLifecycle(createHamiltonianLifecycleObservation")
    expect(browserSource).toContain('subjectKind: "browser-runtime"')
    expect(browserSource).toContain("browserEntityId,")
    expect(browserSource).toContain('subjectKind: "page"')
    expect(browserSource).toContain("closeDedicatedWorkerFromOwner(previous")

    const serviceWorkerBootstrap = await fetch(new URL("/sw.js", host.server.url))
    expect(serviceWorkerBootstrap.status).toBe(200)
    const serviceWorkerSource = await serviceWorkerBootstrap.text()
    expect(serviceWorkerSource).toContain('subjectKind: "service-worker"')
    expect(serviceWorkerSource).toContain('subjectKind: "controller"')
    expect(serviceWorkerSource).toContain('subjectKind: "message-port"')
    expect(serviceWorkerSource).toContain('lifecycleIdentifier(message.browserEntityId, "browser:")')
    expect(serviceWorkerSource).toContain("nextBrowserEntityId !== hamiltonianBrowserNodeId(message.deviceId)")
    expect(serviceWorkerSource).toContain("ownerId: nextBrowserEntityId")
    expect(serviceWorkerSource).toContain('window.port.postMessage({kind: "lifecycle-snapshot", snapshot})')
    expect(serviceWorkerSource).toContain('sendSocket({kind: "lifecycle-retirement", envelope})')
    expect(serviceWorkerSource).not.toContain("HAMILTONIAN_ORCHESTRATION_CHANNEL")

    const serviceWorkerEntry = await fetch(new URL("/sw-entry.js", host.server.url))
    expect(serviceWorkerEntry.status).toBe(200)
    const serviceWorkerEntrySource = await serviceWorkerEntry.text()
    const serviceWorkerMonitorImportIndex = serviceWorkerEntrySource.indexOf('import "/core/monitor.js"')
    expect(serviceWorkerMonitorImportIndex).toBeGreaterThan(-1)
    expect(serviceWorkerMonitorImportIndex)
      .toBeLessThan(serviceWorkerEntrySource.indexOf('import "/sw.js?lifecycle-v19"'))
    expect(serviceWorkerEntrySource).toContain("joins its observed browser-runtime owner")

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

  test("sends retained current state and a causal frontier before live control messages", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 10_000})
    running.push(host)
    await host.bunReady

    const transportId = `websocket:${crypto.randomUUID()}`
    const workerEntityId = `service-worker:${crypto.randomUUID()}`
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
      observation?.phase === "sent" &&
      observation.messageId === helloMonitor.messageId &&
      observation.transportId === transportId
    )).toBeTrue()

    const inboundMessageId = `message:${crypto.randomUUID()}`
    const received = nextMessage(socket, "lifecycle", (message) => {
      const envelope = message.envelope as {observation?: {phase?: string; messageId?: string; transportId?: string}}
      return envelope.observation?.phase === "received" &&
        envelope.observation.messageId === inboundMessageId &&
        envelope.observation.transportId === transportId
    })
    socket.send(JSON.stringify({
      kind: "identity",
      workerIncarnationId: "journal-worker",
      resumeNonce: "journal-resume",
      monitor: {messageId: inboundMessageId, transportId},
    }))
    await received
    socket.close()
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
    const socket = await openSocket(controlUrl)
    await nextMessage(socket, "hello")
    const topologyMessage = nextMessage(socket, "topology", (message) =>
      (message.topology as {peers?: unknown[]}).peers?.length === 1
    )
    socket.send(JSON.stringify({
      kind: "identity",
      workerIncarnationId: "observer-sw",
      resumeNonce: "observer-resume",
    }))
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
    const first = await openSocket(controlUrl)
    await nextMessage(first, "hello")

    first.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "tab-a", joinedAt: 10, visible: true}],
    }))
    const firstTopology = await nextMessage(first, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-a"
    )
    expect(firstTopology.topology).toMatchObject({leader: {deviceId: "device-a", tabId: "tab-a"}})

    controlUrl.searchParams.set("device", "device-b")
    const second = await openSocket(controlUrl)
    await nextMessage(second, "hello")
    second.send(JSON.stringify({
      kind: "tabs",
      windows: [{tabId: "tab-b", joinedAt: 20, visible: true}],
    }))
    const stableTopology = await nextMessage(second, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-a"
    )
    expect(stableTopology.topology).toMatchObject({leader: {deviceId: "device-a", tabId: "tab-a"}})

    first.close()
    const replacement = await nextMessage(second, "topology", (message) =>
      (message.topology as {leader?: {tabId?: string}}).leader?.tabId === "tab-b"
    )
    expect(replacement.topology).toMatchObject({leader: {deviceId: "device-b", tabId: "tab-b"}})
    second.close()
  })

  test("distinguishes one acknowledged connection from a reconnect epoch", async () => {
    const host = createHamiltonianHost({port: 0, token: "test-token", heartbeatMs: 25})
    running.push(host)
    const controlUrl = new URL("/control", host.server.url)
    controlUrl.protocol = "ws:"
    controlUrl.searchParams.set("token", "test-token")
    controlUrl.searchParams.set("device", "stable-installation")

    const connect = async (workerIncarnationId: string) => {
      const url = new URL(controlUrl)
      const transportId = `websocket:${crypto.randomUUID()}`
      url.searchParams.set("transport", transportId)
      url.searchParams.set("worker", `service-worker:${workerIncarnationId}`)
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
          workerIncarnationId,
        }))
      })
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), {once: true})
        socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {once: true})
      })
      const [hello, lifecycleSnapshot] = await Promise.all([helloMessage, snapshot])
      socket.send(JSON.stringify({
        kind: "identity",
        workerIncarnationId,
        resumeNonce: crypto.randomUUID(),
      }))
      return {socket, connectionId: String(hello.connectionId), lifecycleSnapshot, transportId}
    }

    const first = await connect("sw-incarnation-a")
    await Bun.sleep(80)
    const firstStatus = host.getStatus()
    expect(firstStatus.connections[0]).toMatchObject({
      connectionId: first.connectionId,
      workerIncarnationId: "sw-incarnation-a",
    })
    expect(firstStatus.connections[0]!.lastAckSeq).toBeGreaterThan(0)
    first.socket.close()
    await Bun.sleep(10)

    const second = await connect("sw-incarnation-b")
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
      ownerId: oldWorkerEntityId,
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
      ownerId: "service-worker:old-worker",
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

  test("rejects a heartbeat acknowledgement that was never challenged", async () => {
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
      seq: 1,
      workerIncarnationId: "forged-worker",
    }))
    expect((await closed).code).toBe(1008)
    expect(host.getStatus().connections).toHaveLength(0)
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
    const secondSocket = await openSocket(controlUrl)
    const hello = await nextMessage(secondSocket, "hello")
    const replacementWorkerIncarnationId = `${first.workerIncarnationId}:reborn`
    secondSocket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {kind?: string; at?: number; seq?: number}
      if (message.kind !== "ping") return
      secondSocket.send(JSON.stringify({
        kind: "pong",
        at: message.at,
        seq: message.seq,
        workerIncarnationId: replacementWorkerIncarnationId,
      }))
    })
    const resumed = nextMessage(secondSocket, "topology", (message) =>
      (message.topology as {leader?: {connectionId?: string}}).leader?.connectionId === hello.connectionId
    )
    secondSocket.send(JSON.stringify({
      kind: "identity",
      workerIncarnationId: replacementWorkerIncarnationId,
      resumeNonce: first.resumeNonce,
    }))
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
    const workerIncarnationId = "negotiating-sw-a"
    const resumeNonce = "stable-profile-resume"

    const firstSocket = await openSocket(controlUrl)
    await nextMessage(firstSocket, "hello")
    const firstOffer = nextMessage(
      firstSocket,
      "peer-signal",
      (message) => (message.signal as {type?: string})?.type === "description",
      10_000,
    )
    firstSocket.send(JSON.stringify({kind: "identity", workerIncarnationId, resumeNonce}))
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
    secondSocket.send(JSON.stringify({
      kind: "identity",
      workerIncarnationId: "negotiating-sw-b",
      resumeNonce,
    }))
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
    secondSocket.send(JSON.stringify({
      kind: "identity",
      workerIncarnationId: `${fixture.workerIncarnationId}:reborn`,
      resumeNonce: fixture.resumeNonce,
    }))
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
