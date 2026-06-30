import type {Buffer} from "node:buffer"
import type {BoundaryUpdateMessage, ProcessTask} from "boundary"
import type {MatrixBridgeIncomingMessage} from "./server.t.ts"

type MatrixBridgeAuthResult =
	| {ok: true}
	| {ok: false; reason: "token" | "loopback"}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const isPositiveId = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value > 0

export function readMatrixBridgeMessage(raw: string | Buffer): MatrixBridgeIncomingMessage | null {
	let value: unknown
	try {
		value = JSON.parse(String(raw))
	} catch {
		return null
	}
	if (!isRecord(value) || typeof value.type !== "string") return null

	if (value.type === "force") {
		return Array.isArray(value.parts)
			? {type: "force", parts: value.parts as BoundaryUpdateMessage["parts"]}
			: null
	}
	if (value.type === "hello") {
		return value.runtime === "matrix" && typeof value.pid === "number" && typeof value.startedAt === "string"
			? {type: "hello", runtime: "matrix", pid: value.pid, startedAt: value.startedAt}
			: null
	}
	if (value.type === "process-task") {
		const task = readProcessTask(value.task)
		return value.version === 1 && task !== null ? {type: "process-task", version: 1, task} : null
	}
	if (value.type === "snapshot-request") {
		return typeof value.reason === "string"
			? {type: "snapshot-request", reason: value.reason}
			: {type: "snapshot-request"}
	}
	return null
}

function readProcessTask(value: unknown): ProcessTask | null {
	if (!isRecord(value) || !isPositiveId(value.actorId) || !isPositiveId(value.processId)) return null
	if (typeof value.state !== "string" && typeof value.state !== "number") return null
	if (typeof value.token !== "string" || value.token.length === 0) return null
	if (value.fields !== undefined && !isRecord(value.fields)) return null
	if (value.env !== undefined && !isRecord(value.env)) return null
	return {
		actorId: value.actorId,
		state: value.state,
		processId: value.processId,
		token: value.token,
		...(isRecord(value.env) ? {env: value.env} : {}),
		...(isRecord(value.mass) ? {mass: value.mass} : {}),
		...(isRecord(value.fields) ? {fields: value.fields} : {}),
	}
}

export function isLoopbackHost(host: string): boolean {
	const normalized = host.toLowerCase()
	return normalized === "localhost"
		|| normalized === "::1"
		|| normalized === "[::1]"
		|| normalized === "0:0:0:0:0:0:0:1"
		|| normalized === "::ffff:127.0.0.1"
		|| normalized.startsWith("127.")
}

export function matrixBridgeAuth(input: {
	url: URL
	requestHost: string | null
	serverHost: string | null
	token: string | null
	headerToken: string | null
}): MatrixBridgeAuthResult {
	if (input.token !== null) {
		const queryToken = input.url.searchParams.get("token")
		if (queryToken === input.token || input.headerToken === input.token) return {ok: true}
		return {ok: false, reason: "token"}
	}
	const host = input.requestHost ?? input.url.hostname
	if (isLoopbackHost(host) || isSameConfiguredHost(host, input.serverHost)) return {ok: true}
	return {ok: false, reason: "loopback"}
}

function isSameConfiguredHost(host: string, serverHost: string | null): boolean {
	if (serverHost === null || serverHost.length === 0 || serverHost === "0.0.0.0" || serverHost === "::") return false
	return host.toLowerCase() === serverHost.toLowerCase()
}
