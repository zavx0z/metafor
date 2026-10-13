import {spawn} from "node:child_process"
import {stat} from "node:fs/promises"
import {isAbsolute} from "node:path"
import {Readable, Writable} from "node:stream"
import {client, methods, ndJsonStream, PROTOCOL_VERSION, type SessionNotification} from "@agentclientprotocol/sdk"
import type {ProviderConnection as ChatConnection, ProviderDriver as ChatDriver} from "./runtime-types"

/** Подготовленный хостом executable и его argv; пути и env не приходят из Fields или ответа модели. */
export type CodexInstallation = Readonly<{
  command: readonly string[]
  cwd: string
  /** Только для явной host композиции и изолированной проверки собственного executable. */
  env?: Readonly<Record<string, string | undefined>>
}>

function configuredInstallation(): CodexInstallation {
  const encoded = process.env.ORACLE_AGENT_CODEX_COMMAND
  const cwd = process.env.ORACLE_AGENT_CODEX_CWD
  if (encoded === undefined || cwd === undefined) throw new Error("Хост не подготовил Codex ACP installation")
  let command: unknown
  try {command = JSON.parse(encoded)} catch {throw new TypeError("Codex ACP command должен быть JSON argv")}
  if (!Array.isArray(command)) throw new TypeError("Codex ACP command должен быть JSON argv")
  return {command, cwd}
}

function validate(installation: CodexInstallation): void {
  if (!installation.command.length || installation.command.length > 128
    || !installation.command.every(value => typeof value === "string" && value.length <= 16384 && !/[\u0000\r\n]/u.test(value))
    || !isAbsolute(installation.command[0]!) || !isAbsolute(installation.cwd) || /[\u0000\r\n]/u.test(installation.cwd)) {
    throw new TypeError("Codex ACP требует абсолютный executable, JSON argv и абсолютный cwd")
  }
}

/**
Создаёт driver [Chat](./README.md) через официальный ACP SDK. Executable принадлежит
подготовленной установке хоста, а не исходному checkout. Adapter владеет native
авторизацией и storage. Domain/control credentials и Oracle grants не наследуются
child; HOME/CODEX_HOME и штатная native авторизация сохраняются без чтения.
SDK проверяет сообщения; live session updates чужой identity
отклоняются. Restore не заменяется новым session. Close освобождает свою process
group; prompt/abort не оставляют ожидающего child. Native capability policy
принадлежит хосту: пустые clientCapabilities и denied permissions не заменяют sandbox.
Проверки — [ACP driver tests](../chat/test/codex.test.ts).
*/
export function createCodexDriver(installation?: CodexInstallation): ChatDriver {
  const opening = async (input: {sessionId: string | null; signal: AbortSignal}, probe = false): Promise<ChatConnection> => {
      input.signal.throwIfAborted()
      const selected = installation ?? configuredInstallation()
      validate(selected)
      if (!(await stat(selected.cwd)).isDirectory()) throw new TypeError("Codex ACP cwd должен быть существующим каталогом")
      input.signal.throwIfAborted()
      const env = {...process.env, ...selected.env}
      for (const key of ["CODEX_APP_TOOLS_PIPE_PATH", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY", "CODEX_INTERNAL_ORIGINATOR_OVERRIDE"]) delete env[key]
      for (const key of Object.keys(env)) {
        if (key.startsWith("COSMOS_") || key.startsWith("ORACLE_ENVIRONMENT_") || key.startsWith("METAFOR_")
          || key === "ORACLE_AGENT_CODEX_COMMAND" || key === "ORACLE_AGENT_CODEX_CWD" || key === "ORACLE_AGENT_PROVIDER_CONFIG" || key === "ORACLE_REPL_CONFIG") delete env[key]
      }
      const child = spawn(selected.command[0]!, [...selected.command.slice(1)], {cwd: selected.cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32"})
      child.stderr.resume()
      let exited = false
      let disposed = false
      let closing: Promise<void> | undefined
      let failed: Error | null = null
      let sessionId = input.sessionId
      const messages = new Map<string, string>()
      let prompting = false
      let replyBytes = 0
      let replay = input.sessionId !== null
      const early: SessionNotification[] = []
      child.once("exit", () => {exited = true})
      child.once("error", () => {exited = true})
      const connection = client({name: "metafor-chat"})
        .onRequest(methods.client.session.requestPermission, async () => ({outcome: {outcome: "cancelled" as const}}))
        .onNotification(methods.client.session.update, ({params}) => {
          if (sessionId === null) {early.push(params); return}
          if (params.sessionId !== sessionId) {
            failed = new Error("Provider прислал update другой native session")
            connection.close(failed)
            return
          }
          if (replay || !prompting) return
          const update = params.update
          if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
            replyBytes += Buffer.byteLength(update.content.text)
            if (replyBytes > 8 * 1024 * 1024) {
              failed = new Error("Ответ Codex превысил допустимый размер")
              connection.close(failed)
            } else {
              const messageId = update.messageId ?? "turn"
              messages.set(messageId, (messages.get(messageId) ?? "") + update.content.text)
            }
          }
        })
        .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>, {maxMessageBytes: 16 * 1024 * 1024}))
      child.once("error", () => {failed = new Error("Не удалось запустить подготовленный Codex ACP executable"); connection.close(failed)})
      child.once("exit", () => {if (!disposed) {failed = new Error("Codex ACP process завершился до освобождения"); connection.close(failed)}})
      const groupAlive = (): boolean => {
        if (process.platform === "win32" || child.pid === undefined) return !exited
        try {process.kill(-child.pid, 0); return true}
        catch (error) {if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error}
      }
      const waitStopped = async (milliseconds: number): Promise<boolean> => {
        const deadline = performance.now() + milliseconds
        do {
          if (exited && !groupAlive()) return true
          await new Promise(resolve => setTimeout(resolve, 25))
        } while (performance.now() < deadline)
        return exited && !groupAlive()
      }
      const kill = (signal: NodeJS.Signals) => {
        if (child.pid === undefined) return
        try {
          if (process.platform === "win32") {if (!exited) child.kill(signal)}
          else process.kill(-child.pid, signal)
        } catch (error) {if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error}
      }
      const close = (): Promise<void> => closing ??= (async () => {
        disposed = true
        input.signal.removeEventListener("abort", abort)
        connection.close(new Error("Chat освободил ACP connection"))
        child.stdin.end()
        if (await waitStopped(750)) return
        kill("SIGTERM")
        if (await waitStopped(1500)) return
        kill("SIGKILL")
        if (!await waitStopped(1500)) throw new Error("Не подтверждён выход принадлежащей Chat ACP process group")
      })()
      const abort = () => {
        connection.close(input.signal.reason)
        void close().catch(() => {})
      }
      input.signal.addEventListener("abort", abort, {once: true})
      if (input.signal.aborted) abort()
      try {
        const initialized = await connection.agent.request(methods.agent.initialize, {
          protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: {name: "metafor-chat", version: "0.1.0"},
        }, {cancellationSignal: input.signal})
        if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error("Provider не поддерживает ожидаемый ACP protocol")
        if (probe) {await close(); return {sessionId: "", close, async prompt() {throw new Error("Read-only Provider probe cannot prompt")}}}
        let sessionInfo: {configOptions?: unknown} = {}
        if (sessionId !== null) {
          const capabilities = initialized.agentCapabilities
          const method = capabilities?.sessionCapabilities?.resume != null ? methods.agent.session.resume
            : capabilities?.loadSession === true ? methods.agent.session.load : undefined
          if (method === undefined) throw new Error("Provider не поддерживает восстановление native session")
          try {
            sessionInfo = await connection.agent.request(method, {sessionId, cwd: selected.cwd, mcpServers: []}, {cancellationSignal: input.signal})
          } catch (error) {
            input.signal.throwIfAborted()
            throw new Error("Codex не восстановил сохранённую native session", {cause: error})
          }
        } else {
          const created = await connection.agent.request(methods.agent.session.new, {cwd: selected.cwd, mcpServers: []}, {cancellationSignal: input.signal})
          sessionInfo = created
          sessionId = created.sessionId
        }
        if (early.some(notification => notification.sessionId !== sessionId)) throw new Error("Provider прислал update другой native session при создании")
        early.length = 0
        replay = false
        input.signal.throwIfAborted()
        if (failed) throw failed
        if (!sessionId) throw new Error("Provider не вернул native session identity")
        const activeSession = sessionId
        return {
          sessionId: activeSession,
          async settings(selection, signal) {
            signal.throwIfAborted()
            const options = () => Array.isArray(sessionInfo.configOptions) ? sessionInfo.configOptions as Array<{id: string; category?: string; currentValue: string; options: Array<{value: string; name: string}>}> : []
            let changed = false
            for (const [category, value] of [["model", selection.model], ["thought_level", selection.reasoning]] as const) {
              if (value === undefined) continue
              const option = options().find(option => option.category === category)
              if (!option || !Array.isArray(option.options) || !option.options.some(item => item.value === value)) throw Object.assign(new Error("Provider did not offer the selected setting"), {providerEffect: changed ? "uncertain" : "not-started"})
              changed = true
              sessionInfo = await connection.agent.request(methods.agent.session.setConfigOption, {sessionId: activeSession, configId: option.id, value}, {cancellationSignal: signal})
            }
            const model = options().find(option => option.category === "model"), reasoning = options().find(option => option.category === "thought_level")
            const choices = (option: ReturnType<typeof options>[number] | undefined) => (option?.options ?? []).filter(item => typeof item.value === "string" && typeof item.name === "string").map(item => ({id: item.value, label: item.name}))
            return {model: model?.currentValue ?? null, reasoning: reasoning?.currentValue ?? null, models: choices(model), reasoningLevels: choices(reasoning)}
          },
          async prompt(text, signal) {
            signal.throwIfAborted()
            if (disposed || failed) throw failed ?? new Error("Chat ACP connection освобождён")
            if (prompting) throw new Error("Chat ACP prompt уже выполняется")
            prompting = true
            messages.clear()
            replyBytes = 0
            const cancel = () => {connection.close(signal.reason); void close().catch(() => {})}
            signal.addEventListener("abort", cancel, {once: true})
            if (signal.aborted) cancel()
            try {
              const result = await connection.agent.request(methods.agent.session.prompt, {sessionId: activeSession, prompt: [{type: "text", text}]}, {cancellationSignal: signal})
              signal.throwIfAborted()
              if (failed) throw failed
              if (result.stopReason !== "end_turn") throw new Error(`Codex turn завершён с причиной ${result.stopReason}`)
              return [...messages.values()].at(-1) ?? ""
            } finally {prompting = false; signal.removeEventListener("abort", cancel)}
          },
          close,
        }
      } catch (error) {
        await close()
        throw error
      }
  }
  return {open: input => opening(input), async check(signal) {await opening({sessionId: null, signal}, true)}}
}

/** Default Process driver получает installation только от host environment. */
export const codexDriver = createCodexDriver()
