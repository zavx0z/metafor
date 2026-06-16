import {TextureLoader} from "@metafor/engine"

type AndroidRtcSignal =
  | {type: "hello"; room: string; peerId: string; peers: string[]}
  | {type: "peer-joined"; peerId: string}
  | {type: "peer-left"; peerId: string}
  | {type: "offer"; from: string; to?: string; description: RTCSessionDescriptionInit}
  | {type: "answer"; from: string; to?: string; description: RTCSessionDescriptionInit}
  | {type: "ice"; from: string; to?: string; candidate: RTCIceCandidateInit}

export type AndroidRtcFrame = {
  src: string
  width: number
  height: number
  capturedAt: number
}

export type AndroidRtcStatusKind = "idle" | "connected" | "running" | "error"

export type AndroidRtcCommand =
  | {type: "tap"; x: number; y: number}
  | {type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number}
  | {type: "key"; code: string}
  | {type: "launch"; packageName: string}

export type AndroidRtcClient = {
  readonly peerId: string
  connect(): void
  disconnect(): void
  send(command: AndroidRtcCommand): boolean
  peers(): Array<{id: string; connectionState: RTCPeerConnectionState; channelState: RTCDataChannelState | "none"}>
}

export type AndroidRtcClientOpts = {
  room?: string
  peerId?: string
  frameSrc: string
  minFrameIntervalMs?: number
  onFrame: (frame: AndroidRtcFrame) => void
  onStatus: (kind: AndroidRtcStatusKind, label: string) => void
}

type PeerRecord = {
  id: string
  connection: RTCPeerConnection
  channel: RTCDataChannel | null
}

const DEFAULT_ANDROID_RTC_ROOM = "android-display"
const DEFAULT_MIN_FRAME_INTERVAL_MS = 50
const APP_WEB_ANDROID_SIGNALING_URL = "wss://192.168.8.106/hud/webrtc/signaling"

export function createAndroidRtcClient(opts: AndroidRtcClientOpts): AndroidRtcClient {
  const room = opts.room ?? DEFAULT_ANDROID_RTC_ROOM
  const peerId = opts.peerId ?? `interpreter-${crypto.randomUUID()}`
  const peers = new Map<string, PeerRecord>()
  const video = document.createElement("video")
  video.autoplay = true
  video.muted = true
  video.playsInline = true

  let socket: WebSocket | null = null
  let frameLoopStarted = false
  let frameCopyInFlight = false
  let lastFrameAt = 0

  const api: AndroidRtcClient = {
    get peerId() {
      return peerId
    },
    connect,
    disconnect,
    send,
    peers: () => [...peers.values()].map((peer) => ({
      id: peer.id,
      connectionState: peer.connection.connectionState,
      channelState: peer.channel?.readyState ?? "none",
    })),
  }

  return api

  function connect(): void {
    if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
    opts.onStatus("running", "rtc connecting")
    socket = new WebSocket(signalingUrl(room, peerId))
    socket.addEventListener("open", () => opts.onStatus("running", "rtc signaling"))
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const signal = parseSignal(event.data)
      if (signal === null) return
      void handleSignal(signal)
    })
    socket.addEventListener("close", () => {
      opts.onStatus("idle", "rtc disconnected")
      closeAllPeers()
      socket = null
    })
    socket.addEventListener("error", () => opts.onStatus("error", "rtc signaling error"))
  }

  function disconnect(): void {
    const current = socket
    socket = null
    current?.close()
    closeAllPeers()
    video.srcObject = null
    frameLoopStarted = false
  }

  function send(command: AndroidRtcCommand): boolean {
    let sent = false
    for (const peer of peers.values()) {
      if (peer.channel?.readyState !== "open") continue
      peer.channel.send(JSON.stringify({...command, id: crypto.randomUUID()}))
      sent = true
    }
    return sent
  }

  async function handleSignal(signal: AndroidRtcSignal): Promise<void> {
    if (signal.type === "hello") {
      opts.onStatus("running", `rtc room ${signal.peers.length} peers`)
      for (const remotePeerId of signal.peers) void createPeer(remotePeerId, true)
      return
    }
    if (signal.type === "peer-joined") {
      if (signal.peerId !== peerId) void createPeer(signal.peerId, true)
      return
    }
    if (signal.type === "peer-left") {
      closePeer(signal.peerId)
      return
    }
    if (signal.from === peerId) return
    const peer = createPeer(signal.from, false)
    if (signal.type === "offer") {
      await peer.connection.setRemoteDescription(signal.description)
      const answer = await peer.connection.createAnswer()
      await peer.connection.setLocalDescription(answer)
      sendSignal({type: "answer", to: signal.from, description: peer.connection.localDescription})
      return
    }
    if (signal.type === "answer") {
      await peer.connection.setRemoteDescription(signal.description)
      return
    }
    await peer.connection.addIceCandidate(signal.candidate)
  }

  function createPeer(remotePeerId: string, initiator: boolean): PeerRecord {
    const existing = peers.get(remotePeerId)
    if (existing !== undefined) return existing

    const connection = new RTCPeerConnection({iceServers: []})
    connection.addTransceiver("video", {direction: "recvonly"})
    const peer: PeerRecord = {id: remotePeerId, connection, channel: null}
    peers.set(remotePeerId, peer)

    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate === null) return
      sendSignal({type: "ice", to: remotePeerId, candidate: event.candidate.toJSON()})
    })
    connection.addEventListener("connectionstatechange", () => {
      opts.onStatus(connection.connectionState === "connected" ? "connected" : "running", `rtc ${connection.connectionState}`)
      if (connection.connectionState === "failed" || connection.connectionState === "closed") closePeer(remotePeerId)
    })
    connection.addEventListener("datachannel", (event) => attachDataChannel(peer, event.channel))
    connection.addEventListener("track", (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      video.srcObject = stream
      void video.play().catch(() => undefined)
      startFrameLoop()
      opts.onStatus("connected", "rtc video")
    })

    if (initiator) {
      attachDataChannel(peer, connection.createDataChannel("android-control", {ordered: true}))
      void startOffer(peer)
    }

    return peer
  }

  async function startOffer(peer: PeerRecord): Promise<void> {
    const offer = await peer.connection.createOffer()
    await peer.connection.setLocalDescription(offer)
    sendSignal({type: "offer", to: peer.id, description: peer.connection.localDescription})
  }

  function attachDataChannel(peer: PeerRecord, channel: RTCDataChannel): void {
    peer.channel = channel
    channel.addEventListener("open", () => {
      opts.onStatus("connected", "rtc control")
      channel.send(JSON.stringify({type: "hello", peerId, role: "interpreter"}))
    })
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const message = parseControlMessage(event.data)
      if (message === null) return
      if (message.type === "control-result") {
        opts.onStatus(message.ok ? "connected" : "error", `${message.command} ${message.ok ? "ok" : "failed"}`)
      }
    })
    channel.addEventListener("close", () => {
      if (peer.channel === channel) peer.channel = null
    })
  }

  function startFrameLoop(): void {
    if (frameLoopStarted) return
    frameLoopStarted = true
    const requestVideoFrame = (video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
    }).requestVideoFrameCallback
    const tick = (): void => {
      void copyVideoFrame()
      if (video.srcObject === null) {
        frameLoopStarted = false
        return
      }
      if (requestVideoFrame !== undefined) requestVideoFrame.call(video, tick)
      else requestAnimationFrame(tick)
    }
    if (requestVideoFrame !== undefined) requestVideoFrame.call(video, tick)
    else requestAnimationFrame(tick)
  }

  async function copyVideoFrame(): Promise<void> {
    if (frameCopyInFlight) return
    const now = performance.now()
    if (now - lastFrameAt < (opts.minFrameIntervalMs ?? DEFAULT_MIN_FRAME_INTERVAL_MS)) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (width <= 0 || height <= 0) return
    frameCopyInFlight = true
    lastFrameAt = now
    try {
      const bitmap = await createImageBitmap(video)
      TextureLoader.replaceBitmap(opts.frameSrc, bitmap)
      opts.onFrame({src: opts.frameSrc, width, height, capturedAt: Date.now()})
    } catch (error) {
      opts.onStatus("error", error instanceof Error ? error.message : String(error))
    } finally {
      frameCopyInFlight = false
    }
  }

  function closePeer(remotePeerId: string): void {
    const peer = peers.get(remotePeerId)
    if (peer === undefined) return
    peers.delete(remotePeerId)
    peer.channel?.close()
    peer.connection.close()
  }

  function closeAllPeers(): void {
    for (const peerId of [...peers.keys()]) closePeer(peerId)
  }

  function sendSignal(payload: Record<string, unknown>): void {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }
}

function signalingUrl(room: string, peerId: string): string {
  const url = new URL(APP_WEB_ANDROID_SIGNALING_URL)
  url.searchParams.set("room", room)
  url.searchParams.set("peer", peerId)
  return url.toString()
}

function parseSignal(raw: string): AndroidRtcSignal | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const type = (parsed as {type?: unknown}).type
    if (typeof type !== "string") return null
    return parsed as AndroidRtcSignal
  } catch {
    return null
  }
}

function parseControlMessage(raw: string): {type: "control-result"; command: string; ok: boolean} | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const type = (parsed as {type?: unknown}).type
    if (type !== "control-result") return null
    const command = (parsed as {command?: unknown}).command
    const ok = (parsed as {ok?: unknown}).ok
    return {
      type,
      command: typeof command === "string" && command.length > 0 ? command : "control",
      ok: ok === true,
    }
  } catch {
    return null
  }
}
