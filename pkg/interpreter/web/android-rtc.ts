import {TextureLoader} from "@metafor/engine"
import {createLegacyRtcSignalSocket, RTC_ICE_SERVERS, type LegacyRtcSignalSocket} from "./p2p-signaling"

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

export type AndroidRtcAudioStream = {
  stream: MediaStream
  trackCount: number
  receivedAt: number
}

export type AndroidRtcStatusKind = "idle" | "connected" | "running" | "error"

export type AndroidRtcCommand =
  | {type: "tap"; x: number; y: number; frameW?: number; frameH?: number}
  | {type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number; frameW?: number; frameH?: number}
  | {type: "key"; code: string}
  | {type: "launch"; packageName: string}
  | {type: "open-accessibility"}

export type RemoteDesktopRtcCommand =
  | {type: "focus"}
  | {type: "click" | "doubleclick"; x: number; y: number; button?: string; clickCount?: number; frameW?: number; frameH?: number}
  | {type: "pointerMove" | "mouseMove" | "move"; x: number; y: number; button?: string; buttons?: number; frameW?: number; frameH?: number}
  | {type: "pointerDown" | "mouseDown" | "pointerUp" | "mouseUp"; x: number; y: number; button?: string; buttons?: number; clickCount?: number; frameW?: number; frameH?: number}
  | {type: "wheel" | "mouseWheel"; x: number; y: number; deltaX?: number; deltaY?: number; dx?: number; dy?: number; frameW?: number; frameH?: number}
  | {type: "text" | "type"; text: string}
  | {type: "keyDown" | "keyUp" | "char"; key?: string; keyCode?: string; modifiers?: string[]}

export type RtcControlCommand = AndroidRtcCommand | RemoteDesktopRtcCommand

export type AndroidRtcClient = {
  readonly peerId: string
  connect(): void
  disconnect(): void
  send(command: RtcControlCommand): boolean
  peers(): Array<{id: string; connectionState: RTCPeerConnectionState; channelState: RTCDataChannelState | "none"}>
}

export type AndroidRtcClientOpts = {
  room?: string
  peerId?: string
  senderPeerId?: string
  peerTarget?: "primary" | "secondary" | "any"
  signalUrl?: string
  signalUrls?: string[]
  iceServers?: RTCIceServer[]
  capabilities?: string[]
  frameSrc: string
  minFrameIntervalMs?: number
  ignoreBlackFrames?: boolean
  receiveAudio?: boolean
  onFrame: (frame: AndroidRtcFrame) => void
  onAudio?: (audio: AndroidRtcAudioStream | null) => void
  onStatus: (kind: AndroidRtcStatusKind, label: string) => void
}

type PeerRecord = {
  id: string
  connection: RTCPeerConnection
  channel: RTCDataChannel | null
}

const DEFAULT_ANDROID_RTC_ROOM = "android-display"
const ANDROID_RTC_SENDER_PEER = "android"
const DEFAULT_MIN_FRAME_INTERVAL_MS = 50
const MAX_PENDING_COMMANDS = 16

export function createAndroidRtcClient(opts: AndroidRtcClientOpts): AndroidRtcClient {
  const room = opts.room ?? DEFAULT_ANDROID_RTC_ROOM
  const peerId = opts.peerId ?? `interpreter-${rtcRandomToken()}`
  const peerTarget = opts.peerTarget ?? "primary"
  const peers = new Map<string, PeerRecord>()
  const video = document.createElement("video")
  const audioStream = new MediaStream()
  video.autoplay = true
  video.muted = true
  video.playsInline = true

  let socket: LegacyRtcSignalSocket | null = null
  let signalUrlIndex = 0
  let signalUrlAttempts = 0
  let manuallyDisconnected = false
  let frameLoopStarted = false
  let frameCopyInFlight = false
  let lastFrameAt = 0
  let lastBlackFrameStatusAt = 0
  let blackFrameCanvas: HTMLCanvasElement | null = null
  let blackFrameContext: CanvasRenderingContext2D | null = null
  let pendingCommands: RtcControlCommand[] = []

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
    manuallyDisconnected = false
    signalUrlAttempts = 0
    openSignalSocket()
  }

  function openSignalSocket(): void {
    const urls = rtcSignalUrlCandidates()
    const url = urls[signalUrlIndex] ?? opts.signalUrl
    opts.onStatus("running", `rtc connecting ${rtcSignalUrlLabel(url)}`)
    try {
      socket = createLegacyRtcSignalSocket({
        conversationId: room,
        participantId: peerId,
        capabilities: opts.capabilities ?? ["android-display", "interpreter"],
        ...(url === undefined ? {} : {url}),
      })
    } catch (error) {
      if (tryNextSignalUrl("signal")) return
      opts.onStatus("error", error instanceof Error ? `rtc ${error.message}` : "rtc signaling error")
      return
    }
    const currentSocket = socket
    signalUrlAttempts += 1
    socket.addEventListener("open", () => opts.onStatus("running", "rtc signaling"))
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const signal = parseSignal(event.data)
      if (signal === null) return
      void handleSignal(signal)
    })
    socket.addEventListener("close", () => {
      if (socket !== currentSocket) return
      opts.onStatus("idle", "rtc disconnected")
      closeAllPeers()
      socket = null
    })
    socket.addEventListener("error", () => {
      if (socket !== currentSocket) return
      if (tryNextSignalUrl("signal")) return
      opts.onStatus("error", "rtc signaling error")
    })
  }

  function disconnect(): void {
    manuallyDisconnected = true
    const current = socket
    socket = null
    current?.close()
    pendingCommands = []
    closeAllPeers()
    video.srcObject = null
    clearAudioStream()
    frameLoopStarted = false
  }

  function send(command: RtcControlCommand): boolean {
    if (sendToOpenChannels(command)) return true
    if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      pendingCommands.push(command)
      if (pendingCommands.length > MAX_PENDING_COMMANDS) pendingCommands = pendingCommands.slice(-MAX_PENDING_COMMANDS)
      opts.onStatus("running", "rtc control queued")
      return true
    }
    return false
  }

  function sendToOpenChannels(command: RtcControlCommand): boolean {
    let sent = false
    for (const peer of peers.values()) {
      if (peer.channel?.readyState !== "open") continue
      peer.channel.send(JSON.stringify({...command, id: rtcRandomToken()}))
      sent = true
    }
    return sent
  }

  function flushPendingCommands(): void {
    if (pendingCommands.length === 0) return
    const commands = pendingCommands
    pendingCommands = []
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!
      if (!sendToOpenChannels(command)) {
        pendingCommands = commands.slice(index)
        return
      }
    }
  }

  async function handleSignal(signal: AndroidRtcSignal): Promise<void> {
    if (signal.type === "hello") {
      opts.onStatus("running", `rtc room ${signal.peers.length} peers`)
      const targetPeers = signal.peers.filter((remotePeerId) => (
        isTargetRtcSenderPeer(remotePeerId, peerTarget, opts.senderPeerId ?? ANDROID_RTC_SENDER_PEER)
      ))
      if (targetPeers.length === 0 && tryNextSignalUrl("peer")) return
      for (const remotePeerId of targetPeers) {
        void createPeer(remotePeerId, true)
      }
      return
    }
    if (signal.type === "peer-joined") {
      if (isTargetRtcSenderPeer(signal.peerId, peerTarget, opts.senderPeerId ?? ANDROID_RTC_SENDER_PEER)) void createPeer(signal.peerId, true)
      return
    }
    if (signal.type === "peer-left") {
      closePeer(signal.peerId)
      return
    }
    if ("to" in signal && typeof signal.to === "string" && signal.to !== peerId) return
    if (signal.from === peerId) return
    if (!isTargetRtcSenderPeer(signal.from, peerTarget, opts.senderPeerId ?? ANDROID_RTC_SENDER_PEER)) return
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

    const connection = new RTCPeerConnection({iceServers: opts.iceServers ?? RTC_ICE_SERVERS})
    connection.addTransceiver("video", {direction: "recvonly"})
    if (opts.receiveAudio === true) connection.addTransceiver("audio", {direction: "recvonly"})
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
    connection.addEventListener("iceconnectionstatechange", () => {
      const state = connection.iceConnectionState
      opts.onStatus(state === "connected" || state === "completed" ? "connected" : state === "failed" ? "error" : "running", `rtc ice ${state}`)
    })
    connection.addEventListener("icegatheringstatechange", () => {
      opts.onStatus("running", `rtc gathering ${connection.iceGatheringState}`)
    })
    connection.addEventListener("datachannel", (event) => attachDataChannel(peer, event.channel))
    connection.addEventListener("track", (event) => {
      if (event.track.kind === "audio") {
        attachAudioTrack(event.track)
        opts.onStatus("connected", "rtc audio")
        return
      }
      if (event.track.kind !== "video") return
      const stream = event.streams[0] ?? new MediaStream([event.track])
      video.srcObject = new MediaStream(stream.getVideoTracks())
      void video.play().catch(() => undefined)
      startFrameLoop()
      opts.onStatus("connected", "rtc video")
    })

    if (initiator) {
      attachDataChannel(peer, connection.createDataChannel("control", {ordered: true}))
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
      flushPendingCommands()
    })
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      const message = parseControlMessage(event.data)
      if (message === null) return
      const reason = !message.ok && message.accessibility === false ? " a11y off" : ""
      opts.onStatus(message.ok ? "connected" : "error", `${message.command} ${message.ok ? "ok" : "failed"}${reason}`)
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
    if (opts.ignoreBlackFrames === true && videoFrameLooksBlack(width, height)) {
      if (now - lastBlackFrameStatusAt >= 1000) {
        lastBlackFrameStatusAt = now
        opts.onStatus("running", "rtc black frame")
      }
      return
    }
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

  function videoFrameLooksBlack(width: number, height: number): boolean {
    const canvas = blackFrameCanvas ?? document.createElement("canvas")
    blackFrameCanvas = canvas
    canvas.width = 96
    canvas.height = Math.max(1, Math.round((canvas.width * height) / width))
    const context = blackFrameContext ?? canvas.getContext("2d", {willReadFrequently: true})
    if (context === null) return false
    blackFrameContext = context
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0
      let nonBlack = 0
      const count = pixels.length / 4
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3
        sum += luminance
        if (luminance > 8) nonBlack += 1
      }
      return sum / count < 2 && nonBlack / count < 0.005
    } catch {
      return false
    }
  }

  function attachAudioTrack(track: MediaStreamTrack): void {
    if (audioStream.getAudioTracks().some((current) => current.id === track.id)) return
    audioStream.addTrack(track)
    track.addEventListener("ended", () => {
      if (audioStream.getAudioTracks().some((current) => current.id === track.id)) {
        audioStream.removeTrack(track)
        emitAudioStream()
      }
    })
    emitAudioStream()
  }

  function emitAudioStream(): void {
    const trackCount = audioStream.getAudioTracks().length
    opts.onAudio?.(trackCount === 0 ? null : {stream: audioStream, trackCount, receivedAt: Date.now()})
  }

  function clearAudioStream(): void {
    const tracks = audioStream.getTracks()
    if (tracks.length === 0) return
    for (const track of tracks) audioStream.removeTrack(track)
    opts.onAudio?.(null)
  }

  function closePeer(remotePeerId: string): void {
    const peer = peers.get(remotePeerId)
    if (peer === undefined) return
    peers.delete(remotePeerId)
    peer.channel?.close()
    peer.connection.close()
    if (peers.size === 0) clearAudioStream()
  }

  function closeAllPeers(): void {
    for (const peerId of [...peers.keys()]) closePeer(peerId)
    clearAudioStream()
  }

  function sendSignal(payload: Record<string, unknown>): void {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(payload))
  }

  function tryNextSignalUrl(reason: string): boolean {
    const urls = rtcSignalUrlCandidates()
    if (manuallyDisconnected || urls.length <= 1 || signalUrlAttempts >= urls.length) return false
    opts.onStatus("running", `rtc retry ${reason}`)
    const current = socket
    socket = null
    current?.close()
    closeAllPeers()
    signalUrlIndex = (signalUrlIndex + 1) % urls.length
    window.setTimeout(() => openSignalSocket(), 150)
    return true
  }

  function rtcSignalUrlCandidates(): string[] {
    return uniqueStrings([
      ...(opts.signalUrl === undefined ? [] : [opts.signalUrl]),
      ...(opts.signalUrls ?? []),
    ])
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function rtcSignalUrlLabel(value: string | undefined): string {
  if (value === undefined) return "default"
  try {
    const url = new URL(value, window.location.href)
    return `${url.host}${url.pathname}`
  } catch {
    return "custom"
  }
}

function rtcRandomToken(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
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

function parseControlMessage(raw: string): {type: "control-result"; command: string; ok: boolean; accessibility?: boolean} | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const type = (parsed as {type?: unknown}).type
    if (type !== "control-result") return null
    const command = (parsed as {command?: unknown}).command
    const ok = (parsed as {ok?: unknown}).ok
    const accessibility = (parsed as {accessibility?: unknown}).accessibility
    return {
      type,
      command: typeof command === "string" && command.length > 0 ? command : "control",
      ok: ok === true,
      ...(typeof accessibility === "boolean" ? {accessibility} : {}),
    }
  } catch {
    return null
  }
}

function isAndroidRtcSenderPeer(peerId: string): boolean {
  return peerId === ANDROID_RTC_SENDER_PEER || peerId.startsWith(`${ANDROID_RTC_SENDER_PEER}-`)
}

function isTargetAndroidRtcSenderPeer(peerId: string, target: "primary" | "secondary" | "any"): boolean {
  if (!isAndroidRtcSenderPeer(peerId)) return false
  if (target === "any") return true
  if (target === "secondary") return peerId !== ANDROID_RTC_SENDER_PEER
  return peerId === ANDROID_RTC_SENDER_PEER
}

function isTargetRtcSenderPeer(peerId: string, target: "primary" | "secondary" | "any", senderPeerId: string): boolean {
  if (senderPeerId === ANDROID_RTC_SENDER_PEER) return isTargetAndroidRtcSenderPeer(peerId, target)
  if (peerId !== senderPeerId && !peerId.startsWith(`${senderPeerId}-`)) return false
  if (target === "any") return true
  if (target === "secondary") return peerId !== senderPeerId
  return peerId === senderPeerId
}
