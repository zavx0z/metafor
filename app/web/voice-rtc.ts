import type {VoiceInputAsrSocketContext, VoiceInputSocket} from "@metafor/interpreter/web"
import {RTC_ICE_SERVERS, readSignalUrl} from "./p2p-signaling.ts"

export type VoiceRtcDebugSnapshot = {
	state: string
	appPeerId: string
	serverPeerId: string
	sampleRate: number
	localAudioBytes: number
	localAudioRms: number
	serverAudioBytes: number
	serverAudioRms: number
	asrMessages: number
	asrTextMessages: number
	lastAsrType: string
	lastAsrText: string
	fallbackReason: string
	updatedAt: number
}

const VOICE_RTC_APP_PEER_PREFIX = "app-web-voice"
const VOICE_RTC_CONNECT_TIMEOUT_MS = 30_000
const VOICE_RTC_ICE_GATHER_TIMEOUT_MS = 10_000
const VOICE_RTC_MEDIA_TIMEOUT_MS = 5000
const VOICE_RTC_ASR_TEXT_TIMEOUT_MS = 18_000
const VOICE_RTC_DEBUG_POST_MIN_MS = 1000
const VOICE_RTC_SERVER_PEER_ID = "voice-server"
const VOICE_RTC_OFFER_PATH = "/voice/offer"
const MAX_PENDING_FALLBACK_PCM_BYTES = 3 * 1024 * 1024

let voiceRtcDebug: VoiceRtcDebugSnapshot = {
	state: "idle",
	appPeerId: "",
	serverPeerId: "",
	sampleRate: 0,
	localAudioBytes: 0,
	localAudioRms: 0,
	serverAudioBytes: 0,
	serverAudioRms: 0,
	asrMessages: 0,
	asrTextMessages: 0,
	lastAsrType: "",
	lastAsrText: "",
	fallbackReason: "",
	updatedAt: 0,
}
const voiceRtcDebugListeners = new Set<() => void>()
let voiceRtcDebugPostTimer: number | null = null
let voiceRtcDebugLastPostedAt = 0

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
	return new VoiceRtcAsrSocket(url, context)
}

export function isVoiceRtcRemoteClient(): boolean {
	return isLikelyAndroidBrowser()
}

class VoiceRtcAsrSocket extends EventTarget implements VoiceInputSocket {
	binaryType: BinaryType = "arraybuffer"
	readonly url: string

	#context: VoiceInputAsrSocketContext
	#peerId = `${VOICE_RTC_APP_PEER_PREFIX}-${crypto.randomUUID()}`
	#readyState: number = WebSocket.CONNECTING
	#connection: RTCPeerConnection | null = null
	#channel: RTCDataChannel | null = null
	#fallbackWs: WebSocket | null = null
	#connectTimer: number | null = null
	#mediaTimer: number | null = null
	#asrTextTimer: number | null = null
	#lastStartPayload: string | null = null
	#pendingFallbackControls: string[] = []
	#pendingFallbackPcm: ArrayBuffer[] = []
	#pendingFallbackPcmBytes = 0
	#localAudioBytes = 0
	#lastLocalAudioStatusAt = 0
	#asrMessages = 0
	#asrTextMessages = 0

	constructor(url: string, context: VoiceInputAsrSocketContext) {
		super()
		this.url = url
		this.#context = context
		updateVoiceRtcDebug({
			state: "connecting",
			appPeerId: this.#peerId,
			serverPeerId: VOICE_RTC_SERVER_PEER_ID,
			sampleRate: context.sampleRate,
			fallbackReason: "",
		})
		this.#connectTimer = window.setTimeout(() => this.#startFallback("voice WebRTC timeout"), VOICE_RTC_CONNECT_TIMEOUT_MS)
		void this.#connect()
	}

	get readyState(): number {
		return this.#fallbackWs?.readyState ?? this.#readyState
	}

	close(): void {
		this.#sendRtcBye("client-close")
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
			const buffer = binaryDataToArrayBuffer(data)
			if (buffer === null) return
			if (this.#channel?.readyState === "open") {
				this.#trackLocalPcm(buffer)
				this.#channel.send(buffer)
				this.#ensureMediaTimer()
			}
			else this.#bufferFallbackPcm(buffer)
			return
		}

		this.#trackControlForFallback(data)
		if (this.#channel?.readyState === "open") this.#sendRtcControl(this.#channel, data)
	}

	async #connect(): Promise<void> {
		updateVoiceRtcDebug({serverPeerId: VOICE_RTC_SERVER_PEER_ID, state: "offer"})
		const connection = new RTCPeerConnection({iceServers: RTC_ICE_SERVERS})
		this.#connection = connection
		connection.addEventListener("connectionstatechange", () => {
			updateVoiceRtcDebug({state: `rtc ${connection.connectionState}`})
			if (connection.connectionState === "failed" || connection.connectionState === "closed") this.#startFallback(`rtc ${connection.connectionState}`)
		})
		connection.addEventListener("datachannel", (event) => this.#attachChannel(event.channel))
		this.#attachChannel(connection.createDataChannel("voice-asr", {ordered: true}))

		try {
			const offer = await connection.createOffer()
			await connection.setLocalDescription(offer)
			await waitForIceGatheringComplete(connection, VOICE_RTC_ICE_GATHER_TIMEOUT_MS)
			const response = await fetch(voiceRtcOfferUrl(), {
				method: "POST",
				credentials: "include",
				headers: {"content-type": "text/plain"},
				body: JSON.stringify({
					peerId: this.#peerId,
					asrUrl: this.url,
					description: connection.localDescription,
				}),
			})
			if (!response.ok) throw new Error(`voice WebRTC offer failed: ${response.status}`)
			const answer = asJsonRecord(await response.json())
			const description = asSessionDescription(answer?.["description"])
			if (description === null) throw new Error("voice WebRTC answer missing description")
			await connection.setRemoteDescription(description)
		} catch (error) {
			this.#startFallback(error instanceof Error ? error.message : String(error))
		}
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
			this.#flushPendingRtc(channel)
			this.dispatchEvent(new Event("open"))
		})
		channel.addEventListener("message", (event) => {
			if (typeof event.data === "string" && this.#handleVoiceStatus(event.data)) return
			if (typeof event.data === "string") {
				this.#recordAsrMessage(event.data)
				if (asrMessageHasSpeechText(event.data)) {
					this.#clearAsrTextTimer()
					this.#clearPendingFallback()
				}
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
		if (isVoiceRtcRemoteClient() && isLoopbackUrl(this.url)) {
			this.#failRemoteLoopbackFallback(reason)
			return
		}
		this.#sendRtcBye(reason)
		updateVoiceRtcDebug({state: "fallback", fallbackReason: reason})
		this.#clearConnectTimer()
		this.#clearMediaTimer()
		this.#clearAsrTextTimer()
		this.#channel?.close()
		this.#channel = null
		this.#connection?.close()
		this.#connection = null
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
		ws.addEventListener("message", (event) => {
			if (typeof event.data === "string") this.#recordAsrMessage(event.data)
			this.dispatchEvent(new MessageEvent("message", {data: event.data}))
		})
		ws.addEventListener("error", () => this.dispatchEvent(new Event("error")))
		ws.addEventListener("close", () => {
			this.#readyState = WebSocket.CLOSED
			this.#context.onTransport("idle")
			this.dispatchEvent(new CloseEvent("close"))
		})
	}

	#failRemoteLoopbackFallback(reason: string): void {
		const detail = `${reason}; remote client cannot use loopback voice endpoint ${this.url}`
		this.#sendRtcBye(reason)
		updateVoiceRtcDebug({state: "error", fallbackReason: detail})
		this.#clearConnectTimer()
		this.#clearMediaTimer()
		this.#clearAsrTextTimer()
		this.#channel?.close()
		this.#channel = null
		this.#connection?.close()
		this.#connection = null
		this.#readyState = WebSocket.CLOSED
		this.#context.onTransport("idle")
		this.dispatchEvent(new Event("error"))
		this.dispatchEvent(new CloseEvent("close"))
	}

	#clearConnectTimer(): void {
		if (this.#connectTimer === null) return
		window.clearTimeout(this.#connectTimer)
		this.#connectTimer = null
	}

	#ensureMediaTimer(): void {
		if (this.#mediaTimer !== null) return
		this.#mediaTimer = window.setTimeout(() => this.#startFallback("voice media timeout"), VOICE_RTC_MEDIA_TIMEOUT_MS)
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

	#handleVoiceStatus(raw: string): boolean {
		const message = asJsonRecord(safeJsonParse(raw))
		if (message?.["type"] !== "voice-status") return false
		const state = stringValue(message["state"]) ?? "voice-status"
		const sampleRate = numberValue(message["sampleRate"])
		const bytes = numberValue(message["bytes"])
		const rms = numberValue(message["rms"])
		updateVoiceRtcDebug({
			state,
			...(sampleRate === undefined ? {} : {sampleRate}),
			...(bytes === undefined ? {} : {serverAudioBytes: bytes}),
			...(rms === undefined ? {} : {serverAudioRms: rms}),
		})
		if (message["state"] === "audio") {
			this.#clearMediaTimer()
			this.#context.onTransport("p2p")
		}
		return true
	}

	#trackControlForFallback(data: string): void {
		const payload = asJsonRecord(safeJsonParse(data))
		const payloadType = payload?.["type"]
		if (payloadType === "start") {
			this.#lastStartPayload = data
			return
		}
		if (payloadType === "commit") this.#startAsrTextTimer("ASR text timeout after commit")
		this.#pendingFallbackControls.push(data)
	}

	#sendRtcControl(channel: RTCDataChannel, data: string): void {
		channel.send(JSON.stringify({
			type: "asr-control",
			url: this.url,
			payload: safeJsonParse(data),
		}))
	}

	#flushPendingRtc(channel: RTCDataChannel): void {
		if (this.#lastStartPayload !== null) this.#sendRtcControl(channel, this.#lastStartPayload)
		for (const payload of this.#pendingFallbackControls) this.#sendRtcControl(channel, payload)
		for (const pcm of this.#pendingFallbackPcm) {
			channel.send(pcm)
			this.#ensureMediaTimer()
		}
	}

	#sendRtcBye(reason: string): void {
		const channel = this.#channel
		if (channel?.readyState !== "open") return
		try {
			channel.send(JSON.stringify({type: "bye", reason}))
		} catch {
			// The channel is already closing.
		}
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
		updateVoiceRtcDebug({fallbackReason: "voice text received"})
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

	#recordAsrMessage(raw: string): void {
		const type = asrMessageType(raw)
		const text = asrMessageText(raw)
		this.#asrMessages += 1
		if (voiceTextHasSpeechContent(text)) this.#asrTextMessages += 1
		updateVoiceRtcDebug({
			state: `asr ${type || "message"}`,
			asrMessages: this.#asrMessages,
			asrTextMessages: this.#asrTextMessages,
			lastAsrType: type,
			lastAsrText: text,
		})
	}
}

type NavigatorWithUserAgentData = Navigator & {
	userAgentData?: {
		platform?: string
	}
}

function isLikelyAndroidBrowser(): boolean {
	if (typeof navigator === "undefined") return false
	const nav = navigator as NavigatorWithUserAgentData
	return /android/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)
}

function isLoopbackUrl(rawUrl: string): boolean {
	try {
		const url = new URL(rawUrl, location.href)
		return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]"
	} catch {
		return false
	}
}

function voiceRtcOfferUrl(): string {
	const signalUrl = new URL(readSignalUrl(), location.href)
	signalUrl.protocol = signalUrl.protocol === "wss:" ? "https:" : "http:"
	signalUrl.pathname = VOICE_RTC_OFFER_PATH
	signalUrl.search = ""
	signalUrl.hash = ""
	return signalUrl.toString()
}

function waitForIceGatheringComplete(connection: RTCPeerConnection, timeoutMs: number): Promise<void> {
	if (connection.iceGatheringState === "complete") return Promise.resolve()
	return new Promise((resolve) => {
		let done = false
		const finish = (): void => {
			if (done) return
			done = true
			window.clearTimeout(timer)
			connection.removeEventListener("icegatheringstatechange", onChange)
			resolve()
		}
		const onChange = (): void => {
			if (connection.iceGatheringState === "complete") finish()
		}
		const timer = window.setTimeout(finish, timeoutMs)
		connection.addEventListener("icegatheringstatechange", onChange)
	})
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

function asSessionDescription(value: unknown): RTCSessionDescriptionInit | null {
	const record = asJsonRecord(value)
	if (record === null || record.type !== "answer" || typeof record.sdp !== "string") return null
	return {type: record.type, sdp: record.sdp}
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
	scheduleVoiceRtcDebugPost()
}

function scheduleVoiceRtcDebugPost(): void {
	if (voiceRtcDebugPostTimer !== null || typeof fetch === "undefined") return
	const delay = Math.max(0, VOICE_RTC_DEBUG_POST_MIN_MS - (Date.now() - voiceRtcDebugLastPostedAt))
	voiceRtcDebugPostTimer = window.setTimeout(() => {
		voiceRtcDebugPostTimer = null
		voiceRtcDebugLastPostedAt = Date.now()
		void fetch("/hud/voice/rtc-debug", {
			method: "POST",
			headers: {"content-type": "application/json"},
			body: JSON.stringify(voiceRtcDebug),
			keepalive: true,
		}).catch(() => {})
	}, delay)
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

function asrMessageHasSpeechText(raw: string): boolean {
	const message = asJsonRecord(safeJsonParse(raw))
	if (message === null) return false
	const type = message["type"]
	if (type !== "partial" && type !== "result" && type !== "final") return false
	return voiceTextHasSpeechContent(asrMessageText(raw))
}

function voiceTextHasSpeechContent(text: string): boolean {
	return /[\p{L}\p{N}]/u.test(text.replace(/[\u2500-\u257F]+/g, " ").replace(/[-_=]{6,}/g, " "))
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
