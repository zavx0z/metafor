import {makeLeaseId} from "./core/runtime.js"

export interface WindowCandidate {
  tabId: string
  joinedAt: number
  visible: boolean
}

export interface PeerState {
  connectionId: string
  deviceId: string
  windows: WindowCandidate[]
}

export interface LeaderState {
  hostEpoch: string
  connectionId: string
  deviceId: string
  tabId: string
  joinedAt: number
  fencingToken: number
  leaseId: string
}

export interface TopologySnapshot {
  revision: number
  leader: LeaderState | null
  peers: PeerState[]
}

function candidateKey(connectionId: string, tabId: string): string {
  return `${connectionId}\u0000${tabId}`
}

export class HostTopology {
  readonly hostEpoch: string
  readonly #peers = new Map<string, PeerState>()
  readonly #candidateOrder = new Map<string, number>()
  #leaderKey: string | null = null
  #leaderLeaseId: string | null = null
  #nextCandidateOrder = 0
  #revision = 0
  #fencingToken = 0

  constructor(hostEpoch: string = crypto.randomUUID()) {
    this.hostEpoch = hostEpoch
  }

  connect(connectionId: string, deviceId: string): void {
    this.#peers.set(connectionId, {connectionId, deviceId, windows: []})
    this.#commit()
  }

  disconnect(connectionId: string): void {
    const peer = this.#peers.get(connectionId)
    if (!peer) return
    for (const window of peer.windows) {
      this.#candidateOrder.delete(candidateKey(connectionId, window.tabId))
    }
    this.#peers.delete(connectionId)
    this.#commit()
  }

  updateWindows(connectionId: string, windows: WindowCandidate[]): void {
    const peer = this.#peers.get(connectionId)
    if (!peer) return
    const nextKeys = new Set(windows.map((window) => candidateKey(connectionId, window.tabId)))
    for (const previous of peer.windows) {
      const key = candidateKey(connectionId, previous.tabId)
      if (!nextKeys.has(key)) this.#candidateOrder.delete(key)
    }
    for (const window of windows) {
      const key = candidateKey(connectionId, window.tabId)
      if (!this.#candidateOrder.has(key)) {
        this.#candidateOrder.set(key, this.#nextCandidateOrder)
        this.#nextCandidateOrder += 1
      }
    }
    peer.windows = windows.map((window) => ({...window}))
    this.#commit()
  }

  rebindLeaderConnection(
    previousConnectionId: string,
    nextConnectionId: string,
    windows: WindowCandidate[],
  ): boolean {
    const previousPeer = this.#peers.get(previousConnectionId)
    const nextPeer = this.#peers.get(nextConnectionId)
    if (!previousPeer || !nextPeer || previousPeer.deviceId !== nextPeer.deviceId) return false

    const previousLeader = previousPeer.windows.find((window) =>
      candidateKey(previousConnectionId, window.tabId) === this.#leaderKey
    )
    if (!previousLeader || !windows.some((window) => window.tabId === previousLeader.tabId)) {
      return false
    }

    const previousLeaderKey = candidateKey(previousConnectionId, previousLeader.tabId)
    const nextLeaderKey = candidateKey(nextConnectionId, previousLeader.tabId)
    const leaderOrder = this.#candidateOrder.get(previousLeaderKey)
    for (const window of previousPeer.windows) {
      this.#candidateOrder.delete(candidateKey(previousConnectionId, window.tabId))
    }
    for (const window of nextPeer.windows) {
      this.#candidateOrder.delete(candidateKey(nextConnectionId, window.tabId))
    }
    nextPeer.windows = windows.map((window) => ({...window}))
    for (const window of nextPeer.windows) {
      const key = candidateKey(nextConnectionId, window.tabId)
      if (window.tabId === previousLeader.tabId && leaderOrder !== undefined) {
        this.#candidateOrder.set(key, leaderOrder)
      } else {
        this.#candidateOrder.set(key, this.#nextCandidateOrder)
        this.#nextCandidateOrder += 1
      }
    }
    this.#peers.delete(previousConnectionId)
    this.#leaderKey = nextLeaderKey
    this.#revision += 1
    return true
  }

  snapshot(): TopologySnapshot {
    const peers = [...this.#peers.values()]
      .map((peer) => ({
        ...peer,
        windows: peer.windows.map((window) => ({...window})),
      }))
      .sort((left, right) => left.connectionId.localeCompare(right.connectionId))

    let leader: LeaderState | null = null
    if (this.#leaderKey) {
      for (const peer of peers) {
        const window = peer.windows.find((candidate) =>
          candidateKey(peer.connectionId, candidate.tabId) === this.#leaderKey
        )
        if (!window) continue
        leader = {
          hostEpoch: this.hostEpoch,
          connectionId: peer.connectionId,
          deviceId: peer.deviceId,
          tabId: window.tabId,
          joinedAt: window.joinedAt,
          fencingToken: this.#fencingToken,
          leaseId: this.#leaderLeaseId ?? makeLeaseId(
            this.hostEpoch,
            this.#fencingToken,
            peer.connectionId,
            window.tabId,
          ),
        }
        break
      }
    }

    return {revision: this.#revision, leader, peers}
  }

  #commit(): void {
    const previousLeaderKey = this.#leaderKey
    const candidates = [...this.#peers.values()].flatMap((peer) =>
      peer.windows.map((window) => ({
        key: candidateKey(peer.connectionId, window.tabId),
        order: this.#candidateOrder.get(candidateKey(peer.connectionId, window.tabId)) ?? Number.MAX_SAFE_INTEGER,
        connectionId: peer.connectionId,
        deviceId: peer.deviceId,
        ...window,
      }))
    )

    if (!this.#leaderKey || !candidates.some((candidate) => candidate.key === this.#leaderKey)) {
      candidates.sort((left, right) =>
        left.order - right.order ||
        left.deviceId.localeCompare(right.deviceId) ||
        left.tabId.localeCompare(right.tabId)
      )
      this.#leaderKey = candidates[0]?.key ?? null
    }
    if (this.#leaderKey !== previousLeaderKey) {
      this.#fencingToken += 1
      const leader = candidates.find((candidate) => candidate.key === this.#leaderKey)
      this.#leaderLeaseId = leader
        ? makeLeaseId(this.hostEpoch, this.#fencingToken, leader.connectionId, leader.tabId)
        : null
    }
    this.#revision += 1
  }
}
