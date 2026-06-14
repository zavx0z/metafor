const MAX_LOG_ENTRIES = 160

let logEntries: string[] = []
let logContent: HTMLElement | null = null
let forceCounter: HTMLElement | null = null
let connectionBadge: HTMLElement | null = null

const timestamp = (): string => {
	const now = new Date()
	return `${now.toLocaleTimeString("ru-RU", { hour12: false })}.${String(now.getMilliseconds()).padStart(3, "0")}`
}

const renderLogs = (): void => {
	if (!logContent) return
	logContent.innerHTML = logEntries.join("")
	logContent.scrollTop = logContent.scrollHeight
}

const appendLog = (label: string, payload: unknown, tone: "neutral" | "error" = "neutral"): void => {
	const serialized =
		typeof payload === "string"
			? payload
			: (() => {
					try {
						return JSON.stringify(payload, null, 2)
					} catch {
						return String(payload)
					}
			  })()

	logEntries.push(`
		<div class="log-entry ${tone}">
			<div class="log-meta">${timestamp()} <span>${label}</span></div>
			<pre>${serialized}</pre>
		</div>
	`)

	if (logEntries.length > MAX_LOG_ENTRIES) {
		logEntries = logEntries.slice(-MAX_LOG_ENTRIES)
	}

	renderLogs()
}

const setBadgeState = (element: HTMLElement | null, value: string, tone: "online" | "offline"): void => {
	if (!element) return
	element.textContent = value
	element.dataset.tone = tone
}

export const initForceLogger = (): void => {
	logContent = document.getElementById("force-log-content")
	forceCounter = document.getElementById("force-counter")
	connectionBadge = document.getElementById("connection-badge")

	document.getElementById("clear-log-btn")?.addEventListener("click", () => {
		logEntries = []
		renderLogs()
	})
}

export const setConnectionStatus = (online: boolean): void => {
	setBadgeState(connectionBadge, online ? "socket online" : "socket offline", online ? "online" : "offline")
}

export const appendForceMessage = (channel: string, message: unknown): void => {
	appendLog(`force:${channel}`, message)

	if (forceCounter) {
		const current = Number(forceCounter.dataset.count ?? "0") + 1
		forceCounter.dataset.count = String(current)
		forceCounter.textContent = `${current} force messages`
	}
}
