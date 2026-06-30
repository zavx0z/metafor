import type {Buffer} from "node:buffer"
import type {BoundaryUpdateMessage} from "boundary"
import {readEnergyEnv} from "energy"
import type {EnergyMass, EnergyProcessResult} from "energy"
import type {EnergyBridgeIncomingMessage} from "./server.t.ts"

type EnergyBridgeAuthResult =
	| {ok: true}
	| {ok: false; reason: "token" | "loopback"}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const isPositiveId = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value > 0

export function readEnergyBridgeMessage(raw: string | Buffer): EnergyBridgeIncomingMessage | null {
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
		const env = readEnergyEnv(value.env)
		return value.runtime === "energy" && env !== null && typeof value.pid === "number" && typeof value.startedAt === "string"
			? {type: "hello", runtime: "energy", env, pid: value.pid, startedAt: value.startedAt}
			: null
	}
	if (value.type === "claim") {
		const env = readEnergyEnv(value.env)
		const mass = readEnergyMass(value.mass)
		if (!isPositiveId(value.actorId) || !isPositiveId(value.processId) || typeof value.token !== "string" || env === null) return null
		if (value.mass !== undefined && mass === null) return null
		return {
			type: "claim",
			actorId: value.actorId,
			processId: value.processId,
			token: value.token,
			env,
			...(mass !== undefined && mass !== null ? {mass} : {}),
		}
	}
	if (value.type === "process-result") {
		const result = readEnergyProcessResult(value.result)
		return result !== null ? {type: "process-result", result} : null
	}

	return null
}

export function energyBridgeAuth(input: {
	url: URL
	requestHost: string | null
	serverHost: string | null
	token: string | null
	headerToken: string | null
}): EnergyBridgeAuthResult {
	if (input.token !== null) {
		const queryToken = input.url.searchParams.get("token")
		if (queryToken === input.token || input.headerToken === input.token) return {ok: true}
		return {ok: false, reason: "token"}
	}
	const host = input.requestHost ?? input.url.hostname
	if (isLoopbackHost(host) || isSameConfiguredHost(host, input.serverHost)) return {ok: true}
	return {ok: false, reason: "loopback"}
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

function readEnergyProcessResult(value: unknown): EnergyProcessResult | null {
	if (!isRecord(value) || typeof value.ok !== "boolean" || !isPositiveId(value.actorId) || !isPositiveId(value.processId)) return null
	if (value.ok) {
		return isRecord(value.fields)
			? {
				ok: true,
				actorId: value.actorId,
				processId: value.processId,
				...(typeof value.token === "string" ? {token: value.token} : {}),
				fields: value.fields,
			}
			: null
	}
	if (typeof value.error !== "string") return null
	return {
		ok: false,
		actorId: value.actorId,
		processId: value.processId,
		...(typeof value.token === "string" ? {token: value.token} : {}),
		error: value.error,
		...(isRecord(value.fields) ? {fields: value.fields} : {}),
	}
}

function readEnergyMass(value: unknown): EnergyMass | null | undefined {
	if (value === undefined) return undefined
	if (!isRecord(value)) return null
	const labels = Array.isArray(value.labels) && value.labels.every((item) => typeof item === "string") ? value.labels : undefined
	if (value.labels !== undefined && labels === undefined) return null
	const transport = typeof value.transport === "string" ? value.transport : undefined
	if (transport !== undefined && transport !== "websocket" && transport !== "local" && transport !== "worker" && transport !== "service-worker") return null
	return {
		...(isPositiveId(value.actorId) ? {actorId: value.actorId} : {}),
		...(isPositiveId(value.deviceActorId) ? {deviceActorId: value.deviceActorId} : {}),
		...(typeof value.connectionId === "string" ? {connectionId: value.connectionId} : {}),
		...(transport !== undefined ? {transport} : {}),
		...(labels !== undefined ? {labels} : {}),
	}
}

function isSameConfiguredHost(host: string, serverHost: string | null): boolean {
	if (serverHost === null || serverHost.length === 0 || serverHost === "0.0.0.0" || serverHost === "::") return false
	return host.toLowerCase() === serverHost.toLowerCase()
}
