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
  videoCodecPreference?: "VP8" | "VP9" | "H264" | "AV1"
  frameSrc: string
  minFrameIntervalMs?: number
  ignoreBlackFrames?: boolean
  metadataOnlyFrames?: boolean
  frameReadMode?: "video-element" | "track-processor"
  receiveAudio?: boolean
  onVideoElement?: (video: HTMLVideoElement | null) => void
  onFrame: (frame: AndroidRtcFrame) => void
  onAudio?: (audio: AndroidRtcAudioStream | null) => void
  onStatus: (kind: AndroidRtcStatusKind, label: string) => void
  onDiagnostic?: (label: string, detail: Record<string, unknown>) => void
  onTargetPeerMissing?: (peers: string[]) => void
  controlResultStatus?: "status" | "diagnostic"
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
const BLACK_FRAME_MAX_AVG_LUMA = 18
const BLACK_FRAME_BRIGHT_LUMA = 24
const BLACK_FRAME_MAX_BRIGHT_RATIO = 0.05
const METADATA_FRAME_DIAGNOSTIC_INTERVAL_MS = 500
const FRAME_ANALYSIS_INTERVAL_MS = 2_000

type BrowserVideoFrame = GPUImageCopyExternalImage["source"] & {
  readonly displayWidth?: number
  readonly displayHeight?: number
  readonly codedWidth?: number
  readonly codedHeight?: number
  readonly timestamp?: number
  close?: () => void
}

type MediaStreamTrackProcessorInstance = {
  readable: ReadableStream<BrowserVideoFrame>
}

type MediaStreamTrackProcessorConstructor = new (init: {track: MediaStreamTrack}) => MediaStreamTrackProcessorInstance

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
  video.style.position = "fixed"
  video.style.left = "-10000px"
  video.style.top = "-10000px"
  video.style.width = "1px"
  video.style.height = "1px"
  video.style.pointerEvents = "none"

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
  let lastVideoWaitingStatusAt = 0
  let lastReceiverStatsAt = 0
  let lastMetadataFrameDiagnosticAt = 0
  let lastFrameAnalysisAt = 0
  let trackFrameAbortController: AbortController | null = null
  let trackFrameReaderTrack: MediaStreamTrack | null = null
  let frameAnalysisCanvas: HTMLCanvasElement | null = null
  let frameAnalysisContext: CanvasRenderingContext2D | null = null

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
    video.remove()
    opts.onVideoElement?.(null)
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
      if (targetPeers.length === 0) {
        opts.onTargetPeerMissing?.(signal.peers)
        if (tryNextSignalUrl("peer")) return
      }
      for (const remotePeerId of targetPeers) {
        void connectPeer(remotePeerId)
      }
      return
    }
    if (signal.type === "peer-joined") {
      if (isTargetRtcSenderPeer(signal.peerId, peerTarget, opts.senderPeerId ?? ANDROID_RTC_SENDER_PEER)) void connectPeer(signal.peerId)
      return
    }
    if (signal.type === "peer-left") {
      if (isTargetRtcSenderPeer(signal.peerId, peerTarget, opts.senderPeerId ?? ANDROID_RTC_SENDER_PEER)) {
        opts.onTargetPeerMissing?.([...peers.keys()].filter((peerId) => peerId !== signal.peerId))
      }
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

  function connectPeer(remotePeerId: string): PeerRecord {
    if (peers.has(remotePeerId)) closePeer(remotePeerId)
    return createPeer(remotePeerId, true)
  }

  function createPeer(remotePeerId: string, initiator: boolean): PeerRecord {
    const existing = peers.get(remotePeerId)
    if (existing !== undefined) return existing

    const connection = new RTCPeerConnection({iceServers: opts.iceServers ?? RTC_ICE_SERVERS})
    applyVideoCodecPreference(connection.addTransceiver("video", {direction: "recvonly"}), opts.videoCodecPreference)
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
        opts.onDiagnostic?.("track", {
          peerId: remotePeerId,
          kind: event.track.kind,
          readyState: event.track.readyState,
          muted: event.track.muted,
        })
        return
      }
      if (event.track.kind !== "video") return
      const stream = event.streams[0] ?? new MediaStream([event.track])
      if (!startTrackFrameLoop(event.track, stream)) attachVideoStream(stream)
      opts.onStatus("connected", "rtc video")
      opts.onDiagnostic?.("track", {
        peerId: remotePeerId,
        kind: event.track.kind,
        readyState: event.track.readyState,
        muted: event.track.muted,
        streamTracks: stream.getTracks().map((track) => `${track.kind}:${track.readyState}:${track.muted ? "muted" : "live"}`),
      })
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
      opts.onDiagnostic?.("control-result", {
        peerId: peer.id,
        command: message.command,
        ok: message.ok,
        ...(typeof message.error === "string" ? {error: message.error} : {}),
        ...(typeof message.accessibility === "boolean" ? {accessibility: message.accessibility} : {}),
      })
      if (opts.controlResultStatus === "diagnostic") return
      const reason = !message.ok && message.accessibility === false ? " a11y off" : ""
      opts.onStatus(message.ok ? "connected" : "error", `${message.command} ${message.ok ? "ok" : "failed"}${reason}`)
    })
    channel.addEventListener("close", () => {
      if (peer.channel === channel) peer.channel = null
    })
  }

  function attachVideoStream(stream: MediaStream): void {
    stopTrackFrameLoop()
    for (const track of audioStream.getAudioTracks()) {
      if (!stream.getAudioTracks().some((current) => current.id === track.id)) stream.addTrack(track)
    }
    video.srcObject = stream
    ensureVideoElementMounted()
    opts.onVideoElement?.(video)
    void video.play().catch(() => undefined)
    opts.onDiagnostic?.("frame-source", {
      source: "video-element",
      videoTracks: stream.getVideoTracks().map((track) => `${track.readyState}:${track.muted ? "muted" : "live"}`),
      audioTracks: stream.getAudioTracks().map((track) => `${track.readyState}:${track.muted ? "muted" : "live"}`),
    })
    startFrameLoop()
  }

  function startTrackFrameLoop(track: MediaStreamTrack, fallbackStream: MediaStream): boolean {
    if (opts.metadataOnlyFrames !== true) return false
    if (opts.frameReadMode !== "track-processor") return false
    const Processor = mediaStreamTrackProcessorConstructor()
    if (Processor === undefined) return false
    stopTrackFrameLoop()
    video.srcObject = null
    video.remove()
    opts.onVideoElement?.(null)
    const frameTrack = track.clone()
    const abortController = new AbortController()
    trackFrameAbortController = abortController
    trackFrameReaderTrack = frameTrack
    void readTrackFrames(new Processor({track: frameTrack}), frameTrack, abortController, fallbackStream)
    opts.onDiagnostic?.("frame-source", {
      source: "mediastream-track-processor",
      trackId: track.id,
      readyState: track.readyState,
      muted: track.muted,
    })
    return true
  }

  async function readTrackFrames(
    processor: MediaStreamTrackProcessorInstance,
    track: MediaStreamTrack,
    abortController: AbortController,
    fallbackStream: MediaStream,
  ): Promise<void> {
    const reader = processor.readable.getReader()
    const abortReader = (): void => {
      void reader.cancel().catch(() => undefined)
    }
    const endReader = (): void => abortController.abort()
    abortController.signal.addEventListener("abort", abortReader, {once: true})
    track.addEventListener("ended", endReader, {once: true})
    try {
      while (!abortController.signal.aborted && track.readyState === "live") {
        const result = await reader.read()
        if (result.done) break
        copyTrackFrame(result.value)
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        opts.onDiagnostic?.("frame-source-error", {
          source: "mediastream-track-processor",
          error: error instanceof Error ? error.message : String(error),
        })
        attachVideoStream(fallbackStream)
      }
    } finally {
      abortController.signal.removeEventListener("abort", abortReader)
      track.removeEventListener("ended", endReader)
      reader.releaseLock()
      track.stop()
      if (trackFrameAbortController === abortController) {
        trackFrameAbortController = null
        trackFrameReaderTrack = null
      }
    }
  }

  function copyTrackFrame(frame: BrowserVideoFrame): void {
    let textureLoaderOwnsFrame = false
    try {
      const now = performance.now()
      const minFrameIntervalMs = opts.minFrameIntervalMs ?? 0
      if (minFrameIntervalMs > 0 && now - lastFrameAt < minFrameIntervalMs) return
      const width = videoFrameWidth(frame)
      const height = videoFrameHeight(frame)
      if (width <= 0 || height <= 0) {
        reportWaitingForVideoFrame(now)
        return
      }
      lastFrameAt = now
      analyzeFrameSource(frame, width, height, now, "mediastream-track-frame")
      textureLoaderOwnsFrame = TextureLoader.replaceExternalSource(opts.frameSrc, frame, width, height, {
        keepPending: false,
        bufferCount: 3,
        closeSourceAfterCopy: true,
      })
      opts.onFrame({src: opts.frameSrc, width, height, capturedAt: Date.now()})
      if (now - lastMetadataFrameDiagnosticAt >= METADATA_FRAME_DIAGNOSTIC_INTERVAL_MS) {
        lastMetadataFrameDiagnosticAt = now
        opts.onDiagnostic?.("frame", {
          width,
          height,
          readyState: video.readyState,
          paused: video.paused,
          timestampUs: videoFrameTimestamp(frame),
          upload: "mediastream-track-frame-gpu-copy-buffered",
        })
      }
      void reportReceiverStats(now)
    } finally {
      if (!textureLoaderOwnsFrame) frame.close?.()
    }
  }

  function stopTrackFrameLoop(): void {
    trackFrameAbortController?.abort()
    trackFrameAbortController = null
    trackFrameReaderTrack?.stop()
    trackFrameReaderTrack = null
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
    const watchdog = (): void => {
      if (!frameLoopStarted || video.srcObject === null) return
      void copyVideoFrame()
      requestAnimationFrame(watchdog)
    }
    if (requestVideoFrame !== undefined) requestVideoFrame.call(video, tick)
    else requestAnimationFrame(tick)
    if (requestVideoFrame !== undefined && opts.metadataOnlyFrames !== true) requestAnimationFrame(watchdog)
  }

  async function copyVideoFrame(): Promise<void> {
    if (frameCopyInFlight) return
    const now = performance.now()
    const minFrameIntervalMs = opts.minFrameIntervalMs ?? (opts.metadataOnlyFrames === true ? 0 : DEFAULT_MIN_FRAME_INTERVAL_MS)
    if (minFrameIntervalMs > 0 && now - lastFrameAt < minFrameIntervalMs) return
    const width = video.videoWidth
    const height = video.videoHeight
    if (width <= 0 || height <= 0) {
      reportWaitingForVideoFrame(now)
      return
    }
    if (opts.ignoreBlackFrames === true && frameLooksBlack(video, width, height, now)) {
      return
    }
    if (opts.metadataOnlyFrames === true) {
      lastFrameAt = now
      analyzeFrameSource(video, width, height, now, "video-element")
      TextureLoader.replaceExternalSource(opts.frameSrc, video, width, height, {bufferCount: 3})
      opts.onFrame({src: opts.frameSrc, width, height, capturedAt: Date.now()})
      if (now - lastMetadataFrameDiagnosticAt >= METADATA_FRAME_DIAGNOSTIC_INTERVAL_MS) {
        lastMetadataFrameDiagnosticAt = now
        opts.onDiagnostic?.("frame", {
          width,
          height,
          readyState: video.readyState,
          paused: video.paused,
          currentTime: video.currentTime,
          upload: "video-gpu-copy-buffered",
        })
      }
      void reportReceiverStats(now)
      return
    }
    frameCopyInFlight = true
    lastFrameAt = now
    try {
      const bitmap = await createImageBitmap(video)
      if (opts.ignoreBlackFrames === true && frameLooksBlack(bitmap, width, height, performance.now())) {
        bitmap.close?.()
        return
      }
      TextureLoader.replaceBitmap(opts.frameSrc, bitmap)
      opts.onFrame({src: opts.frameSrc, width, height, capturedAt: Date.now()})
      opts.onDiagnostic?.("frame", {
        width,
        height,
        readyState: video.readyState,
        paused: video.paused,
      })
      void reportReceiverStats(now)
    } catch (error) {
      opts.onStatus("error", error instanceof Error ? error.message : String(error))
    } finally {
      frameCopyInFlight = false
    }
  }

  function reportWaitingForVideoFrame(now: number): void {
    if (now - lastVideoWaitingStatusAt < 1_000) return
    lastVideoWaitingStatusAt = now
    opts.onDiagnostic?.("video-wait", {
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      muted: video.muted,
      width: video.videoWidth,
      height: video.videoHeight,
      tracks: video.srcObject instanceof MediaStream
        ? video.srcObject.getTracks().map((track) => `${track.kind}:${track.readyState}:${track.muted ? "muted" : "live"}`)
        : [],
    })
    void reportReceiverStats(now)
  }

  async function reportReceiverStats(now: number): Promise<void> {
    if (now - lastReceiverStatsAt < 2_000) return
    lastReceiverStatsAt = now
    for (const peer of peers.values()) {
      for (const receiver of peer.connection.getReceivers()) {
        const kind = receiver.track?.kind
        if (kind !== "video" && kind !== "audio") continue
        try {
          const stats = await receiver.getStats()
          const inbound = [...stats.values()].find((item) => item.type === "inbound-rtp" && (item as {kind?: unknown}).kind === kind)
          if (inbound === undefined) continue
          const entry = inbound as {
            framesReceived?: unknown
            framesDecoded?: unknown
            framesDropped?: unknown
            framesPerSecond?: unknown
            frameWidth?: unknown
            frameHeight?: unknown
            bytesReceived?: unknown
            packetsReceived?: unknown
            packetsLost?: unknown
            totalDecodeTime?: unknown
            audioLevel?: unknown
            totalAudioEnergy?: unknown
            totalSamplesDuration?: unknown
            jitter?: unknown
            jitterBufferDelay?: unknown
            jitterBufferEmittedCount?: unknown
            freezeCount?: unknown
            pauseCount?: unknown
            totalFreezesDuration?: unknown
            estimatedPlayoutTimestamp?: unknown
          }
          if (kind === "video") {
            opts.onDiagnostic?.("receiver-stats", {
              peerId: peer.id,
              framesReceived: entry.framesReceived,
              framesDecoded: entry.framesDecoded,
              framesDropped: entry.framesDropped,
              framesPerSecond: entry.framesPerSecond,
              frameWidth: entry.frameWidth,
              frameHeight: entry.frameHeight,
              bytesReceived: entry.bytesReceived,
              packetsReceived: entry.packetsReceived,
              packetsLost: entry.packetsLost,
              totalDecodeTime: entry.totalDecodeTime,
              jitter: entry.jitter,
              jitterBufferDelay: entry.jitterBufferDelay,
              jitterBufferEmittedCount: entry.jitterBufferEmittedCount,
              freezeCount: entry.freezeCount,
              pauseCount: entry.pauseCount,
              totalFreezesDuration: entry.totalFreezesDuration,
              estimatedPlayoutTimestamp: entry.estimatedPlayoutTimestamp,
            })
          } else {
            opts.onDiagnostic?.("audio-receiver-stats", {
              peerId: peer.id,
              readyState: receiver.track?.readyState,
              muted: receiver.track?.muted,
              bytesReceived: entry.bytesReceived,
              packetsReceived: entry.packetsReceived,
              packetsLost: entry.packetsLost,
              audioLevel: entry.audioLevel,
              totalAudioEnergy: entry.totalAudioEnergy,
              totalSamplesDuration: entry.totalSamplesDuration,
              jitter: entry.jitter,
            })
          }
        } catch (error) {
          opts.onDiagnostic?.(kind === "audio" ? "audio-receiver-stats-error" : "receiver-stats-error", {
            peerId: peer.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }

  function analyzeFrameSource(
    source: CanvasImageSource | BrowserVideoFrame,
    width: number,
    height: number,
    now: number,
    sourceKind: string,
  ): void {
    if (now - lastFrameAnalysisAt < FRAME_ANALYSIS_INTERVAL_MS) return
    lastFrameAnalysisAt = now
    const canvas = frameAnalysisCanvas ?? document.createElement("canvas")
    frameAnalysisCanvas = canvas
    const sampleWidth = 160
    const sampleHeight = Math.max(1, Math.round((sampleWidth * height) / width))
    canvas.width = sampleWidth
    canvas.height = sampleHeight
    const context = frameAnalysisContext ?? canvas.getContext("2d", {willReadFrequently: true})
    if (context === null) return
    frameAnalysisContext = context
    try {
      context.drawImage(source as CanvasImageSource, 0, 0, sampleWidth, sampleHeight)
      const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
      const rowLuma = new Array<number>(sampleHeight).fill(0)
      let minLuma = Number.POSITIVE_INFINITY
      let maxLuma = 0
      for (let y = 0; y < sampleHeight; y += 1) {
        let sum = 0
        const rowOffset = y * sampleWidth * 4
        for (let x = 0; x < sampleWidth; x += 1) {
          const offset = rowOffset + x * 4
          sum += (pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!) / 3
        }
        const avg = sum / sampleWidth
        rowLuma[y] = avg
        minLuma = Math.min(minLuma, avg)
        maxLuma = Math.max(maxLuma, avg)
      }
      let diffSum = 0
      let maxRowDiff = 0
      let hardRowTransitions = 0
      let blackRows = 0
      let darkRows = 0
      let blackRowRuns = 0
      let inBlackRun = false
      for (let y = 0; y < sampleHeight; y += 1) {
        const luma = rowLuma[y]!
        if (luma < 8) {
          blackRows += 1
          if (!inBlackRun) {
            blackRowRuns += 1
            inBlackRun = true
          }
        } else {
          inBlackRun = false
        }
        if (luma < 24) darkRows += 1
        if (y === 0) continue
        const diff = Math.abs(luma - rowLuma[y - 1]!)
        diffSum += diff
        maxRowDiff = Math.max(maxRowDiff, diff)
        if (diff >= 36) hardRowTransitions += 1
      }
      const avgRowDiff = sampleHeight <= 1 ? 0 : diffSum / (sampleHeight - 1)
      opts.onDiagnostic?.("frame-analysis", {
        source: sourceKind,
        width,
        height,
        sampleWidth,
        sampleHeight,
        minRowLuma: Math.round(minLuma * 10) / 10,
        maxRowLuma: Math.round(maxLuma * 10) / 10,
        avgRowDiff: Math.round(avgRowDiff * 10) / 10,
        maxRowDiff: Math.round(maxRowDiff * 10) / 10,
        hardRowTransitions,
        blackRows,
        darkRows,
        blackRowRuns,
        timestampUs: isBrowserVideoFrame(source) ? videoFrameTimestamp(source) : null,
      })
    } catch (error) {
      opts.onDiagnostic?.("frame-analysis-error", {
        source: sourceKind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function frameLooksBlack(source: CanvasImageSource, width: number, height: number, now: number): boolean {
    const canvas = blackFrameCanvas ?? document.createElement("canvas")
    blackFrameCanvas = canvas
    canvas.width = 96
    canvas.height = Math.max(1, Math.round((canvas.width * height) / width))
    const context = blackFrameContext ?? canvas.getContext("2d", {willReadFrequently: true})
    if (context === null) return false
    blackFrameContext = context
    try {
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0
      let nonBlack = 0
      const count = pixels.length / 4
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3
        sum += luminance
        if (luminance > BLACK_FRAME_BRIGHT_LUMA) nonBlack += 1
      }
      const avgLuma = sum / count
      const brightRatio = nonBlack / count
      const isBlack = avgLuma < BLACK_FRAME_MAX_AVG_LUMA && brightRatio < BLACK_FRAME_MAX_BRIGHT_RATIO
      if (isBlack && now - lastBlackFrameStatusAt >= 1000) {
        lastBlackFrameStatusAt = now
        opts.onStatus("running", "rtc black frame")
      }
      return isBlack
    } catch {
      return false
    }
  }

  function attachAudioTrack(track: MediaStreamTrack): void {
    if (audioStream.getAudioTracks().some((current) => current.id === track.id)) return
    audioStream.addTrack(track)
    attachAudioTrackToVideoClock(track)
    track.addEventListener("mute", () => {
      opts.onDiagnostic?.("audio-track-state", {readyState: track.readyState, muted: track.muted, state: "mute"})
    })
    track.addEventListener("unmute", () => {
      opts.onDiagnostic?.("audio-track-state", {readyState: track.readyState, muted: track.muted, state: "unmute"})
    })
    track.addEventListener("ended", () => {
      opts.onDiagnostic?.("audio-track-state", {readyState: track.readyState, muted: track.muted, state: "ended"})
      if (audioStream.getAudioTracks().some((current) => current.id === track.id)) {
        audioStream.removeTrack(track)
        detachAudioTrackFromVideoClock(track)
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
    for (const track of tracks) {
      audioStream.removeTrack(track)
      detachAudioTrackFromVideoClock(track)
    }
    opts.onAudio?.(null)
  }

  function attachAudioTrackToVideoClock(track: MediaStreamTrack): void {
    const stream = video.srcObject
    if (!(stream instanceof MediaStream)) return
    if (stream.getAudioTracks().some((current) => current.id === track.id)) return
    stream.addTrack(track)
    opts.onDiagnostic?.("video-clock-audio-track", {
      readyState: track.readyState,
      muted: track.muted,
      audioTracks: stream.getAudioTracks().length,
    })
  }

  function detachAudioTrackFromVideoClock(track: MediaStreamTrack): void {
    const stream = video.srcObject
    if (!(stream instanceof MediaStream)) return
    if (!stream.getAudioTracks().some((current) => current.id === track.id)) return
    stream.removeTrack(track)
  }

  function ensureVideoElementMounted(): void {
    if (video.isConnected) return
    document.body?.appendChild(video)
  }

  function closePeer(remotePeerId: string): void {
    const peer = peers.get(remotePeerId)
    if (peer === undefined) return
    peers.delete(remotePeerId)
    peer.channel?.close()
    peer.connection.close()
    if (peers.size === 0) {
      clearVideoStream()
      clearAudioStream()
    }
  }

  function closeAllPeers(): void {
    for (const peerId of [...peers.keys()]) closePeer(peerId)
    clearVideoStream()
    clearAudioStream()
  }

  function clearVideoStream(): void {
    stopTrackFrameLoop()
    video.srcObject = null
    video.remove()
    opts.onVideoElement?.(null)
    frameLoopStarted = false
    frameCopyInFlight = false
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

function mediaStreamTrackProcessorConstructor(): MediaStreamTrackProcessorConstructor | undefined {
  return (globalThis as unknown as {
    MediaStreamTrackProcessor?: MediaStreamTrackProcessorConstructor
  }).MediaStreamTrackProcessor
}

function videoFrameWidth(frame: BrowserVideoFrame): number {
  return frame.displayWidth ?? frame.codedWidth ?? ("width" in frame && typeof frame.width === "number" ? frame.width : 0)
}

function videoFrameHeight(frame: BrowserVideoFrame): number {
  return frame.displayHeight ?? frame.codedHeight ?? ("height" in frame && typeof frame.height === "number" ? frame.height : 0)
}

function videoFrameTimestamp(frame: BrowserVideoFrame): number | null {
  return typeof frame.timestamp === "number" ? frame.timestamp : null
}

function isBrowserVideoFrame(value: CanvasImageSource | BrowserVideoFrame): value is BrowserVideoFrame {
  return typeof (value as BrowserVideoFrame).close === "function" || typeof (value as BrowserVideoFrame).timestamp === "number"
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

function parseControlMessage(raw: string): {type: "control-result"; command: string; ok: boolean; accessibility?: boolean; error?: string} | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const type = (parsed as {type?: unknown}).type
    if (type !== "control-result") return null
    const command = (parsed as {command?: unknown}).command
    const ok = (parsed as {ok?: unknown}).ok
    const accessibility = (parsed as {accessibility?: unknown}).accessibility
    const error = (parsed as {error?: unknown}).error
    return {
      type,
      command: typeof command === "string" && command.length > 0 ? command : "control",
      ok: ok === true,
      ...(typeof accessibility === "boolean" ? {accessibility} : {}),
      ...(typeof error === "string" && error.length > 0 ? {error} : {}),
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

function applyVideoCodecPreference(
  transceiver: RTCRtpTransceiver,
  codecPreference: AndroidRtcClientOpts["videoCodecPreference"],
): void {
  if (codecPreference === undefined || typeof transceiver.setCodecPreferences !== "function") return
  const capabilities = RTCRtpReceiver.getCapabilities?.("video")
  const codecs = Array.isArray(capabilities?.codecs) ? capabilities.codecs : []
  if (codecs.length === 0) return
  const preferredMime = `video/${codecPreference}`
  const preferred = codecs.filter((codec) => codec.mimeType.toLowerCase() === preferredMime.toLowerCase())
  if (preferred.length === 0) return
  transceiver.setCodecPreferences([...preferred, ...codecs.filter((codec) => !preferred.includes(codec))])
}
