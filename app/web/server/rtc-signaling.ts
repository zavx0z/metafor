import type {Server, ServerWebSocket} from "bun"
import {randomUUID} from "node:crypto"
import type {AppWebSocketData, RtcSignalingMessage, RtcSignalingServerDeps} from "../server.t.ts"

export function createRtcSignalingServer(deps: RtcSignalingServerDeps) {
	const rtcRooms = new Map<string, Map<string, ServerWebSocket<AppWebSocketData>>>()

	function route(req: Request, wsServer: Server<AppWebSocketData>): Response | undefined {
		const url = new URL(req.url)
		const room = sanitizeRtcId(url.searchParams.get("room") ?? "app-web")
		const peerId = sanitizeRtcId(url.searchParams.get("peer") ?? randomUUID())
		if (room === null || peerId === null) {
			deps.logHttp(req, "rtc.signal.invalid", 400, Date.now(), "invalid room or peer id")
			return deps.jsonResponse({ok: false, error: "invalid WebRTC room or peer id"}, 400)
		}
		const ok = wsServer.upgrade(req, {
			data: {
				kind: "rtc-signal",
				room,
				peerId,
				connectedAt: Date.now(),
			},
		})
		deps.logWsUpgrade(req, "rtc-signal", ok, `room=${room} peer=${peerId}`)
		return ok ? undefined : new Response("WebRTC signaling upgrade failed", {status: 426})
	}

	function attach(ws: ServerWebSocket<AppWebSocketData>): void {
		if (ws.data.kind !== "rtc-signal") return
		const peers = rtcRoomPeers(ws.data.room)
		const requestedPeerId = ws.data.peerId
		let peerId = requestedPeerId
		while (peers.has(peerId)) peerId = `${requestedPeerId}-${randomUUID().slice(0, 8)}`
		ws.data.peerId = peerId
		const existingPeers = [...peers.keys()]
		peers.set(peerId, ws)
		deps.appLog("RTC", "peer joined", `room=${ws.data.room} peer=${peerId} peers=${peers.size}`, "green")
		sendRtcJson(ws, {
			type: "hello",
			room: ws.data.room,
			peerId,
			peers: existingPeers,
		})
		broadcast(ws.data.room, peerId, {
			type: "peer-joined",
			peerId,
		})
	}

	function detach(ws: ServerWebSocket<AppWebSocketData>): void {
		if (ws.data.kind !== "rtc-signal") return
		const {room, peerId} = ws.data
		const peers = rtcRooms.get(room)
		if (peers === undefined) return
		if (peers.get(peerId) === ws) peers.delete(peerId)
		if (peers.size === 0) {
			rtcRooms.delete(room)
			deps.appLog("RTC", "room closed", `room=${room} peer=${peerId}`, "gray")
			return
		}
		deps.appLog("RTC", "peer left", `room=${room} peer=${peerId} peers=${peers.size}`, "gray")
		broadcast(room, peerId, {
			type: "peer-left",
			peerId,
		})
	}

	function message(ws: ServerWebSocket<AppWebSocketData>, message: RtcSignalingMessage): void {
		if (ws.data.kind !== "rtc-signal" || typeof message !== "string" || message.length > 256 * 1024) return
		let payload: Record<string, unknown>
		try {
			const parsed = JSON.parse(message) as unknown
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return
			payload = parsed as Record<string, unknown>
		} catch {
			return
		}
		const to = typeof payload.to === "string" ? sanitizeRtcId(payload.to) : null
		const envelope = {
			...payload,
			from: ws.data.peerId,
			room: ws.data.room,
		}
		if (to !== null) {
			const target = rtcRooms.get(ws.data.room)?.get(to)
			if (target !== undefined && target.readyState === WebSocket.OPEN) {
				deps.appLog("RTC", "signal direct", `room=${ws.data.room} from=${ws.data.peerId} to=${to} type=${String(payload.type ?? "-")}`, "cyan")
				sendRtcJson(target, envelope)
			} else {
				deps.appLog("WARN", "signal target missing", `room=${ws.data.room} from=${ws.data.peerId} to=${to}`, "yellow")
			}
			return
		}
		deps.appLog("RTC", "signal broadcast", `room=${ws.data.room} from=${ws.data.peerId} type=${String(payload.type ?? "-")}`, "cyan")
		broadcast(ws.data.room, ws.data.peerId, envelope)
	}

	function rtcRoomPeers(room: string): Map<string, ServerWebSocket<AppWebSocketData>> {
		const existing = rtcRooms.get(room)
		if (existing !== undefined) return existing
		const next = new Map<string, ServerWebSocket<AppWebSocketData>>()
		rtcRooms.set(room, next)
		return next
	}

	function broadcast(room: string, fromPeerId: string, payload: Record<string, unknown>): void {
		const peers = rtcRooms.get(room)
		if (peers === undefined) return
		for (const [peerId, socket] of peers) {
			if (peerId === fromPeerId || socket.readyState !== WebSocket.OPEN) continue
			sendRtcJson(socket, payload)
		}
	}

	return {route, attach, detach, message}
}

function sendRtcJson(ws: ServerWebSocket<AppWebSocketData>, payload: Record<string, unknown>): void {
	ws.send(JSON.stringify(payload))
}

function sanitizeRtcId(value: string): string | null {
	const normalized = value.trim()
	if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(normalized)) return null
	return normalized
}
