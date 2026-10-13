import models from "@zavx0z/provider-model-ollama"
import sessions from "@zavx0z/provider-session-ollama"
import configuration from "@zavx0z/provider-configuration-ollama"
import type {SessionConfigOption} from "@agentclientprotocol/sdk"
import type {ProviderDriver} from "./runtime-types"

/** URL и native persistence назначает существующая private host authority; UI их не выдаёт. */
export type OllamaInstallation = Readonly<{url: string; directory: string; model?: string}>
export type OllamaSettings = Readonly<{model: string | null; reasoning: string | null; models: Array<{id: string; label: string}>; reasoningLevels: Array<{id: string; label: string}>}>
const option = (values: readonly SessionConfigOption[], category: string) => values.find((row): row is Extract<SessionConfigOption, {type: "select"}> => row.type === "select" && row.category === category)
const choices = (value: ReturnType<typeof option>) => value?.options.flatMap(row => "options" in row ? row.options : [row]) ?? []
const project = (values: readonly SessionConfigOption[]): OllamaSettings => {
  const model = option(values, "model"), thought = option(values, "thought_level")
  return {model: model?.currentValue ?? null, reasoning: thought?.currentValue ?? null,
    models: choices(model).map(row => ({id: row.value, label: row.name})), reasoningLevels: choices(thought).map(row => ({id: row.value, label: row.name}))}
}

/** Только public metadata adapter tags/show: ни native session, ни загрузки модели, ни генерации. */
export async function readOllamaOptions(installation: OllamaInstallation, model: string | undefined, signal: AbortSignal): Promise<OllamaSettings> {
  signal.throwIfAborted()
  const catalog = models({url: installation.url})
  const available = await catalog.list(signal)
  const selected = model ?? installation.model ?? available[0]?.id
  if (!selected || !available.some(row => row.id === selected)) throw new Error("Назначенный Ollama не предоставляет выбранную установленную модель")
  const info = await catalog.read(selected, signal)
  return project(configuration({models: available, model: info, contextSize: Math.min(32768, info.contextLimit ?? 32768)}))
}

/**
 * Adapter [Provider](./README.md) к готовым public Ollama sessions/models.
 * Native history восстанавливается по прежней identity; модель не исполняет tools.
 * Settings используют только объявленные configOptions, Prompt вызывается лишь
 * стандартным Provider turn. Проверки — [Ollama integration](./ollama-driver.spec.ts).
 */
export function createOllamaDriver(installation: OllamaInstallation): ProviderDriver {
  return {
    async check(signal) {await readOllamaOptions(installation, undefined, signal)},
    async open(input) {
      input.signal.throwIfAborted()
      const catalog = models({url: installation.url})
      let operationSignal = input.signal
      const scoped = (signal?: AbortSignal) => AbortSignal.any([input.signal, operationSignal, ...(signal ? [signal] : [])])
      const native = await sessions({...installation, models: {list: signal => catalog.list(scoped(signal)), read: (model, signal) => catalog.read(model, scoped(signal))}})
      let closed = false, busy = false
      const close = async () => {if (closed) return; closed = true; await native.dispose()}
      try {
        const sessionId = input.sessionId ?? await native.create(installation.directory)
        if (input.sessionId) await native.load(input.sessionId, installation.directory)
        input.signal.throwIfAborted()
        return {sessionId, close,
          async settings(selection, signal) {
            signal.throwIfAborted()
            if (closed || busy) throw new Error("Ollama session закрыта или занята")
            operationSignal = signal
            busy = true
            let changed = false
            try {
              let values = await native.options(sessionId)
              for (const [category, value] of [["model", selection.model], ["thought_level", selection.reasoning]] as const) {
                if (value === undefined) continue
                const selected = option(values, category)
                if (!selected || !choices(selected).some(row => row.value === value)) throw new Error("Ollama не предоставила выбранное значение настройки")
                if (selected.currentValue === value) continue
                changed = true
                values = await native.configure(sessionId, selected.id, value)
                signal.throwIfAborted()
                if (option(values, category)?.currentValue !== value) throw new Error("Ollama не подтвердила настройку")
              }
              return project(values)
            } catch (error) {
              if (!changed && error instanceof Error) Object.defineProperty(error, "providerEffect", {value: "not-started", configurable: true})
              throw error
            } finally {busy = false}
          },
          async prompt(text, signal) {
            signal.throwIfAborted()
            if (closed || busy) throw new Error("Ollama session закрыта или занята")
            operationSignal = signal
            busy = true
            let response = ""
            const abort = () => native.cancel(sessionId)
            signal.addEventListener("abort", abort, {once: true})
            try {
              const result = await native.prompt(sessionId, [{type: "text", text}], async notification => {
                if (notification.sessionUpdate === "agent_message_chunk" && notification.content.type === "text") response += notification.content.text
              })
              signal.throwIfAborted()
              if (result.stopReason !== "end_turn") throw new Error(`Ollama не завершила ответ: ${result.stopReason}`)
              return response
            } finally {signal.removeEventListener("abort", abort); busy = false}
          },
        }
      } catch (error) {await close(); throw error}
    },
  }
}
