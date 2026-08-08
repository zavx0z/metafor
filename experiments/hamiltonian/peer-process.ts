import {WeriftPeer, type PeerSignal, type WeriftPeerSnapshot} from "./peer/werift-peer.ts"

type ParentMessage =
  | {kind: "begin"; peerId: string; sessionEpoch: string}
  | {kind: "signal"; peerId: string; signal: PeerSignal}
  | {kind: "close-peer"; peerId?: string}
  | {kind: "stop"}

let peer: WeriftPeer | null = null
let operations: Promise<void> = Promise.resolve()

function send(message: unknown): void {
  process.send?.(message)
}

async function closePeer(peerId?: string): Promise<void> {
  if (!peer || (peerId && peer.peerId !== peerId)) return
  const previous = peer
  peer = null
  await previous.close()
  send({kind: "peer-state", snapshot: previous.snapshot()})
}

async function handle(message: ParentMessage): Promise<void> {
  try {
    if (message?.kind === "stop") {
      await closePeer()
      process.exit(0)
    }
    if (message?.kind === "close-peer") {
      await closePeer(message.peerId)
      return
    }
    if (message?.kind === "begin") {
      await closePeer()
      const nextPeer = new WeriftPeer({
        peerId: message.peerId,
        sessionEpoch: message.sessionEpoch,
        initiator: true,
        onSignal: (signal) => send({kind: "peer-signal", peerId: message.peerId, signal}),
        onState: (snapshot: WeriftPeerSnapshot) => send({kind: "peer-state", snapshot}),
      })
      peer = nextPeer
      await nextPeer.start()
      send({kind: "peer-state", snapshot: nextPeer.snapshot()})
      return
    }
    if (message?.kind === "signal" && peer?.peerId === message.peerId) {
      await peer.signal(message.signal)
    }
  } catch (error) {
    send({
      kind: "peer-error",
      peerId: (message as {peerId?: string})?.peerId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

process.on("message", (rawMessage) => {
  const message = rawMessage as ParentMessage
  operations = operations.then(() => handle(message), () => handle(message))
})

process.on("disconnect", async () => {
  await operations
  await closePeer()
  process.exit(0)
})

send({kind: "online", pid: process.pid})
