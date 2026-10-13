import {useMemo, useRef} from "@zavx0z/immersive/XReact"
import ExecutionSettings, {type StorybookAppWebPageShellExecutionSettings as Settings} from "@zavx0z/storybook-app-web-page-shell-execution-settings"
import type {AtomContext} from "@metafor/agent/atom"
import type {AgentWorkspaceSource, AgentWorkspaceSnapshot} from "./agent-workspace-types"
import {parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import type {ProviderRegistry} from "@metafor/types/metafor/providers"
import type {ProfileIntentRequest, ProfileTargetDescriptor} from "@metafor/types/metafor/profile-intent"

export type ProviderHUDProps = Readonly<{
  atom: AtomContext | null
  open: boolean
  onOpenChange(open: boolean): void
  id?: string | undefined
  scopeLabel?: string | undefined
  registries?: AgentWorkspaceSnapshot["providerRegistries"]
  connectProviderBrowser?: AgentWorkspaceSource["connectProviderBrowser"]
  profiles?: readonly ProfileTargetDescriptor[] | undefined
  profileError?: string | null | undefined
  profileIntent?: ((request: ProfileIntentRequest, signal: AbortSignal) => Promise<void>) | undefined
}>
type Client = ReturnType<NonNullable<Settings.Input["clientFactory"]>>
type Document = Awaited<ReturnType<Client["read"]>>

/** Adapter сохраняет настройки в owning Provider через ordinary Force intent и читает подтверждённую Mass. */
export function createProviderSettingsClient(props: () => ProviderHUDProps, signal: AbortSignal): Client {
  const owned = new Map<string, {iceServers: Array<{urls: string | string[]; username?: string; credential?: string}>}>()
  let confirmed: {ref: string, registry: ProviderRegistry} | undefined
  const owner = () => {
    const assigned = props().atom?.getSnapshot().providers
    const owners = assigned ? [assigned] : props().registries ?? []
    if (owners.length !== 1) throw new Error(owners.length ? "Выберите единственного владельца Provider" : "Реестр Provider ещё не получен")
    const observed = owners[0]!
    return confirmed?.ref === observed.ref && confirmed.registry.revision >= observed.registry.revision ? confirmed : observed
  }
  const rows = () => {const selected = owner(); return selected.registry.entries.map(entry => ({owner: selected, entry}))}
  const operation = async (value: object) => {
    signal.throwIfAborted()
    const selected = owner()
    const response = await fetch("/agents/connections", {method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({providerRef: selected.ref, ...value}), signal})
    const receipt = await response.json()
    if (!response.ok) throw new Error(receipt.error?.message ?? "Provider не подтвердил сохранение")
    if (receipt.ref !== selected.ref) throw new Error("Владелец Provider изменился")
    confirmed = {ref: receipt.ref, registry: parseProviderRegistry(receipt.registry)}
    return confirmed
  }
  const checking = new Map<string, ReturnType<typeof operation>>()
  const checkConnection = (connectionId: string) => {
    const previous = checking.get(connectionId)
    if (previous) return previous
    const result = operation({check: connectionId}).finally(() => {checking.delete(connectionId)})
    checking.set(connectionId, result)
    return result
  }
  const bindingId = (connectionId: string) => {
    const registry = owner().registry
    return registry.settings.configuration ? registry.settings.connectionBindings?.[connectionId] ?? null : connectionId
  }
  const read = async (): Promise<Document> => {
    signal.throwIfAborted()
    const registry = owner().registry
    if (registry.settings.configuration) return structuredClone(registry.settings.configuration)
    const connections: Document["connections"][number][] = rows().map(({entry}) => {
      const base = {id: entry.id, label: `${entry.service} · ${entry.host}`, enabled: entry.resolution === "exact"}
      if (entry.service === "codex") return {...base, provider: "codex" as const}
      const provider = entry.host === "mac" ? "chrome-studio" as const : "capsule" as const
      const profile = props().profiles?.find(target => provider === "chrome-studio" ? target.meta === "intel-macos-chrome-studio" : target.meta === "workspace-capsule")
      const service = entry.service === "chatgpt" || entry.service === "deepseek" ? entry.service : "qwen"
      return {...base, provider, peer: {peerId: entry.remotePeerId, executorId: entry.executorId}, endpoint: {url: "", profile: profile?.expectedProfile.name ?? "", service}}
    })
    return {schemaVersion: 1, revision: 0, connections,
      general: registry.settings.selectedId ? {connectionId: registry.settings.selectedId} : {}, types: {}}
  }
  return {
    read,
    async save(document) {
      await operation({configure: document})
      return read()
    },
    async options(connectionId, model) {
      signal.throwIfAborted()
      const saved = await read()
      const connection = saved.connections.find(row => row.id === connectionId)
      if (!connection?.enabled) throw new Error("Подключение выключено или удалено")
      // Конечную проверку выполняет Provider Process без отправки prompt.
      const checked = await checkConnection(connectionId)
      const binding = bindingId(connectionId)
      const check = checked.registry.settings.connectionChecks?.[connectionId] ?? checked.registry.entries.find(row => row.id === binding)?.checks
      if (!binding || check?.status === "failed") throw new Error(check?.message ?? "Назначение Provider не подтверждено")
      if (connection.provider === "ollama") {
        const selected = owner()
        const response = await fetch("/agents/connections", {method: "POST", headers: {"content-type": "application/json"},
          body: JSON.stringify({providerRef: selected.ref, options: {connectionId, ...(model ? {model} : {})}}), signal})
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? "Каталог Ollama недоступен")
        const value = result.options
        if (!value || !Array.isArray(value.models) || !Array.isArray(value.reasoningLevels)) throw new Error("Ollama не предоставила каталог моделей")
        return [
          {id: "model", category: "model" as const, name: "Модель", value: value.model ?? "", options: value.models.map((row: {id: string; label: string}) => ({value: row.id, name: row.label}))},
          ...(value.reasoningLevels.length ? [{id: "reasoning", category: "thought_level" as const, name: "Мышление", value: value.reasoning ?? "", options: value.reasoningLevels.map((row: {id: string; label: string}) => ({value: row.id, name: row.label}))}] : []),
        ]
      }
      const atom = props().atom, before = atom?.getSnapshot()
      if (!before?.provider || before.providerBinding?.id !== binding) return []
      const sessionId = before.provider.sessionId
      if (atom?.actions.prepareProviderSettings && sessionId) await atom.actions.prepareProviderSettings(signal)
      const value = atom?.getSnapshot()
      if (props().atom?.ref !== atom?.ref || !value?.provider || value.providerBinding?.id !== binding || value.provider.sessionId !== sessionId) throw new Error("Native session или назначение Provider изменились")
      const provider = value.provider
      return [
        ...(provider.models.length ? [{id: "model", category: "model" as const, name: "Модель", value: provider.model ?? "", options: provider.models.map(option => ({value: option.id, name: option.label}))}] : []),
        ...(provider.reasoningLevels.length ? [{id: "reasoning", category: "thought_level" as const, name: "Мышление", value: provider.reasoning ?? "", options: provider.reasoningLevels.map(option => ({value: option.id, name: option.label}))}] : []),
      ]
    },
    async openBrowserViewer(connectionId, viewerSignal) {
      const document = await read()
      if (!document.connections.some(row => row.id === connectionId && row.enabled)) throw new Error("Подключение выключено или удалено")
      const binding = bindingId(connectionId)
      const row = rows().find(row => row.entry.id === binding)
      if (!row) throw new Error("Provider отсутствует в наблюдаемом реестре")
      const response = await fetch("/agents/browser/bootstrap", {method: "POST", headers: {"content-type": "application/json"},
        body: JSON.stringify({agentRef: null, providerRef: row.owner.ref, entryId: row.entry.id}), signal: AbortSignal.any([signal, viewerSignal])})
      if (!response.ok) throw new Error("Oracle не подтвердил просмотр Provider")
      const value = await response.json()
      owned.set(value.ticket, {iceServers: value.iceServers})
      const close = () => {
        if (!owned.delete(value.ticket)) return
        signal.removeEventListener("abort", close)
        viewerSignal.removeEventListener("abort", close)
        void fetch("/agents/browser/bootstrap", {method: "DELETE", headers: {"content-type": "application/json"}, body: JSON.stringify({ticket: value.ticket})}).catch(() => {})
      }
      signal.addEventListener("abort", close, {once: true})
      viewerSignal.addEventListener("abort", close, {once: true})
      return {instanceId: value.description.instanceId, profile: value.description.profile, controlEnabled: value.description.controlEnabled,
        audio: value.description.media?.audio === true, socketPath: `/agents/browser/socket?ticket=${encodeURIComponent(value.ticket)}&instanceId=${encodeURIComponent(value.description.instanceId)}`,
        ...(value.screenshotProvider === true ? {screenshotSocketPath: `/agents/browser/screenshot?ticket=${encodeURIComponent(value.ticket)}&instanceId=${encodeURIComponent(value.description.instanceId)}&profile=${encodeURIComponent(value.description.profile)}`} : {})}
    },
    async renewBrowserViewer(descriptor, renewSignal) {
      signal.throwIfAborted()
      renewSignal.throwIfAborted()
      const ticket = new URL(descriptor.socketPath, globalThis.location?.origin ?? "http://metafor").searchParams.get("ticket")
      if (!ticket || !owned.has(ticket)) throw new Error("Билет Provider уже закрыт")
      const response = await fetch("/agents/browser/renew", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({ticket}),
        signal: AbortSignal.any([signal, renewSignal])})
      if (!response.ok) throw new Error("Provider не подтвердил продление просмотра")
      const value = await response.json()
      if (value.schema !== "cosmos:agents/browser-renewal/v1" || value.version !== 1 || value.ticket !== ticket || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error("Provider вернул неверное продление просмотра")
    },
    async browserViewerConfiguration(descriptor) {
      signal.throwIfAborted()
      const ticket = new URL(descriptor.socketPath, globalThis.location?.origin ?? "http://metafor").searchParams.get("ticket")
      const configuration = ticket ? owned.get(ticket) : undefined
      if (!configuration) throw new Error("Билет Provider уже закрыт")
      return {...configuration, iceTransportPolicy: "all" as const}
    },
  }

}

/** Полное готовое окно Storybook. Adapter читает Provider Mass; UI не владеет настройками. */
export function ProviderHUD(props: ProviderHUDProps) {
  const current = useRef(props)
  current.current = props
  const factory = useMemo(() => (signal: AbortSignal) => createProviderSettingsClient(() => current.current, signal), [])
  const changed = useMemo(() => (state: Parameters<NonNullable<Settings.Input["onStateChange"]>>[0]) => {
    if (current.current.open !== state.open) current.current.onOpenChange(state.open)
  }, [])
  return <ExecutionSettings
    initialState={{open: props.open}}
    onStateChange={changed}
    clientFactory={factory}
  />
}
