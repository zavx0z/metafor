import type {ServerWebSocket} from "bun"
import type {
	AppLogTone,
	AppWebSocketData,
	ChromeEvalPayload,
	ChromeEvalTarget,
	ChromeWindowsPayload,
	ClientVoiceLeasePayload,
	InterpreterVoiceSettingsPayload,
	VoiceLocalStorageKey,
	VoiceRtcDebugPayload,
	VoiceServerDeps,
} from "../server.t.ts"

const VOICE_LEASE_TTL_MS = 12_000

const VOICE_LOCAL_STORAGE_KEYS = [
	"metafor.interpreter.voice.url",
	"metafor.interpreter.voice.wakeUrl",
	"metafor.interpreter.voice.context",
	"metafor.interpreter.voice.wakePhrases:v1",
	"metafor.interpreter.voice.activationPhrases:v1",
	"metafor.interpreter.voice.deactivationPhrases:v1",
	"metafor.interpreter.voice.stopPhrases:v1",
	"metafor.interpreter.voice.activationFuzzy:v1",
	"metafor.interpreter.voice.deactivationFuzzy:v1",
	"metafor.interpreter.voice.stopFuzzy:v1",
	"metafor.interpreter.voice.deactivationMode:v1",
	"metafor.interpreter.voice.recognitionTimeoutSeconds:v1",
	"metafor.interpreter.voice.autoSend:v1",
	"metafor.interpreter.voice.autoWakePaused:v1",
	"metafor.interpreter.voice.signalVolume:v1",
	"metafor.interpreter.voice.signalVolume:v2",
	"metafor.interpreter.hostTerminal.agentSoundEnabled:v1",
	"metafor.interpreter.hostTerminal.agentSoundVolume:v1",
	"metafor.interpreter.voice.agentReadyVolume:v1",
] as const satisfies readonly VoiceLocalStorageKey[]

export function createVoiceServer(deps: VoiceServerDeps) {
	let voiceLeaseOwnerId: string | null = null
	let voiceLeaseExpiresAt = 0

	async function readInterpreterVoiceSettingsResponse(): Promise<Response> {
		if (deps.chromeApiUrl === null) return browserApiDisabledResponse()
		try {
			const payload = await readInterpreterVoiceSettings()
			return deps.jsonResponse({ok: true, ...payload})
		} catch (error) {
			deps.appLog("ERR", "voice settings read", deps.errorMessage(error), "red")
			return deps.jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 502)
		}
	}

	async function writeInterpreterVoiceSettingsResponse(req: Request): Promise<Response> {
		if (deps.chromeApiUrl === null) return browserApiDisabledResponse()
		const parsed = await deps.readJsonObject(req)
		if (parsed.error !== undefined) return deps.jsonResponse({ok: false, error: parsed.error}, 400)
		const values = asVoiceSettingsUpdate(parsed.body["values"])
		if (values === null) return deps.jsonResponse({ok: false, error: "values must be an object of voice setting keys"}, 400)
		try {
			const payload = await writeInterpreterVoiceSettings(values)
			return deps.jsonResponse({ok: true, ...payload})
		} catch (error) {
			deps.appLog("ERR", "voice settings write", deps.errorMessage(error), "red")
			return deps.jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 502)
		}
	}

	async function writeVoiceRtcDebugResponse(req: Request): Promise<Response> {
		const parsed = await deps.readJsonObject(req)
		if (parsed.error !== undefined) return deps.jsonResponse({ok: false, error: parsed.error}, 400)
		const payload = asVoiceRtcDebugPayload(parsed.body)
		if (payload === null) return deps.jsonResponse({ok: false, error: "invalid voice rtc debug payload"}, 400)
		deps.appLog("VOICE", "rtc", formatVoiceRtcDebug(payload), voiceRtcDebugLogTone(payload))
		return deps.jsonResponse({ok: true})
	}

	function browserApiDisabledResponse(): Response {
		return deps.jsonResponse({ok: false, disabled: true, error: "browser API is not configured on this server"})
	}

	function handleVoiceLeaseMessage(ws: ServerWebSocket<AppWebSocketData>, payload: ClientVoiceLeasePayload): void {
		if (ws.data.kind !== "app-web") return
		const clientId = sanitizeVoiceClientId(payload.clientId)
		if (clientId === null) return
		ws.data.voiceClientId = clientId
		if (payload.action === "release") {
			releaseVoiceLease(clientId, payload.reason ?? "release")
			return
		}
		const now = Date.now()
		if (voiceLeaseOwnerId !== null && voiceLeaseExpiresAt <= now) {
			voiceLeaseOwnerId = null
			voiceLeaseExpiresAt = 0
		}
		if (voiceLeaseOwnerId === null || voiceLeaseOwnerId === clientId || voiceLeaseTakeoverAllowed(payload.reason)) {
			const previousOwnerId = voiceLeaseOwnerId
			const ownerChanged = previousOwnerId !== clientId
			voiceLeaseOwnerId = clientId
			voiceLeaseExpiresAt = now + VOICE_LEASE_TTL_MS
			if (ownerChanged || payload.reason !== "heartbeat") {
				const takeover = previousOwnerId !== null && previousOwnerId !== clientId ? ` prev=${deps.shortId(previousOwnerId)}` : ""
				deps.appLog("VOICE", "lease", `owner=${deps.shortId(clientId)}${takeover} reason=${payload.reason ?? payload.action}`, "cyan")
			}
			broadcastVoiceLease(payload.reason ?? payload.action)
			return
		}
		sendVoiceLeaseSnapshot(ws, payload.reason ?? "busy")
	}

	function releaseVoiceLease(clientId: string, reason: string): void {
		if (voiceLeaseOwnerId !== clientId) return
		voiceLeaseOwnerId = null
		voiceLeaseExpiresAt = 0
		deps.appLog("VOICE", "lease", `owner=- released=${deps.shortId(clientId)} reason=${reason}`, "gray")
		broadcastVoiceLease(reason)
	}

	function sendVoiceLeaseSnapshot(ws: ServerWebSocket<AppWebSocketData>, reason: string): void {
		if (ws.data.kind !== "app-web" || ws.readyState !== WebSocket.OPEN) return
		ws.send(voiceLeaseMessage(reason))
	}

	function broadcastVoiceLease(reason: string): void {
		const message = voiceLeaseMessage(reason)
		for (const socket of deps.sockets) {
			if (socket.data.kind === "app-web" && socket.readyState === WebSocket.OPEN) socket.send(message)
		}
	}

	function voiceLeaseMessage(reason: string): string {
		if (voiceLeaseOwnerId !== null && voiceLeaseExpiresAt <= Date.now()) {
			voiceLeaseOwnerId = null
			voiceLeaseExpiresAt = 0
		}
		return JSON.stringify({
			type: "hud-voice-lease",
			ownerId: voiceLeaseOwnerId,
			expiresAt: voiceLeaseOwnerId === null ? 0 : voiceLeaseExpiresAt,
			ttlMs: voiceLeaseOwnerId === null ? 0 : Math.max(0, voiceLeaseExpiresAt - Date.now()),
			reason,
		})
	}

	async function readInterpreterVoiceSettings(): Promise<InterpreterVoiceSettingsPayload> {
		const target = await findInterpreterTab()
		const keysJson = JSON.stringify(VOICE_LOCAL_STORAGE_KEYS)
		const js = [
			`const keys = ${keysJson};`,
			"const values = {};",
			"for (const key of keys) {",
			"  const value = localStorage.getItem(key);",
			"  if (value !== null) values[key] = value;",
			"}",
			"return JSON.stringify({origin: location.origin, values});",
		].join("\n")
		return await evalInterpreterVoiceSettings(target, js)
	}

	async function writeInterpreterVoiceSettings(values: Record<string, string | null>): Promise<InterpreterVoiceSettingsPayload> {
		const target = await findInterpreterTab()
		const valuesJson = JSON.stringify(values)
		const js = [
			`const values = ${valuesJson};`,
			"for (const [key, value] of Object.entries(values)) {",
			"  if (value === null) localStorage.removeItem(key);",
			"  else localStorage.setItem(key, String(value));",
			"}",
			"return JSON.stringify({origin: location.origin, values});",
		].join("\n")
		return await evalInterpreterVoiceSettings(target, js)
	}

	async function findInterpreterTab(): Promise<ChromeEvalTarget> {
		const chromeApiUrl = deps.chromeApiUrl
		if (chromeApiUrl === null) throw new Error("browser API is not configured on this server")
		const started = Date.now()
		const response = await fetch(`${chromeApiUrl}/windows`, {signal: AbortSignal.timeout(1500)})
		if (!response.ok) throw new Error(`chrome windows ${response.status}`)
		const payload = await response.json() as ChromeWindowsPayload
		for (const window of payload.windows ?? []) {
			if (window.kind !== "browser" || typeof window.id !== "number") continue
			for (const tab of window.tabs ?? []) {
				if (typeof tab.index !== "number" || !isInterpreterTab(tab.url)) continue
				deps.appLog("EXT", "chrome interpreter tab", `window=${window.id} tab=${tab.index} in ${Date.now() - started}ms`, "cyan")
				return {windowId: window.id, tabIndex: tab.index}
			}
		}
		deps.appLog("WARN", "chrome interpreter tab", `not found in ${Date.now() - started}ms`, "yellow")
		throw new Error("interpreter tab not found")
	}

	function isInterpreterTab(rawUrl: string | undefined): boolean {
		if (rawUrl === undefined) return false
		try {
			const url = new URL(rawUrl)
			return isAppWebUrl(url)
		} catch {
			return false
		}
	}

	function isAppWebUrl(url: URL): boolean {
		const expectedProtocol = deps.tlsEnabled ? "https:" : "http:"
		if (url.protocol !== expectedProtocol) return false
		if (url.port.length === 0) return (deps.tlsEnabled && deps.port === 443) || (!deps.tlsEnabled && deps.port === 80)
		return url.port === String(deps.port)
	}

	async function evalInterpreterVoiceSettings(target: ChromeEvalTarget, js: string): Promise<InterpreterVoiceSettingsPayload> {
		const chromeApiUrl = deps.chromeApiUrl
		if (chromeApiUrl === null) throw new Error("browser API is not configured on this server")
		const started = Date.now()
		const response = await fetch(`${chromeApiUrl}/eval`, {
			method: "POST",
			headers: {"content-type": "application/json"},
			body: JSON.stringify({...target, js}),
			signal: AbortSignal.timeout(2000),
		})
		if (!response.ok) throw new Error(`chrome eval ${response.status}`)
		const payload = await response.json() as ChromeEvalPayload
		deps.appLog("EXT", "chrome eval", `window=${target.windowId} tab=${target.tabIndex} status=${response.status} in ${Date.now() - started}ms`, "cyan")
		const parsed = parseChromeEvalParsed(payload)
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {values: {}}
		const record = parsed as {origin?: unknown; values?: unknown}
		const origin = typeof record.origin === "string" ? record.origin : undefined
		const values = asVoiceSettingsValues(record.values) ?? {}
		return origin === undefined ? {values} : {origin, values}
	}

	function formatVoiceRtcDebug(payload: VoiceRtcDebugPayload): string {
		const localRms = Math.round(payload.localAudioRms * 1000) / 10
		const serverRms = Math.round(payload.serverAudioRms * 1000) / 10
		return [
			`state=${deps.compactLogValue(payload.state || "-")}`,
			`local=${deps.formatLogBytes(payload.localAudioBytes)} rms=${localRms}%`,
			`server=${deps.formatLogBytes(payload.serverAudioBytes)} rms=${serverRms}% rate=${payload.sampleRate || "-"}`,
			`asr=${payload.asrMessages}/${payload.asrTextMessages} type=${deps.compactLogValue(payload.lastAsrType || "-")}`,
			payload.lastAsrText ? `text="${deps.compactLogValue(payload.lastAsrText, 90)}"` : "text=-",
			payload.fallbackReason ? `fallback="${deps.compactLogValue(payload.fallbackReason, 90)}"` : "fallback=-",
		].join(" ")
	}

	return {
		readInterpreterVoiceSettingsResponse,
		writeInterpreterVoiceSettingsResponse,
		writeVoiceRtcDebugResponse,
		handleVoiceLeaseMessage,
		releaseVoiceLease,
		sendVoiceLeaseSnapshot,
	}
}

function voiceLeaseTakeoverAllowed(reason: string | undefined): boolean {
	return reason === "manual" || reason === "activation" || reason === "android-wake"
}

function parseChromeEvalParsed(payload: ChromeEvalPayload): unknown {
	if (payload.parsed !== undefined && payload.parsed !== null) return payload.parsed
	if (typeof payload.result !== "string" || payload.result.length === 0) return null
	try {
		return JSON.parse(payload.result)
	} catch {
		return null
	}
}

function asVoiceSettingsUpdate(value: unknown): Record<string, string | null> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	const next: Record<string, string | null> = {}
	for (const [key, item] of Object.entries(value)) {
		if (!isVoiceLocalStorageKey(key)) continue
		if (typeof item === "string") next[key] = item
		else if (item === null) next[key] = null
	}
	return Object.keys(next).length > 0 ? next : null
}

function asVoiceSettingsValues(value: unknown): Record<string, string> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	const next: Record<string, string> = {}
	for (const [key, item] of Object.entries(value)) {
		if (isVoiceLocalStorageKey(key) && typeof item === "string") next[key] = item
	}
	return next
}

function asVoiceRtcDebugPayload(value: Record<string, unknown>): VoiceRtcDebugPayload | null {
	return {
		state: stringFromUnknown(value["state"]),
		appPeerId: stringFromUnknown(value["appPeerId"]),
		serverPeerId: stringFromUnknown(value["serverPeerId"]),
		sampleRate: finiteNumber(value["sampleRate"]) ?? 0,
		localAudioBytes: finiteNumber(value["localAudioBytes"]) ?? 0,
		localAudioRms: finiteNumber(value["localAudioRms"]) ?? 0,
		serverAudioBytes: finiteNumber(value["serverAudioBytes"]) ?? 0,
		serverAudioRms: finiteNumber(value["serverAudioRms"]) ?? 0,
		asrMessages: finiteNumber(value["asrMessages"]) ?? 0,
		asrTextMessages: finiteNumber(value["asrTextMessages"]) ?? 0,
		lastAsrType: stringFromUnknown(value["lastAsrType"]),
		lastAsrText: stringFromUnknown(value["lastAsrText"]),
		fallbackReason: stringFromUnknown(value["fallbackReason"]),
		updatedAt: finiteNumber(value["updatedAt"]) ?? 0,
	}
}

function voiceRtcDebugLogTone(payload: VoiceRtcDebugPayload): AppLogTone {
	if (payload.state === "fallback" || payload.fallbackReason.startsWith("ASR text timeout") || payload.fallbackReason.startsWith("voice")) return "yellow"
	if (payload.asrTextMessages > 0) return "green"
	return "magenta"
}

function isVoiceLocalStorageKey(key: string): key is VoiceLocalStorageKey {
	return (VOICE_LOCAL_STORAGE_KEYS as readonly string[]).includes(key)
}

function sanitizeVoiceClientId(value: string): string | null {
	const normalized = value.trim()
	if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(normalized)) return null
	return normalized
}

function finiteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function stringFromUnknown(value: unknown): string {
	return typeof value === "string" ? value : ""
}
