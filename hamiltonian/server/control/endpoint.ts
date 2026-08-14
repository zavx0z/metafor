export interface HamiltonianControlSocketData {
  connectionId: string
  connectionGeneration: number
  deviceId: string
  lifecycleTransportId: string
  workerEntityId: string
  openedAt: number
  lastPongAt: number
  lastChallengeSeq: number
  lastAckSeq: number
  nextHeartbeatTimer: ReturnType<typeof setTimeout> | null
  heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null
  workerIdentity: string | null
  workerRuntimeIncarnation: string | null
  workerCodeVersion: string | null
  resumeNonce: string | null
  identityConfirmed: boolean
  workerUpdateRequired: boolean
  retainAuthorityOnClose: boolean
  reportedEmptyWindowInventory: boolean
}

export interface HamiltonianControlUpgradeServer {
  upgrade(
    request: Request,
    options: {data: HamiltonianControlSocketData},
  ): boolean
}

export type HamiltonianControlTokenPredicate = (suppliedToken: string) => boolean

export class HamiltonianControlEndpoint {
  #connectionGeneration = 0

  constructor(private readonly tokenAccepted: HamiltonianControlTokenPredicate) {}

  get currentConnectionGeneration(): number {
    return this.#connectionGeneration
  }

  upgrade(
    request: Request,
    url: URL,
    server: HamiltonianControlUpgradeServer,
  ): Response | undefined {
    const suppliedToken = url.searchParams.get("token") ?? ""
    const deviceId = url.searchParams.get("device") ?? ""
    const lifecycleTransportId = url.searchParams.get("transport") ?? ""
    const workerEntityId = url.searchParams.get("worker") ?? ""
    if (
      !this.tokenAccepted(suppliedToken) ||
      !deviceId || deviceId.length > 128 ||
      !lifecycleTransportId.startsWith("websocket:") || lifecycleTransportId.length > 512 ||
      !workerEntityId.startsWith("service-worker:") || workerEntityId.length > 512
    ) {
      return new Response("Unauthorized", {status: 401})
    }

    const openedAt = Date.now()
    const upgraded = server.upgrade(request, {
      data: {
        connectionId: crypto.randomUUID(),
        connectionGeneration: ++this.#connectionGeneration,
        deviceId,
        lifecycleTransportId,
        workerEntityId,
        openedAt,
        lastPongAt: Date.now(),
        lastChallengeSeq: 0,
        lastAckSeq: 0,
        nextHeartbeatTimer: null,
        heartbeatTimeoutTimer: null,
        workerIdentity: null,
        workerRuntimeIncarnation: null,
        workerCodeVersion: null,
        resumeNonce: null,
        identityConfirmed: false,
        workerUpdateRequired: false,
        retainAuthorityOnClose: false,
        reportedEmptyWindowInventory: false,
      },
    })
    return upgraded ? undefined : new Response("WebSocket upgrade required", {status: 426})
  }
}
