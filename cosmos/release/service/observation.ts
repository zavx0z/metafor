import {parsePeerNetworkObservation, isPeerObservationRequest, PEER_OBSERVATION_TTL_MS, type PeerNetworkObservation} from "../shared/peer-observation"
import {
  NETWORK_OBSERVATION_CHANNEL,
  NETWORK_OBSERVATION_SCHEMA,
  isNetworkSnapshotRequest,
  type NetworkConnection,
  type NetworkConnectionState,
  type NetworkRuntimeState,
  type NetworkSnapshot,
  type NetworkTransfer,
} from "../shared/observation"

/** Owner hooks не читают response bodies и никогда не пробрасывают ошибку наблюдения. */
export interface ReleaseObservation {
  start(): void
  state(state: NetworkRuntimeState): void
  connection(id: string, url: string, state: NetworkConnectionState): void
  text(id: string, direction: "send" | "receive", text: string): void
  cacheHit(url: string, status: number): void
  network(url: string): string
  response(id: string, status?: number): void
  message(event: ExtendableMessageEvent): void
  destroy(): void
  peers(snapshot: PeerNetworkObservation): void
  snapshot(): NetworkSnapshot
}

/**
Один observer на factory incarnation; BC открывается только после start().
Он не объявляет runtime active: выбор принадлежит startup. Transport exceptions
остаются локальными, snapshot хранит не более 64 связей и 128 событий.
Проверки — [позднее подключение и границы фактов](../../tests/network-observation.spec.ts).
*/
export function createReleaseObservation(releaseVersion: string | null): ReleaseObservation {
  const producerId = crypto.randomUUID()
  let seq = 0
  let state: NetworkRuntimeState = "started"
  let channel: BroadcastChannel | null = null
  let scheduled = false
  let stopped = false
  let historyDropped = 0
  const connections = new Map<string, NetworkConnection>()
  const transfers: NetworkTransfer[] = []
  const pending = new Map<string, string>()
  const peers = new Map<string,{snapshot:PeerNetworkObservation;at:number}>()
  const freshPeers = () => {
    const now=performance.now()
    for(const [id,value]of peers)if(now-value.at>=PEER_OBSERVATION_TTL_MS)peers.delete(id)
    return [...peers.values()].map(value=>value.snapshot)
  }
  const counts = {cacheHits: 0, networkRequests: 0}
  const snapshot = (): NetworkSnapshot => ({
    schema: NETWORK_OBSERVATION_SCHEMA,
    kind: "snapshot",
    producerId,
    seq,
    releaseVersion,
    state,
    connections: [...connections.values()].map(connection => ({...connection})),
    transfers: transfers.map(transfer => ({...transfer})),
    counts: {...counts},
    historyDropped,
  })
  const publish = () => { safe(() => channel?.postMessage(snapshot())) }
  const changed = () => {
    seq += 1
    if (scheduled || stopped) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!stopped) publish()
    })
  }
  const transfer = (entry: Omit<NetworkTransfer, "at">) => {
    transfers.push({...entry, at: Date.now()})
    if (transfers.length > 128) { transfers.shift(); historyDropped += 1 }
    changed()
  }
  const observer: ReleaseObservation = {
    start() {
      safe(() => {
        channel = new BroadcastChannel(NETWORK_OBSERVATION_CHANNEL)
        channel.addEventListener("message", event => {
          if(isPeerObservationRequest(event.data)){for(const snapshot of freshPeers())safe(()=>channel?.postMessage(snapshot));return}
          safe(() => { if (isNetworkSnapshotRequest(event.data)) changed() })
        })
        changed()
      })
    },
    state(next) { safe(() => { state = next; changed() }) },
    connection(id, url, next) {
      safe(() => {
        const existing = connections.get(id)
        if (existing) existing.state = next
        else {
          if (connections.size >= 64) {
            const removable = [...connections.values()].find(connection => connection.state === "closed")
            if (!removable) { historyDropped += 1; changed(); return }
            connections.delete(removable.id)
            historyDropped += 1
          }
          connections.set(id, {id, endpoint: sanitize(url), state: next, sentBytes: 0, receivedBytes: 0})
        }
        changed()
      })
    },
    text(id, direction, body) {
      safe(() => {
        const connection = connections.get(id)
        if (!connection) return
        const bytes = new TextEncoder().encode(body).byteLength
        if (direction === "send") connection.sentBytes += bytes
        else connection.receivedBytes += bytes
        transfer({id: crypto.randomUUID(), kind: direction === "send" ? "ws-send" : "ws-receive", endpoint: connection.endpoint,
          connectionId: id, phase: direction === "send" ? "sent" : "received", bytes})
      })
    },
    cacheHit(url, status) {
      safe(() => {
        counts.cacheHits += 1
        transfer({id: crypto.randomUUID(), kind: "cache", endpoint: sanitize(url), phase: "hit", status})
      })
    },
    network(url) {
      let id = ""
      safe(() => {
        id = crypto.randomUUID()
        const endpoint = sanitize(url)
        counts.networkRequests += 1
        if (pending.size >= 128) { pending.delete(pending.keys().next().value!); historyDropped += 1 }
        pending.set(id, endpoint)
        transfer({id, kind: "network", endpoint, phase: "requested"})
      })
      return id
    },
    response(id, status) {
      safe(() => {
        const endpoint = pending.get(id)
        if (!endpoint) return
        pending.delete(id)
        transfer({id, kind: "network", endpoint, phase: status === undefined ? "failed" : "response", ...(status === undefined ? {} : {status})})
      })
    },
    message(event) {
      safe(() => {
        if(isPeerObservationRequest(event.data)){for(const snapshot of freshPeers())for(const port of event.ports)safe(()=>port.postMessage(snapshot));return}
        if (!isNetworkSnapshotRequest(event.data)) return
        for (const port of event.ports) safe(() => port.postMessage(snapshot()))
      })
    },
    destroy() {
      safe(() => {
        state = "destroyed"
        seq += 1
        stopped = true
        publish()
        channel?.close()
        channel = null
      })
    },
    peers(input){safe(()=>{const value=parsePeerNetworkObservation(input);if(!value)return;const previous=peers.get(value.producerId);if(previous&&previous.snapshot.seq>value.seq)return;peers.set(value.producerId,{snapshot:value,at:performance.now()});if(peers.size>8)peers.delete(peers.keys().next().value!);channel?.postMessage(value)})},
    snapshot,
  }
  return observer
}

function sanitize(value: string) {
  const url = new URL(value, globalThis.location?.origin ?? "http://localhost")
  return `${url.origin}${url.pathname}`
}
function safe(work: () => void) {
  observeSafely(work)
}

/** Изолирует также supplied observer hooks: их отказ не меняет прикладную операцию. */
export function observeSafely<T>(operation: () => T): T | undefined {
  try { return operation() } catch { return undefined }
}
