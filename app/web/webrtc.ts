type WebRtcSignal =
	| {type: "hello"; room: string; peerId: string; peers: string[]}
	| {type: "peer-joined"; peerId: string}
	| {type: "peer-left"; peerId: string}
	| {type: "offer"; from: string; to?: string; description: RTCSessionDescriptionInit}
	| {type: "answer"; from: string; to?: string; description: RTCSessionDescriptionInit}
	| {type: "ice"; from: string; to?: string; candidate: RTCIceCandidateInit}

type PeerRecord = {
	channel: RTCDataChannel | null
	connection: RTCPeerConnection
	id: string
}

export type AppWebRtcMesh = {
	readonly peerId: string
	peers(): Array<{id: string; connectionState: RTCPeerConnectionState; channelState: RTCDataChannelState | "none"}>
	sendAll(message: unknown): void
}

declare global {
	interface Window {
		metaforWebRtc?: AppWebRtcMesh
	}
}

const APP_WEB_RTC_PEER_KEY = "metafor.appWeb.webrtc.peerId:v1"
const APP_WEB_RTC_ROOM = "app-web"

export function installAppWebRtcMesh(room = APP_WEB_RTC_ROOM): AppWebRtcMesh | null {
	if (typeof RTCPeerConnection === "undefined" || typeof WebSocket === "undefined") return null

	let peerId = readPeerId()
	const peers = new Map<string, PeerRecord>()
	const signalSocket = new WebSocket(signalingUrl(room, peerId))

	const api: AppWebRtcMesh = {
		get peerId() {
			return peerId
		},
		peers: () => [...peers.values()].map((peer) => ({
			id: peer.id,
			connectionState: peer.connection.connectionState,
			channelState: peer.channel?.readyState ?? "none",
		})),
		sendAll(message: unknown) {
			const payload = typeof message === "string" ? message : JSON.stringify(message)
			for (const peer of peers.values()) {
				if (peer.channel?.readyState === "open") peer.channel.send(payload)
			}
		},
	}
	window.metaforWebRtc = api

	signalSocket.addEventListener("message", (event) => {
		if (typeof event.data !== "string") return
		const signal = parseSignal(event.data)
		if (signal === null) return
		void handleSignal(signal)
	})
	signalSocket.addEventListener("close", () => {
		for (const peer of peers.values()) peer.connection.close()
		peers.clear()
	})

	async function handleSignal(signal: WebRtcSignal): Promise<void> {
		if (signal.type === "hello") {
			peerId = signal.peerId
			writePeerId(peerId)
			for (const remotePeerId of signal.peers) void createPeer(remotePeerId, true)
			return
		}
		if (signal.type === "peer-joined") {
			if (signal.peerId !== peerId) void createPeer(signal.peerId, false)
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
		const peer: PeerRecord = {id: remotePeerId, connection, channel: null}
		peers.set(remotePeerId, peer)

		connection.addEventListener("icecandidate", (event) => {
			if (event.candidate === null) return
			sendSignal({type: "ice", to: remotePeerId, candidate: event.candidate.toJSON()})
		})
		connection.addEventListener("connectionstatechange", () => {
			if (connection.connectionState === "failed" || connection.connectionState === "closed") closePeer(remotePeerId)
		})
		connection.addEventListener("datachannel", (event) => attachDataChannel(peer, event.channel))

		if (initiator) {
			attachDataChannel(peer, connection.createDataChannel("metafor", {ordered: true}))
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
			channel.send(JSON.stringify({type: "hello", peerId, href: location.href}))
		})
		channel.addEventListener("message", (event) => {
			console.debug("[app-web/webrtc]", peer.id, event.data)
		})
		channel.addEventListener("close", () => {
			if (peer.channel === channel) peer.channel = null
		})
	}

	function closePeer(remotePeerId: string): void {
		const peer = peers.get(remotePeerId)
		if (peer === undefined) return
		peers.delete(remotePeerId)
		peer.channel?.close()
		peer.connection.close()
	}

	function sendSignal(payload: Record<string, unknown>): void {
		if (signalSocket.readyState !== WebSocket.OPEN) return
		signalSocket.send(JSON.stringify(payload))
	}

	return api
}

function signalingUrl(room: string, peerId: string): string {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:"
	const url = new URL(`${protocol}//${location.host}/hud/webrtc/signaling`)
	url.searchParams.set("room", room)
	url.searchParams.set("peer", peerId)
	return url.toString()
}

function parseSignal(raw: string): WebRtcSignal | null {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
		const type = (parsed as {type?: unknown}).type
		if (typeof type !== "string") return null
		return parsed as WebRtcSignal
	} catch {
		return null
	}
}

function readPeerId(): string {
	try {
		const existing = sessionStorage.getItem(APP_WEB_RTC_PEER_KEY)
		if (existing !== null && /^[A-Za-z0-9_.:-]{1,96}$/.test(existing)) return existing
	} catch {
		// Storage can be disabled.
	}
	const next = crypto.randomUUID()
	writePeerId(next)
	return next
}

function writePeerId(peerId: string): void {
	try {
		sessionStorage.setItem(APP_WEB_RTC_PEER_KEY, peerId)
	} catch {
		// Storage can be disabled.
	}
}
