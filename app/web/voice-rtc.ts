import type {VoiceInputAsrSocketContext, VoiceInputSocket} from "../../pkg/interpreter/web/voice-input.ts"

export type VoiceRtcDebugSnapshot = {
	state: string
	appPeerId: string
	relayPeerId: string
	sampleRate: number
	localAudioBytes: number
	localAudioRms: number
	relayAudioBytes: number
	relayAudioRms: number
	asrMessages: number
	asrTextMessages: number
	lastAsrType: string
	lastAsrText: string
	fallbackReason: string
	updatedAt: number
}

type VoiceRtcSignal =
	| {type: "hello"; room: string; peerId: string; peers: string[]}
	| {type: "peer-joined"; peerId: string}
	| {type: "peer-left"; peerId: string}
	| {type: "offer"; from: string; to?: string; description: RTCSessionDescriptionInit}
	| {type: "answer"; from: string; to?: string; description: RTCSessionDescriptionInit}
	| {type: "ice"; from: string; to?: string; candidate: RTCIceCandidateInit}

type VoiceRtcControlMessage =
	| {type: "hello"; peerId?: string; role?: string}
	| {type: "asr-control"; url?: string; payload?: unknown}

type VoiceRtcRelayPeer = {
	id: string
	connection: RTCPeerConnection
	channel: RTCDataChannel | null
	audioStream: MediaStream | null
	asrWs: WebSocket | null
	audioContext: AudioContext | null
	sourceNode: MediaStreamAudioSourceNode | null
	captureNode: AudioWorkletNode | null
	sinkNode: GainNode | null
	workletUrl: string | null
	outboundPcmChunks: ArrayBuffer[]
	outboundPcmBytes: number
	outboundFlushTimer: number | null
	queuedPcmAfterCommit: ArrayBuffer[]
	commitPending: boolean
	audioStarted: boolean
	audioBytes: number
	audioRms: number
	lastAudioStatusAt: number
	asrMessages: number
	asrTextMessages: number
}

const VOICE_RTC_ROOM = "app-web-voice"
const VOICE_RTC_RELAY_PEER_PREFIX = "voice-relay"
const VOICE_RTC_APP_PEER_PREFIX = "app-web-voice"
const VOICE_RTC_CONNECT_TIMEOUT_MS = 2500
const VOICE_RTC_MEDIA_TIMEOUT_MS = 1800
const VOICE_RTC_ASR_TEXT_TIMEOUT_MS = 4200
const TARGET_RELAY_SAMPLE_RATE = 16_000
const PCM_FLUSH_BYTES = 4096
const PCM_FLUSH_MS = 120
const MAX_QUEUED_PCM_BYTES = 8 * 1024 * 1024
const MAX_PENDING_FALLBACK_PCM_BYTES = 3 * 1024 * 1024

let relay: VoiceRtcRelay | null = null
let voiceRtcDebug: VoiceRtcDebugSnapshot = {
	state: "idle",
	appPeerId: "",
	relayPeerId: "",
	sampleRate: 0,
	localAudioBytes: 0,
	localAudioRms: 0,
	relayAudioBytes: 0,
	relayAudioRms: 0,
	asrMessages: 0,
	asrTextMessages: 0,
	lastAsrType: "",
	lastAsrText: "",
	fallbackReason: "",
	updatedAt: 0,
}
const voiceRtcDebugListeners = new Set<() => void>()

export function readVoiceRtcDebugSnapshot(): VoiceRtcDebugSnapshot {
	return {...voiceRtcDebug}
}

export function onVoiceRtcDebug(listener: () => void): () => void {
	voiceRtcDebugListeners.add(listener)
	return () => voiceRtcDebugListeners.delete(listener)
}

type VoiceRtcDebugGlobal = typeof globalThis & {__metaVoiceRtcDebug?: () => VoiceRtcDebugSnapshot}
;(globalThis as VoiceRtcDebugGlobal).__metaVoiceRtcDebug = readVoiceRtcDebugSnapshot

export function createVoiceRtcAsrSocket(url: string, context: VoiceInputAsrSocketContext): VoiceInputSocket | null {
	if (typeof RTCPeerConnection === "undefined" || typeof WebSocket === "undefined") return null
	if (context.stream.getAudioTracks().length === 0) return null
	ensureVoiceRtcRelay()
	return new VoiceRtcAsrSocket(url, context)
}

export function primeVoiceRtcRelayAudio(): void {
	if (typeof AudioContext === "undefined") return
	ensureVoiceRtcRelay().primeAudioContext()
}

class VoiceRtcAsrSocket extends EventTarget implements VoiceInputSocket {
	binaryType: BinaryType = "arraybuffer"
	readonly url: string

	#context: VoiceInputAsrSocketContext
	#peerId = `${VOICE_RTC_APP_PEER_PREFIX}-${crypto.randomUUID()}`
	#readyState: number = WebSocket.CONNECTING
	#signalSocket: WebSocket | null = null
	#connection: RTCPeerConnection | null = null
	#channel: RTCDataChannel | null = null
	#fallbackWs: WebSocket | null = null
	#connectTimer: number | null = null
	#mediaTimer: number | null = null
	#asrTextTimer: number | null = null
	#remotePeerId = ""
	#lastStartPayload: string | null = null
	#pendingFallbackControls: string[] = []
	#pendingFallbackPcm: ArrayBuffer[] = []
	#pendingFallbackPcmBytes = 0
	#localAudioBytes = 0
	#lastLocalAudioStatusAt = 0

	constructor(url: string, context: VoiceInputAsrSocketContext) {
		super()
		this.url = url
		this.#context = context
		updateVoiceRtcDebug({
			state: "connecting",
			appPeerId: this.#peerId,
			sampleRate: context.sampleRate,
			fallbackReason: "",
		})
		this.#connectTimer = window.setTimeout(() => this.#startFallback("signaling timeout"), VOICE_RTC_CONNECT_TIMEOUT_MS)
		this.#connect()
	}

	get readyState(): number {
		return this.#fallbackWs?.readyState ?? this.#readyState
	}

	close(): void {
		this.#clearConnectTimer()
		this.#clearMediaTimer()
		this.#clearAsrTextTimer()
		this.#readyState = WebSocket.CLOSING
		this.#fallbackWs?.close()
		this.#fallbackWs = null
		this.#channel?.close()
		this.#channel = null
		this.#connection?.close()
		this.#connection = null
		this.#signalSocket?.close()
		this.#signalSocket = null
		this.#readyState = WebSocket.CLOSED
		this.#context.onTransport("idle")
		this.dispatchEvent(new CloseEvent("close"))
	}

	send(data: string | ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): void {
		if (this.#fallbackWs !== null) {
			if (this.#fallbackWs.readyState === WebSocket.OPEN) {
				this.#fallbackWs.send(data)
			} else if (typeof data === "string") {
				this.#queueFallbackControl(data)
			} else {
				this.#bufferFallbackPcm(data)
			}
			return
		}
		if (typeof data !== "string") {
			this.#bufferFallbackPcm(data)
			return
		}
		if (this.#channel?.readyState !== "open") return
		const payload = safeJsonParse(data)
		const payloadType = asJsonRecord(payload)?.["type"]
		if (payloadType === "start") {
			this.#lastStartPayload = data
			this.#startMediaTimer()
		} else if (payloadType === "commit") {
			this.#pendingFallbackControls.push(data)
			this.#startAsrTextTimer("ASR text timeout after commit")
		} else {
			this.#pendingFallbackControls.push(data)
		}
		this.#channel.send(JSON.stringify({
			type: "asr-control",
			url: this.url,
			payload,
		}))
	}

	#connect(): void {
		const signalSocket = new WebSocket(signalingUrl(VOICE_RTC_ROOM, this.#peerId))
		this.#signalSocket = signalSocket
		signalSocket.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return
			const signal = parseSignal(event.data)
			if (signal === null) return
			void this.#handleSignal(signal)
		})
		signalSocket.addEventListener("error", () => this.#startFallback("signaling error"))
		signalSocket.addEventListener("close", () => {
			if (this.#readyState !== WebSocket.OPEN) this.#startFallback("signaling closed")
		})
	}

	async #handleSignal(signal: VoiceRtcSignal): Promise<void> {
		if (signal.type === "hello") {
			this.#peerId = signal.peerId
			updateVoiceRtcDebug({appPeerId: signal.peerId, state: "signaling"})
			for (const peerId of signal.peers) {
				if (isVoiceRelayPeer(peerId)) await this.#createPeer(peerId, true)
			}
			return
		}
		if (signal.type === "peer-joined") {
			if (isVoiceRelayPeer(signal.peerId)) await this.#createPeer(signal.peerId, true)
			return
		}
		if (signal.type === "peer-left") {
			if (signal.peerId === this.#remotePeerId) this.#startFallback("relay left")
			return
		}
		if (signal.from === this.#peerId) return
		if (!isVoiceRelayPeer(signal.from)) return
		const connection = await this.#createPeer(signal.from, false)
		if (signal.type === "offer") {
			await connection.setRemoteDescription(signal.description)
			const answer = await connection.createAnswer()
			await connection.setLocalDescription(answer)
			this.#sendSignal({type: "answer", to: signal.from, description: connection.localDescription})
			return
		}
		if (signal.type === "answer") {
			await connection.setRemoteDescription(signal.description)
			return
		}
		await connection.addIceCandidate(signal.candidate)
	}

	async #createPeer(remotePeerId: string, initiator: boolean): Promise<RTCPeerConnection> {
		if (this.#connection !== null) return this.#connection
		this.#remotePeerId = remotePeerId
		updateVoiceRtcDebug({relayPeerId: remotePeerId, state: "peer"})
		const connection = new RTCPeerConnection({iceServers: []})
		this.#connection = connection
		for (const track of this.#context.stream.getAudioTracks()) connection.addTrack(track, this.#context.stream)
		connection.addEventListener("icecandidate", (event) => {
			if (event.candidate === null) return
			this.#sendSignal({type: "ice", to: remotePeerId, candidate: event.candidate.toJSON()})
		})
		connection.addEventListener("connectionstatechange", () => {
			updateVoiceRtcDebug({state: `rtc ${connection.connectionState}`})
			if (connection.connectionState === "failed" || connection.connectionState === "closed") this.#startFallback(`rtc ${connection.connectionState}`)
		})
		connection.addEventListener("datachannel", (event) => this.#attachChannel(event.channel))
		if (initiator) {
			this.#attachChannel(connection.createDataChannel("voice-asr", {ordered: true}))
			const offer = await connection.createOffer()
			await connection.setLocalDescription(offer)
			this.#sendSignal({type: "offer", to: remotePeerId, description: connection.localDescription})
		}
		return connection
	}

	#attachChannel(channel: RTCDataChannel): void {
		this.#channel = channel
		channel.addEventListener("open", () => {
			this.#clearConnectTimer()
			this.#readyState = WebSocket.OPEN
			updateVoiceRtcDebug({state: "datachannel open"})
			channel.send(JSON.stringify({
				type: "hello",
				peerId: this.#peerId,
				role: "app-web-voice",
				sampleRate: this.#context.sampleRate,
				language: this.#context.language,
				context: this.#context.context,
			}))
			this.dispatchEvent(new Event("open"))
		})
		channel.addEventListener("message", (event) => {
			if (typeof event.data === "string" && this.#handleRelayStatus(event.data)) return
			if (typeof event.data === "string" && asrMessageHasText(event.data)) {
				this.#clearAsrTextTimer()
				this.#clearPendingFallback()
			}
			this.dispatchEvent(new MessageEvent("message", {data: event.data}))
		})
		channel.addEventListener("error", () => this.#startFallback("datachannel error"))
		channel.addEventListener("close", () => {
			if (this.#fallbackWs === null && this.#readyState === WebSocket.OPEN) this.#startFallback("datachannel closed")
		})
	}

	#startFallback(reason = "fallback"): void {
		if (this.#fallbackWs !== null || this.#readyState === WebSocket.CLOSING || this.#readyState === WebSocket.CLOSED) return
		updateVoiceRtcDebug({state: "fallback", fallbackReason: reason})
		this.#clearConnectTimer()
		this.#clearMediaTimer()
		this.#clearAsrTextTimer()
		this.#channel?.close()
		this.#channel = null
		this.#connection?.close()
		this.#connection = null
		this.#signalSocket?.close()
		this.#signalSocket = null
		const ws = new WebSocket(this.url)
		ws.binaryType = this.binaryType
		this.#fallbackWs = ws
		ws.addEventListener("open", () => {
			this.#readyState = WebSocket.OPEN
			this.#context.onTransport("ws")
			if (this.#lastStartPayload !== null) ws.send(this.#lastStartPayload)
			this.#flushPendingFallbackPcm(ws)
			this.#flushPendingFallbackControls(ws)
			this.dispatchEvent(new Event("open"))
		})
		ws.addEventListener("message", (event) => this.dispatchEvent(new MessageEvent("message", {data: event.data})))
		ws.addEventListener("error", () => this.dispatchEvent(new Event("error")))
		ws.addEventListener("close", () => {
			this.#readyState = WebSocket.CLOSED
			this.#context.onTransport("idle")
			this.dispatchEvent(new CloseEvent("close"))
		})
	}

	#sendSignal(payload: Record<string, unknown>): void {
		if (this.#signalSocket?.readyState !== WebSocket.OPEN) return
		this.#signalSocket.send(JSON.stringify(payload))
	}

	#clearConnectTimer(): void {
		if (this.#connectTimer === null) return
		window.clearTimeout(this.#connectTimer)
		this.#connectTimer = null
	}

	#startMediaTimer(): void {
		this.#clearMediaTimer()
		this.#mediaTimer = window.setTimeout(() => this.#startFallback("relay media timeout"), VOICE_RTC_MEDIA_TIMEOUT_MS)
	}

	#clearMediaTimer(): void {
		if (this.#mediaTimer === null) return
		window.clearTimeout(this.#mediaTimer)
		this.#mediaTimer = null
	}

	#startAsrTextTimer(reason = "ASR text timeout"): void {
		this.#clearAsrTextTimer()
		updateVoiceRtcDebug({fallbackReason: `waiting: ${reason}`})
		this.#asrTextTimer = window.setTimeout(() => this.#startFallback(reason), VOICE_RTC_ASR_TEXT_TIMEOUT_MS)
	}

	#clearAsrTextTimer(): void {
		if (this.#asrTextTimer === null) return
		window.clearTimeout(this.#asrTextTimer)
		this.#asrTextTimer = null
	}

	#handleRelayStatus(raw: string): boolean {
		const message = asJsonRecord(safeJsonParse(raw))
		if (message?.["type"] !== "relay-status") return false
		const state = stringValue(message["state"]) ?? "relay-status"
		const sampleRate = numberValue(message["sampleRate"])
		const bytes = numberValue(message["bytes"])
		const rms = numberValue(message["rms"])
		updateVoiceRtcDebug({
			state,
			...(sampleRate === undefined ? {} : {sampleRate}),
			...(bytes === undefined ? {} : {relayAudioBytes: bytes}),
			...(rms === undefined ? {} : {relayAudioRms: rms}),
		})
		if (message["state"] === "audio") {
			this.#clearMediaTimer()
			this.#context.onTransport("p2p")
		}
		return true
	}

	#bufferFallbackPcm(data: ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): void {
		const buffer = binaryDataToArrayBuffer(data)
		if (buffer === null) return
		this.#trackLocalPcm(buffer)
		this.#pendingFallbackPcm.push(buffer)
		this.#pendingFallbackPcmBytes += buffer.byteLength
		while (this.#pendingFallbackPcmBytes > MAX_PENDING_FALLBACK_PCM_BYTES && this.#pendingFallbackPcm.length > 0) {
			const dropped = this.#pendingFallbackPcm.shift()
			this.#pendingFallbackPcmBytes -= dropped?.byteLength ?? 0
		}
	}

	#queueFallbackControl(data: string): void {
		const payload = asJsonRecord(safeJsonParse(data))
		if (payload?.["type"] === "start") {
			this.#lastStartPayload = data
			return
		}
		this.#pendingFallbackControls.push(data)
	}

	#flushPendingFallbackPcm(ws: WebSocket): void {
		for (const pcm of this.#pendingFallbackPcm) ws.send(pcm)
		this.#pendingFallbackPcm = []
		this.#pendingFallbackPcmBytes = 0
	}

	#flushPendingFallbackControls(ws: WebSocket): void {
		for (const payload of this.#pendingFallbackControls) ws.send(payload)
		this.#pendingFallbackControls = []
	}

	#clearPendingFallback(): void {
		this.#lastStartPayload = null
		this.#pendingFallbackControls = []
		this.#pendingFallbackPcm = []
		this.#pendingFallbackPcmBytes = 0
		updateVoiceRtcDebug({fallbackReason: "p2p text received"})
	}

	#trackLocalPcm(buffer: ArrayBuffer): void {
		this.#localAudioBytes += buffer.byteLength
		const now = performance.now()
		if (now - this.#lastLocalAudioStatusAt < 500) return
		this.#lastLocalAudioStatusAt = now
		updateVoiceRtcDebug({
			localAudioBytes: this.#localAudioBytes,
			localAudioRms: pcm16Rms(buffer),
		})
	}
}

class VoiceRtcRelay {
	#peerId = `${VOICE_RTC_RELAY_PEER_PREFIX}-${crypto.randomUUID()}`
	#socket: WebSocket | null = null
	#peers = new Map<string, VoiceRtcRelayPeer>()
	#primedAudioContext: AudioContext | null = null

	connect(): void {
		if (this.#socket?.readyState === WebSocket.OPEN || this.#socket?.readyState === WebSocket.CONNECTING) return
		const socket = new WebSocket(signalingUrl(VOICE_RTC_ROOM, this.#peerId))
		this.#socket = socket
		socket.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return
			const signal = parseSignal(event.data)
			if (signal === null) return
			void this.#handleSignal(signal)
		})
		socket.addEventListener("close", () => {
			this.#socket = null
			this.#closeAllPeers()
		})
		socket.addEventListener("error", () => {
			this.#closeAllPeers()
		})
	}

	primeAudioContext(): void {
		const context = this.#usablePrimedAudioContext()
		if (context !== null) {
			if (context.state === "suspended") void context.resume().catch(() => undefined)
			return
		}
		try {
			this.#primedAudioContext = new AudioContext({sampleRate: TARGET_RELAY_SAMPLE_RATE})
		} catch {
			this.#primedAudioContext = new AudioContext()
		}
		if (this.#primedAudioContext.state === "suspended") void this.#primedAudioContext.resume().catch(() => undefined)
	}

	async #handleSignal(signal: VoiceRtcSignal): Promise<void> {
		if (signal.type === "hello") {
			this.#peerId = signal.peerId
			return
		}
		if (signal.type === "peer-left") {
			this.#closePeer(signal.peerId)
			return
		}
		if (signal.type === "peer-joined") return
		if (signal.from === this.#peerId) return
		if (!isAppVoicePeer(signal.from)) return
		const peer = this.#createPeer(signal.from)
		if (signal.type === "offer") {
			await peer.connection.setRemoteDescription(signal.description)
			const answer = await peer.connection.createAnswer()
			await peer.connection.setLocalDescription(answer)
			this.#sendSignal({type: "answer", to: signal.from, description: peer.connection.localDescription})
			return
		}
		if (signal.type === "answer") {
			await peer.connection.setRemoteDescription(signal.description)
			return
		}
		await peer.connection.addIceCandidate(signal.candidate)
	}

	#createPeer(remotePeerId: string): VoiceRtcRelayPeer {
		const existing = this.#peers.get(remotePeerId)
		if (existing !== undefined) return existing

		const connection = new RTCPeerConnection({iceServers: []})
		const peer: VoiceRtcRelayPeer = {
			id: remotePeerId,
			connection,
			channel: null,
			audioStream: null,
			asrWs: null,
			audioContext: null,
			sourceNode: null,
			captureNode: null,
			sinkNode: null,
			workletUrl: null,
			outboundPcmChunks: [],
			outboundPcmBytes: 0,
			outboundFlushTimer: null,
			queuedPcmAfterCommit: [],
			commitPending: false,
			audioStarted: false,
			audioBytes: 0,
			audioRms: 0,
			lastAudioStatusAt: 0,
			asrMessages: 0,
			asrTextMessages: 0,
		}
		this.#peers.set(remotePeerId, peer)

		connection.addEventListener("icecandidate", (event) => {
			if (event.candidate === null) return
			this.#sendSignal({type: "ice", to: remotePeerId, candidate: event.candidate.toJSON()})
		})
		connection.addEventListener("connectionstatechange", () => {
			if (connection.connectionState === "failed" || connection.connectionState === "closed") this.#closePeer(remotePeerId)
		})
		connection.addEventListener("datachannel", (event) => this.#attachChannel(peer, event.channel))
		connection.addEventListener("track", (event) => {
			peer.audioStream = event.streams[0] ?? new MediaStream([event.track])
			updateVoiceRtcDebug({state: "remote track", relayPeerId: remotePeerId})
			void this.#startRelayCapture(peer)
		})

		return peer
	}

	#attachChannel(peer: VoiceRtcRelayPeer, channel: RTCDataChannel): void {
		peer.channel = channel
		channel.addEventListener("open", () => {
			channel.send(JSON.stringify({type: "hello", peerId: this.#peerId, role: "voice-relay"}))
		})
		channel.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return
			const message = parseControlMessage(event.data)
			if (message === null) return
			void this.#handleControlMessage(peer, message)
		})
		channel.addEventListener("close", () => {
			if (peer.channel === channel) peer.channel = null
			this.#stopAsr(peer, true)
		})
	}

	async #handleControlMessage(peer: VoiceRtcRelayPeer, message: VoiceRtcControlMessage): Promise<void> {
		if (message.type === "hello") return
		if (message.type !== "asr-control") return
		const payload = asJsonRecord(message.payload)
		if (payload === null) return
		const payloadType = payload["type"]
		if (payloadType === "start") {
			if (typeof message.url !== "string" || message.url.length === 0) return
			await this.#startAsr(peer, message.url, payload)
			return
		}
		if (payloadType === "commit") {
			this.#commitAsr(peer)
			return
		}
		if (payloadType === "stop") {
			this.#sendAsrJson(peer, payload)
			this.#stopAsr(peer, true)
			return
		}
		this.#sendAsrJson(peer, payload)
	}

	async #startAsr(peer: VoiceRtcRelayPeer, url: string, payload: Record<string, unknown>): Promise<void> {
		this.#stopAsr(peer, true)
		let audioContext: AudioContext
		try {
			audioContext = await this.#ensureAudioContext(peer)
		} catch (error) {
			this.#sendRelayError(peer, error)
			return
		}

		const ws = new WebSocket(url)
		ws.binaryType = "arraybuffer"
		peer.asrWs = ws
		updateVoiceRtcDebug({state: "asr connecting", sampleRate: audioContext.sampleRate})
		ws.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return
			if (peer.channel?.readyState === "open") peer.channel.send(event.data)
			this.#recordAsrMessage(peer, event.data)
			const message = safeJsonParse(event.data)
			if (asJsonRecord(message)?.["type"] === "committed") this.#finishCommit(peer)
		})
		ws.addEventListener("close", () => {
			if (peer.asrWs !== ws) return
			peer.asrWs = null
			updateVoiceRtcDebug({state: "asr closed"})
			this.#stopRelayCapture(peer)
		})
		ws.addEventListener("error", () => {
			updateVoiceRtcDebug({state: "asr error", fallbackReason: "relay ASR websocket failed"})
			this.#sendRelayError(peer, "voice relay ASR websocket failed")
		})

		try {
			await new Promise<void>((resolve, reject) => {
				ws.addEventListener("open", () => resolve(), {once: true})
				ws.addEventListener("error", () => reject(new Error(`voice relay ASR websocket failed: ${url}`)), {once: true})
			})
		} catch (error) {
			if (peer.asrWs === ws) peer.asrWs = null
			ws.close()
			this.#sendRelayError(peer, error)
			return
		}

		this.#sendAsrJson(peer, {
			...payload,
			sampleRate: audioContext.sampleRate,
		})
		this.#sendRelayStatus(peer, "asr-open", {sampleRate: audioContext.sampleRate})
		await this.#startRelayCapture(peer)
	}

	async #ensureAudioContext(peer: VoiceRtcRelayPeer): Promise<AudioContext> {
		if (peer.audioContext !== null && peer.audioContext.state !== "closed") {
			if (peer.audioContext.state === "suspended") await peer.audioContext.resume()
			return peer.audioContext
		}
		const primed = this.#usablePrimedAudioContext()
		if (primed !== null) {
			peer.audioContext = primed
			this.#primedAudioContext = null
		} else {
			try {
				peer.audioContext = new AudioContext({sampleRate: TARGET_RELAY_SAMPLE_RATE})
			} catch {
				peer.audioContext = new AudioContext()
			}
		}
		if (peer.audioContext.state === "suspended") await peer.audioContext.resume()
		return peer.audioContext
	}

	#usablePrimedAudioContext(): AudioContext | null {
		return this.#primedAudioContext !== null && this.#primedAudioContext.state !== "closed" ? this.#primedAudioContext : null
	}

	async #startRelayCapture(peer: VoiceRtcRelayPeer): Promise<void> {
		if (peer.captureNode !== null || peer.audioStream === null || peer.asrWs?.readyState !== WebSocket.OPEN) return
		const audioContext = await this.#ensureAudioContext(peer)
		peer.sourceNode = audioContext.createMediaStreamSource(peer.audioStream)
		peer.captureNode = await this.#createCaptureNode(peer, audioContext)
		peer.sinkNode = audioContext.createGain()
		peer.sinkNode.gain.value = 0
		peer.captureNode.port.onmessage = (event: MessageEvent<unknown>) => {
			const samples = event.data
			if (!(samples instanceof Float32Array)) return
			this.#enqueueOutboundPcm(peer, floatToPcm16(samples), rmsLevel(samples))
		}
		peer.sourceNode.connect(peer.captureNode)
		peer.captureNode.connect(peer.sinkNode)
		peer.sinkNode.connect(audioContext.destination)
		this.#sendRelayStatus(peer, "media-capture", {sampleRate: audioContext.sampleRate})
	}

	async #createCaptureNode(peer: VoiceRtcRelayPeer, context: AudioContext): Promise<AudioWorkletNode> {
		const code = `
class VoiceRtcCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const frameCount = input[0].length;
    const mono = new Float32Array(frameCount);
    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] += samples[index] / input.length;
      }
    }
    this.port.postMessage(mono, [mono.buffer]);
    return true;
  }
}
registerProcessor("voice-rtc-capture", VoiceRtcCaptureProcessor);
`
		peer.workletUrl = URL.createObjectURL(new Blob([code], {type: "text/javascript"}))
		await context.audioWorklet.addModule(peer.workletUrl)
		return new AudioWorkletNode(context, "voice-rtc-capture")
	}

	#commitAsr(peer: VoiceRtcRelayPeer): void {
		this.#flushOutboundPcm(peer)
		peer.commitPending = true
		this.#sendAsrJson(peer, {type: "commit"})
	}

	#finishCommit(peer: VoiceRtcRelayPeer): void {
		peer.commitPending = false
		this.#flushQueuedPcm(peer)
		this.#flushOutboundPcm(peer)
	}

	#recordAsrMessage(peer: VoiceRtcRelayPeer, raw: string): void {
		const type = asrMessageType(raw)
		const text = asrMessageText(raw)
		peer.asrMessages += 1
		if (text.length > 0) peer.asrTextMessages += 1
		updateVoiceRtcDebug({
			state: `asr ${type || "message"}`,
			asrMessages: peer.asrMessages,
			asrTextMessages: peer.asrTextMessages,
			lastAsrType: type,
			lastAsrText: text,
		})
	}

	#enqueueOutboundPcm(peer: VoiceRtcRelayPeer, pcm: ArrayBuffer, rms: number): void {
		peer.audioBytes += pcm.byteLength
		peer.audioRms = rms
		const now = performance.now()
		if (!peer.audioStarted || now - peer.lastAudioStatusAt >= 500) {
			peer.audioStarted = true
			peer.lastAudioStatusAt = now
			this.#sendRelayStatus(peer, "audio", {bytes: peer.audioBytes, rms})
		}
		peer.outboundPcmChunks.push(pcm)
		peer.outboundPcmBytes += pcm.byteLength
		if (peer.outboundPcmBytes >= PCM_FLUSH_BYTES) {
			this.#flushOutboundPcm(peer)
			return
		}
		if (peer.outboundFlushTimer !== null) return
		peer.outboundFlushTimer = window.setTimeout(() => {
			peer.outboundFlushTimer = null
			this.#flushOutboundPcm(peer)
		}, PCM_FLUSH_MS)
	}

	#flushOutboundPcm(peer: VoiceRtcRelayPeer): void {
		if (peer.outboundFlushTimer !== null) {
			window.clearTimeout(peer.outboundFlushTimer)
			peer.outboundFlushTimer = null
		}
		if (peer.outboundPcmBytes <= 0) return
		this.#sendAsrPcm(peer, takeOutboundPcm(peer))
	}

	#sendAsrPcm(peer: VoiceRtcRelayPeer, pcm: ArrayBuffer): void {
		if (peer.asrWs?.readyState !== WebSocket.OPEN || peer.commitPending) {
			peer.queuedPcmAfterCommit.push(pcm)
			trimQueuedPcm(peer)
			return
		}
		peer.asrWs.send(pcm)
	}

	#flushQueuedPcm(peer: VoiceRtcRelayPeer): void {
		if (peer.asrWs?.readyState !== WebSocket.OPEN) {
			peer.queuedPcmAfterCommit = []
			return
		}
		for (const pcm of peer.queuedPcmAfterCommit) peer.asrWs.send(pcm)
		peer.queuedPcmAfterCommit = []
	}

	#sendAsrJson(peer: VoiceRtcRelayPeer, payload: Record<string, unknown>): void {
		if (peer.asrWs?.readyState !== WebSocket.OPEN) return
		peer.asrWs.send(JSON.stringify(payload))
	}

	#sendRelayError(peer: VoiceRtcRelayPeer, error: unknown): void {
		if (peer.channel?.readyState !== "open") return
		peer.channel.send(JSON.stringify({
			type: "error",
			error: error instanceof Error ? error.message : String(error),
		}))
	}

	#sendRelayStatus(peer: VoiceRtcRelayPeer, state: string, payload: Record<string, unknown> = {}): void {
		const sampleRate = numberValue(payload["sampleRate"])
		const bytes = numberValue(payload["bytes"])
		const rms = numberValue(payload["rms"])
		updateVoiceRtcDebug({
			state,
			relayPeerId: peer.id,
			...(sampleRate === undefined ? {} : {sampleRate}),
			...(bytes === undefined ? {} : {relayAudioBytes: bytes}),
			...(rms === undefined ? {} : {relayAudioRms: rms}),
		})
		if (peer.channel?.readyState !== "open") return
		peer.channel.send(JSON.stringify({
			type: "relay-status",
			state,
			...payload,
		}))
	}

	#stopAsr(peer: VoiceRtcRelayPeer, closeSocket: boolean): void {
		this.#stopRelayCapture(peer)
		if (closeSocket) peer.asrWs?.close()
		peer.asrWs = null
		peer.commitPending = false
		peer.queuedPcmAfterCommit = []
		peer.audioStarted = false
		peer.audioBytes = 0
		peer.audioRms = 0
		peer.lastAudioStatusAt = 0
		peer.asrMessages = 0
		peer.asrTextMessages = 0
	}

	#stopRelayCapture(peer: VoiceRtcRelayPeer): void {
		if (peer.outboundFlushTimer !== null) {
			window.clearTimeout(peer.outboundFlushTimer)
			peer.outboundFlushTimer = null
		}
		peer.outboundPcmChunks = []
		peer.outboundPcmBytes = 0
		peer.sourceNode?.disconnect()
		peer.captureNode?.disconnect()
		peer.sinkNode?.disconnect()
		peer.sourceNode = null
		peer.captureNode = null
		peer.sinkNode = null
		if (peer.audioContext !== null) void peer.audioContext.close()
		peer.audioContext = null
		if (peer.workletUrl !== null) URL.revokeObjectURL(peer.workletUrl)
		peer.workletUrl = null
	}

	#closePeer(remotePeerId: string): void {
		const peer = this.#peers.get(remotePeerId)
		if (peer === undefined) return
		this.#peers.delete(remotePeerId)
		this.#stopAsr(peer, true)
		peer.channel?.close()
		peer.connection.close()
	}

	#closeAllPeers(): void {
		for (const peerId of [...this.#peers.keys()]) this.#closePeer(peerId)
	}

	#sendSignal(payload: Record<string, unknown>): void {
		if (this.#socket?.readyState !== WebSocket.OPEN) return
		this.#socket.send(JSON.stringify(payload))
	}
}

function ensureVoiceRtcRelay(): VoiceRtcRelay {
	if (relay === null) relay = new VoiceRtcRelay()
	relay.connect()
	return relay
}

function signalingUrl(room: string, peerId: string): string {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:"
	const url = new URL(`${protocol}//${location.host}/hud/webrtc/signaling`)
	url.searchParams.set("room", room)
	url.searchParams.set("peer", peerId)
	return url.toString()
}

function parseSignal(raw: string): VoiceRtcSignal | null {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
		const type = (parsed as {type?: unknown}).type
		return typeof type === "string" ? parsed as VoiceRtcSignal : null
	} catch {
		return null
	}
}

function parseControlMessage(raw: string): VoiceRtcControlMessage | null {
	const parsed = safeJsonParse(raw)
	const record = asJsonRecord(parsed)
	if (record === null) return null
	const type = record["type"]
	if (type === "hello") {
		const message: VoiceRtcControlMessage = {type}
		const peerId = stringValue(record["peerId"])
		const role = stringValue(record["role"])
		if (peerId !== undefined) message.peerId = peerId
		if (role !== undefined) message.role = role
		return message
	}
	if (type === "asr-control") {
		const message: VoiceRtcControlMessage = {type, payload: record["payload"]}
		const url = stringValue(record["url"])
		if (url !== undefined) message.url = url
		return message
	}
	return null
}

function safeJsonParse(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown
	} catch {
		return raw
	}
}

function asJsonRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function updateVoiceRtcDebug(patch: Partial<VoiceRtcDebugSnapshot>): void {
	voiceRtcDebug = {
		...voiceRtcDebug,
		...patch,
		updatedAt: Date.now(),
	}
	for (const listener of voiceRtcDebugListeners) listener()
}

function binaryDataToArrayBuffer(data: ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>): ArrayBuffer | null {
	if (data instanceof ArrayBuffer) return data
	if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
	return null
}

function asrMessageType(raw: string): string {
	const message = asJsonRecord(safeJsonParse(raw))
	const type = message?.["type"]
	return typeof type === "string" ? type : ""
}

function asrMessageText(raw: string): string {
	const message = asJsonRecord(safeJsonParse(raw))
	if (message === null) return ""
	const text = stringValue(message["text"])?.trim()
	if (text) return text
	const json = asJsonRecord(message["json"])
	const jsonText = stringValue(json?.["text"])?.trim() || stringValue(json?.["partial"])?.trim()
	if (jsonText) return jsonText
	const messages = message["messages"]
	if (Array.isArray(messages)) {
		const joined = messages
			.map((item) => typeof item === "string" ? item.trim() : "")
			.filter(Boolean)
			.join(" ")
			.trim()
		if (joined) return joined
	}
	return ""
}

function asrMessageHasText(raw: string): boolean {
	const message = asJsonRecord(safeJsonParse(raw))
	if (message === null) return false
	const type = message["type"]
	if (type !== "partial" && type !== "result" && type !== "final") return false
	return asrMessageText(raw).length > 0
}

function isVoiceRelayPeer(peerId: string): boolean {
	return peerId === VOICE_RTC_RELAY_PEER_PREFIX || peerId.startsWith(`${VOICE_RTC_RELAY_PEER_PREFIX}-`)
}

function isAppVoicePeer(peerId: string): boolean {
	return peerId === VOICE_RTC_APP_PEER_PREFIX || peerId.startsWith(`${VOICE_RTC_APP_PEER_PREFIX}-`)
}

function floatToPcm16(samples: Float32Array): ArrayBuffer {
	const buffer = new ArrayBuffer(samples.length * 2)
	const view = new DataView(buffer)
	for (let index = 0; index < samples.length; index += 1) {
		const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
		view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
	}
	return buffer
}

function rmsLevel(samples: Float32Array): number {
	if (samples.length === 0) return 0
	let sum = 0
	for (const sample of samples) sum += sample * sample
	return Math.sqrt(sum / samples.length)
}

function pcm16Rms(buffer: ArrayBuffer): number {
	const view = new DataView(buffer)
	if (view.byteLength < 2) return 0
	let sum = 0
	let count = 0
	for (let offset = 0; offset + 1 < view.byteLength; offset += 2) {
		const sample = view.getInt16(offset, true) / 0x8000
		sum += sample * sample
		count += 1
	}
	return count === 0 ? 0 : Math.sqrt(sum / count)
}

function takeOutboundPcm(peer: VoiceRtcRelayPeer): ArrayBuffer {
	if (peer.outboundPcmChunks.length === 1) {
		const [pcm] = peer.outboundPcmChunks
		peer.outboundPcmChunks = []
		peer.outboundPcmBytes = 0
		return pcm!
	}
	const payload = new Uint8Array(peer.outboundPcmBytes)
	let offset = 0
	for (const pcm of peer.outboundPcmChunks) {
		payload.set(new Uint8Array(pcm), offset)
		offset += pcm.byteLength
	}
	peer.outboundPcmChunks = []
	peer.outboundPcmBytes = 0
	return payload.buffer
}

function trimQueuedPcm(peer: VoiceRtcRelayPeer): void {
	let total = peer.queuedPcmAfterCommit.reduce((size, pcm) => size + pcm.byteLength, 0)
	while (total > MAX_QUEUED_PCM_BYTES && peer.queuedPcmAfterCommit.length > 0) {
		const dropped = peer.queuedPcmAfterCommit.shift()
		total -= dropped?.byteLength ?? 0
	}
}
