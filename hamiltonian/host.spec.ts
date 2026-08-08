import {afterEach, describe, expect, test} from "bun:test"
import {createNodeSystemRouteRequest, type PositionedNodeSystem} from "@ui/node"
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
    const host = createHamiltonianHost({port: 0, token: "test-token", version: "v-test"})
    running.push(host)

    const bootstrap = await fetch(host.server.url)
    expect(bootstrap.status).toBe(200)
    expect(await bootstrap.text()).toContain("Hamiltonian")

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
    expect(await workerBootstrap.text()).toContain('runtime: "dedicated-worker"')

    const browserBootstrap = await fetch(new URL("/app.js", host.server.url))
    expect(browserBootstrap.status).toBe(200)
    const browserSource = await browserBootstrap.text()
    expect(browserSource).toContain('channel.label !== "oracle"')
    expect(browserSource).toContain("lanes: {oracle, force}")

    const serviceWorkerBootstrap = await fetch(new URL("/sw.js", host.server.url))
    expect(serviceWorkerBootstrap.status).toBe(200)
    expect(await serviceWorkerBootstrap.text()).toContain("HAMILTONIAN_ORCHESTRATION_CHANNEL")

    const orchestrationContract = await fetch(new URL("/core/orchestration.js", host.server.url))
    expect(orchestrationContract.status).toBe(200)
    expect(await orchestrationContract.text()).toContain("metafor.hamiltonian.orchestration.v1")

    const orchestrationBundle = await fetch(new URL("/orchestration.js", host.server.url))
    expect(orchestrationBundle.status).toBe(200)
    const orchestrationSource = await orchestrationBundle.text()
    expect(orchestrationSource).toContain("HAMILTONIAN · LIVE ORCHESTRATION")
    expect(orchestrationSource).toContain("BroadcastChannel · UI projection")
    expect(orchestrationSource).toContain("struct GlobalUniforms")
    expect(orchestrationSource).not.toContain("mesh_basic-")

    const fixedLayout: PositionedNodeSystem = {
      revision: "host-route:1",
      bounds: {x: 0, y: 0, w: 400, h: 120},
      nodes: [
        {
          node: {id: "source", title: "source", ports: [{id: "out", direction: "out"}]},
          rect: {x: 0, y: 20, w: 80, h: 60},
          ports: [{port: {id: "out", direction: "out"}, center: {x: 80, y: 50}}],
        },
        {node: {id: "obstacle", title: "obstacle"}, rect: {x: 140, y: 0, w: 80, h: 100}, ports: []},
        {
          node: {id: "target", title: "target", ports: [{id: "in", direction: "in"}]},
          rect: {x: 280, y: 20, w: 80, h: 60},
          ports: [{port: {id: "in", direction: "in"}, center: {x: 280, y: 50}}],
        },
      ],
      edges: [{
        edge: {id: "edge", source: {nodeId: "source", portId: "out"}, target: {nodeId: "target", portId: "in"}},
        points: [{x: 80, y: 50}, {x: 280, y: 50}],
      }],
    }
    const routedResponse = await fetch(new URL("/node-system/route", host.server.url), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(createNodeSystemRouteRequest(fixedLayout)),
    })
    expect(routedResponse.status).toBe(200)
    const routed = await routedResponse.json() as {kind: string; layout: PositionedNodeSystem}
    expect(routed.kind).toBe("ui.node.libavoid.response.v1")
    expect(routed.layout.nodes).toEqual(fixedLayout.nodes)
    expect(routed.layout.edges[0]!.points.length).toBeGreaterThan(2)
    expect((await fetch(new URL("/node-system/route", host.server.url))).status).toBe(405)

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
      const socket = await openSocket(controlUrl)
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
      const hello = await nextMessage(socket, "hello")
      socket.send(JSON.stringify({
        kind: "identity",
        workerIncarnationId,
        resumeNonce: crypto.randomUUID(),
      }))
      return {socket, connectionId: String(hello.connectionId)}
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
    expect(host.getStatus().hostEpoch).toBe(host.hostEpoch)
    second.socket.close()
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

  test("uses WSS only for signaling and sends oracle/force payload over direct DataChannels", async () => {
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
    const killedPid = host.crashPeerProcessForTest()
    expect(killedPid).toBe(before.pid)

    const replacement = await fixture.nextPeer()
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
