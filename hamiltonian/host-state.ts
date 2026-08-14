/** Runtime-safe topology projection shared with browser execution realms. */
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
