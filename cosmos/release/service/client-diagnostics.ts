import {createClientLogRecorder} from "../shared/client-logs"
import type {ClientServiceOwner} from "@metafor/types/cosmos/client"
import {SERVICE_DIAGNOSTICS_SCHEMA, clientId, clientRecord} from "../shared/clients"

/** Worker захватывает только console; первоначальные startup listeners направляют ошибки в тот же console.error. Поздние error listeners release не устанавливает. MessagePort не отражает журналы обратно в console. */
export function createServiceDiagnostics(input: {version: string | null; scriptURL: string; scope: string; console: Console;
  client(id: string): Promise<{type: string; url: string} | undefined>}) {
  const safeURL = (value: string) => {const url = new URL(value); url.username = ""; url.password = ""; for (const key of [...url.searchParams.keys()]) if (key !== "env" && key !== "version") url.searchParams.delete(key); url.hash = ""; return url.href}
  const owner: ClientServiceOwner = {kind: "ServiceWorker", producerId: crypto.randomUUID(), releaseVersion: input.version, scriptURL: safeURL(input.scriptURL), scope: safeURL(input.scope)}
  let logs: ReturnType<typeof createClientLogRecorder> | null = null
  let stopped = false
  return {
    start() {if (stopped) throw new Error("Service diagnostics disposed"); logs ??= createClientLogRecorder({console: input.console, from: "release-service", owner, eventPrefix: "service"})},
    async message(event: Pick<ExtendableMessageEvent, "data" | "ports" | "source">): Promise<boolean> {
      const data: unknown = event.data
      if (!clientRecord(data, ["schema", "type", "requestId", "afterSequence", "limit"], ["producerId"]) || data.schema !== SERVICE_DIAGNOSTICS_SCHEMA || data.type !== "logs" || !clientId(data.requestId) ||
          typeof data.afterSequence !== "number" || !Number.isSafeInteger(data.afterSequence) || data.afterSequence < 0 || typeof data.limit !== "number" || !Number.isSafeInteger(data.limit) || data.limit < 1 || data.limit > 128 ||
          data.producerId !== undefined && !clientId(data.producerId)) return false
      const port = event.ports[0], source = event.source
      if (!logs || stopped || !port || !source || !("id" in source) || typeof source.id !== "string") return true
      const client = await input.client(source.id)
      if (!client || client.type !== "window" || new URL(client.url).origin !== new URL(input.scope).origin) return true
      try {
        port.postMessage(data.producerId !== undefined && data.producerId !== owner.producerId
          ? {schema: SERVICE_DIAGNOSTICS_SCHEMA, requestId: data.requestId, ok: false, error: "ServiceWorker incarnation changed"}
          : {schema: SERVICE_DIAGNOSTICS_SCHEMA, requestId: data.requestId, ok: true, value: logs.read(data.afterSequence, data.limit)})
      } finally {port.close()}
      return true
    },
    destroy() {stopped = true; logs?.dispose(); logs = null},
  }
}
