type AppWebBootEvent = {
	phase: string
	at: number
	detail?: unknown
}

type AppWebBootState = {
	events: AppWebBootEvent[]
}

const appWebBootTarget = globalThis as typeof globalThis & {__appWebBoot?: AppWebBootState}

const markAppWebBoot = (phase: string, detail?: unknown): void => {
	const boot = appWebBootTarget.__appWebBoot ??= {events: []}
	boot.events.push({phase, at: Date.now(), detail})
}

const errorDetail = (error: unknown): string =>
	error instanceof Error ? error.stack ?? error.message : String(error)

markAppWebBoot("bootstrap:start", {readyState: document.readyState})

globalThis.addEventListener("error", (event: ErrorEvent) => {
	markAppWebBoot("window:error", {
		message: event.message,
		source: event.filename,
		line: event.lineno,
		column: event.colno,
	})
})

globalThis.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
	markAppWebBoot("window:unhandledrejection", errorDetail(event.reason))
})

markAppWebBoot("client:import:start")

import("./client.ts")
	.then(() => {
		markAppWebBoot("client:import:done")
	})
	.catch((error: unknown) => {
		const detail = errorDetail(error)
		markAppWebBoot("client:import:error", detail)
		console.error("[app-web] client import failed:", error)
	})
