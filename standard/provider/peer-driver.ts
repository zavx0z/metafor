import {client, methods, PROTOCOL_VERSION, type SessionNotification, type SessionConfigOption} from "@agentclientprotocol/sdk"
import peer from "@zavx0z/provider-tech-peer"
import type {PeerConnection, PeerNetwork} from "@zavx0z/provider-tech-peer/types"
import type {ProviderDriver as ChatDriver, ProviderConnection as ChatConnection} from "./runtime-types"
import type {ProviderBinding as ChatProviderBinding} from "@metafor/types/metafor/providers"

/** Host supplies an assigned network lease; this driver never discovers another host or executable. */
export type ChatPeerNetworkLease = Readonly<{network: PeerNetwork; close?(): Promise<void>}>

/** Finite ACP admission/initialize only: no native session is created and no model is prompted. */
export async function checkPeerProvider(options: {binding: ChatProviderBinding; connect(signal: AbortSignal): Promise<ChatPeerNetworkLease>}, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const lease = await options.connect(signal)
  const remote = peer.createPeerClient(lease.network)
  let connection: ReturnType<ReturnType<typeof client>["connect"]> | undefined
  let port: PeerConnection | undefined
  try {
    port = await remote.open({peerId: options.binding.remotePeerId, executorId: options.binding.executorId,
      ...(options.binding.assignmentId === undefined ? {} : {assignmentId: options.binding.assignmentId}), signal})
    connection = client({name: "metafor-provider-check"})
      .onRequest(methods.client.session.requestPermission, async () => ({outcome: {outcome: "cancelled" as const}}))
      .connect(port.stream)
    const active = connection
    void port.closed.then(() => active.close(new Error("Provider check stream closed")))
    const abort = () => active.close(signal.reason)
    signal.addEventListener("abort", abort, {once: true})
    try {
      const result = await active.agent.request(methods.agent.initialize, {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}}, {cancellationSignal: signal})
      signal.throwIfAborted()
      if (result.protocolVersion !== PROTOCOL_VERSION) throw new Error("Provider check received an unsupported ACP version")
    } finally {signal.removeEventListener("abort", abort)}
  } finally {
    connection?.close()
    try {await port?.dispose()} finally {try {await remote.close()} finally {await lease.close?.()}}
  }
}

/**
Uses public Provider peer admission and the official ACP SDK for one bound Chat.
Each open owns its ACP stream/client and releases its supplied network lease.
Resume names the exact prior native session; lost connections never replay a
prompt or select another host. Permissions are denied and replay updates are
excluded from the current response. Official ACP configOptions from new/resume
and config_option_update remain current; settings uses only issued select
values, flattens groups for presentation and never prompts. [Owner](README.md); [tests](../chat/test/peer-driver.test.ts).
*/
export function createPeerChatDriver(options: {binding: ChatProviderBinding; connect(signal: AbortSignal): Promise<ChatPeerNetworkLease>}): ChatDriver {
  const binding = Object.freeze(structuredClone(options.binding))
  return {binding, async open(input): Promise<ChatConnection> {
    input.signal.throwIfAborted()
    let lease: ChatPeerNetworkLease | undefined
    let remote: ReturnType<typeof peer.createPeerClient> | undefined
    let port: PeerConnection | undefined
    let sdk: ReturnType<ReturnType<typeof client>["connect"]> | undefined
    let disposed = false, prompting = false, replay = input.sessionId !== null
    let native = input.sessionId
    let failed: Error | null = null, closing: Promise<void> | undefined
    const early: SessionNotification[] = [], messages = new Map<string, string>()
    let bytes = 0
    let configuring = false
    let configOptions: readonly SessionConfigOption[] = []
    const rememberOptions = (value: readonly SessionConfigOption[] | null | undefined) => {
      if (value && value.length > 256) throw new Error("Provider превысил допустимый каталог настроек")
      configOptions = structuredClone(value ?? [])
    }
    const selectedOption = (category: string) => configOptions.find((option): option is Extract<SessionConfigOption, {type: "select"}> => option.type === "select" && option.category === category)
    const choices = (option: ReturnType<typeof selectedOption>) => {
      const values = option?.options.flatMap(item => "options" in item ? item.options : [item]) ?? []
      if (values.length > 256) throw new Error("Provider превысил допустимый каталог значений")
      return values
    }
    const close = () => closing ??= (async () => {
      disposed = true
      input.signal.removeEventListener("abort", abort)
      sdk?.close(new Error("Chat освободил Provider peer"))
      try {await port?.dispose()}
      finally {try {await remote?.close()} finally {await lease?.close?.()}}
    })()
    const abort = () => {void close().catch(() => {})}
    try {
      lease = await options.connect(input.signal)
      input.signal.throwIfAborted()
      remote = peer.createPeerClient(lease.network)
      port = await remote.open({peerId: binding.remotePeerId, executorId: binding.executorId,
        ...(binding.assignmentId === undefined ? {} : {assignmentId: binding.assignmentId}),
        ...(native === null ? {} : {previousSessionId: native}), signal: input.signal})
      input.signal.throwIfAborted()
      sdk = client({name: "metafor-chat"})
        .onRequest(methods.client.session.requestPermission, async () => ({outcome: {outcome: "cancelled" as const}}))
        .onNotification(methods.client.session.update, ({params}) => {
          if (native === null) {
            if (early.length >= 256) {failed = new Error("Provider прислал слишком много ранних updates"); sdk?.close(failed)}
            else early.push(params)
            return
          }
          if (params.sessionId !== native) {failed = new Error("Provider прислал update другой native session"); sdk?.close(failed); return}
          const update = params.update
          if (update.sessionUpdate === "config_option_update") {
            try {rememberOptions(update.configOptions)} catch (error) {failed = error instanceof Error ? error : new Error("Provider вернул недопустимые настройки"); sdk?.close(failed)}
            return
          }
          if (replay || !prompting) return
          if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
            bytes += new TextEncoder().encode(update.content.text).byteLength
            if (bytes > 8 * 1024 * 1024) {failed = new Error("Ответ Provider превысил допустимый размер"); sdk?.close(failed); return}
            const id = update.messageId ?? "turn"
            messages.set(id, (messages.get(id) ?? "") + update.content.text)
          }
        }).connect(port.stream)
      const connection = sdk
      void port.closed.then(() => {if (!disposed) {failed = new Error("Provider peer connection потеряно"); connection.close(failed)}})
      input.signal.addEventListener("abort", abort, {once: true})
      if (input.signal.aborted) abort()
      const initialized = await connection.agent.request(methods.agent.initialize, {protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: {name: "metafor-chat", version: "0.1.0"}}, {cancellationSignal: input.signal})
      if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error("Provider не поддерживает ожидаемый ACP protocol")
      if (native === null) {
        const created = await connection.agent.request(methods.agent.session.new, {cwd: "/", mcpServers: []}, {cancellationSignal: input.signal})
        native = created.sessionId
        rememberOptions(created.configOptions)
      } else {
        const capabilities = initialized.agentCapabilities
        const method = capabilities?.sessionCapabilities?.resume != null ? methods.agent.session.resume : capabilities?.loadSession === true ? methods.agent.session.load : undefined
        if (method === undefined) throw new Error("Provider не поддерживает продолжение сохранённой native session")
        const restored = await connection.agent.request(method, {sessionId: native, cwd: "/", mcpServers: []}, {cancellationSignal: input.signal})
        rememberOptions(restored.configOptions)
      }
      if (!native || early.some(update => update.sessionId !== native)) throw new Error("Provider изменил native identity при открытии")
      for (const notification of early) if (notification.update.sessionUpdate === "config_option_update") rememberOptions(notification.update.configOptions)
      early.length = 0
      replay = false
      input.signal.throwIfAborted()
      if (failed) throw failed
      const sessionId = native
      return {sessionId, close, async settings(selection, signal) {
        signal.throwIfAborted()
        if (disposed || failed) throw failed ?? new Error("Provider peer освобождён")
        if (prompting || configuring) throw new Error("Provider peer уже занят")
        configuring = true
        let changed = false
        try {
          for (const [category, value] of [["model", selection.model], ["thought_level", selection.reasoning]] as const) {
            if (value === undefined) continue
            const option = selectedOption(category)
            if (!option || !choices(option).some(item => item.value === value)) throw Object.assign(new Error("Provider не предоставил выбранное значение настройки"), {providerEffect: changed ? "uncertain" : "not-started"})
            if (option.currentValue === value) continue
            changed = true
            const result = await connection.agent.request(methods.agent.session.setConfigOption, {sessionId, configId: option.id, value}, {cancellationSignal: signal})
            signal.throwIfAborted()
            rememberOptions(result.configOptions)
            if (selectedOption(category)?.currentValue !== value) throw new Error("Provider не подтвердил выбранное значение настройки")
          }
          const model = selectedOption("model"), reasoning = selectedOption("thought_level")
          return {model: model?.currentValue ?? null, reasoning: reasoning?.currentValue ?? null,
            models: choices(model).map(item => ({id: item.value, label: item.name})), reasoningLevels: choices(reasoning).map(item => ({id: item.value, label: item.name}))}
        } finally {configuring = false}
      }, async prompt(text, signal) {
        signal.throwIfAborted()
        if (disposed || failed) throw failed ?? new Error("Provider peer освобождён")
        if (prompting || configuring) throw new Error("Provider peer уже занят")
        prompting = true
        bytes = 0
        messages.clear()
        const cancel = () => {connection.close(signal.reason); void close().catch(() => {})}
        signal.addEventListener("abort", cancel, {once: true})
        if (signal.aborted) cancel()
        try {
          const result = await connection.agent.request(methods.agent.session.prompt, {sessionId, prompt: [{type: "text", text}]}, {cancellationSignal: signal})
          signal.throwIfAborted()
          if (failed) throw failed
          if (result.stopReason !== "end_turn") throw new Error(`Provider turn завершён с причиной ${result.stopReason}`)
          return [...messages.values()].at(-1) ?? ""
        } finally {prompting = false; signal.removeEventListener("abort", cancel)}
      }}
    } catch (error) {await close(); throw error}
  }}
}
