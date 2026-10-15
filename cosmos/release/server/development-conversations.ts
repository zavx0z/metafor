import {createDevelopmentExecution} from "./development-execution"
import {createHash} from "node:crypto"
import {readFile, lstat} from "node:fs/promises"
import {join, relative, sep} from "node:path"
import createSessions, {type StorybookChatSession} from "@zavx0z/storybook-chat-session"
import type {DevelopmentConfiguration} from "../shared/development"
import type {createDevelopmentCatalog} from "./development-catalog"
import {createDevelopmentEnvironment, type DevelopmentEnvironmentHost} from "./development-environment"
import {nativeConnect} from "./conversations"
import {createDevelopmentAgentProfiles} from "./development-agent-profile"
import type {DevelopmentAgentProfileUpdate} from "../shared/development-agent"

type Catalog = Awaited<ReturnType<typeof createDevelopmentCatalog>>
type Target = Parameters<StorybookChatSession.Output["read"]>[0]
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** Тот же Session loop и archive; адреса source packages не имитируют Quantum Atom. */
export function createDevelopmentConversations(config: DevelopmentConfiguration, catalog: Catalog, options: {
  machine?: DevelopmentEnvironmentHost["machine"]
  connect?: StorybookChatSession.Input["connect"]
} = {}) {
  const instructions: DevelopmentEnvironmentHost["instructions"] = async source => {
    const owner = catalog.source(source.owner ?? source.name), paths = [owner.directory]
    const suffix = relative(owner.directory, source.directory)
    if (suffix && !suffix.startsWith("..") && !suffix.startsWith(sep)) {
      let path = owner.directory
      for (const part of suffix.split(sep)) {path = join(path, part); paths.push(path)}
    }
    const result: Array<{source: string, content: string, contentHash?: string}> = [{source: "cosmos:development",
      content: "Это самостоятельное окружение Cosmos. Вход в среду уже выполнен: следующие bootstrap, правила и команды являются текущим назначением. Пункт AGENTS.md о внешнем GET /api/environment не назначает чужой Project: не читай его server.json и не переноси bearer. Используй только выданные здесь команды. Файловая область — выбранный Package; отдельный bun.evaluate действует только на явно назначенной машине. Пакет без подтверждённого Archetype остаётся Package. Не публикуй и не развёртывай изменения автоматически."}]
    for (const directory of paths) {
      const path = join(directory, "AGENTS.md"), info = await lstat(path).catch(error => {if (error.code === "ENOENT") return null; throw error})
      if (!info) continue
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error("Assigned source instructions are unavailable")
      const content = await readFile(path, "utf8")
      result.push({source: `${owner.name}/${relative(owner.directory, path).split(sep).join("/")}`, content, contentHash: createHash("sha256").update(content).digest("hex")})
    }
    return result
  }
  const host: DevelopmentEnvironmentHost = {
    instructions,
    async readKnowledge(source, path) {
      if (path === "./instructions") return Response.json({path, instructions: await instructions(source), children: []})
      if (path === undefined || path === ".") return Response.json({path: ".", description: source.label,
        package: source.name, workspaceRevision: catalog.snapshot.revision,
        children: [{path: "./instructions", description: "Правила назначенного пакета"}, {path: "./dependencies", description: "Все объявленные manifest зависимости"}]})
      if (path === "./dependencies") return Response.json({path, package: source.name, dependencies: catalog.snapshot.dependencies.filter(edge => edge.from === source.name), children: []})
      return Response.json({error: {code: "not_found", message: "Документ не входит в назначение"}}, {status: 404})
    },
    ...(options.machine === undefined ? {} : {machine: options.machine}),
  }
  const execution = createDevelopmentExecution(config)
  const sessions = createSessions({
    directory: subject => join(config.stateDirectory, "chats", createHash("sha256").update(subject.address).digest("hex")),
    resolve(address) {const source = catalog.subject(address); return {address: source.address, label: source.label, cwd: source.directory}},
    resolveExecution: execution.resolve,
    saveExecutorSelection: execution.save,
    environment: input => createDevelopmentEnvironment(catalog, host, input),
    connect: options.connect ?? nativeConnect,
  })
  const profiles = createDevelopmentAgentProfiles(config.stateDirectory)
  const presentation = async (snapshot: Awaited<ReturnType<typeof sessions.read>>, create = false) => {
    const scope = {packageName: catalog.subject(snapshot.address).name, executorId: snapshot.executorId}
    const profile = create ? await profiles.ensure(scope) : await profiles.read(scope)
    return {...snapshot, ...(profile ? {sourceProfile: {...profile, name: snapshot.executorLabel}} : {})}
  }
  let probing = false
  const target = (body: Record<string, unknown>): Target => {
    if (typeof body.address !== "string") throw new Error("Development chat address is required")
    catalog.subject(body.address)
    if (body.executorId === undefined) {
      if (body.sessionId !== undefined) throw new Error("Session requires its executor identity")
      return body.address
    }
    if (typeof body.executorId !== "string" || body.sessionId !== undefined && typeof body.sessionId !== "string") throw new Error("Invalid development chat identity")
    return {address: body.address, executorId: body.executorId, ...(body.sessionId === undefined ? {} : {sessionId: body.sessionId})}
  }
  return {sessions,
    subscribe(input: {address: string, executorId?: string, sessionId?: string}, listener: Parameters<StorybookChatSession.Output["subscribe"]>[1]) {
      return sessions.subscribe(target(input), listener)
    },
    async request(operation: string, body: unknown, signal = new AbortController().signal): Promise<unknown> {
      if (!object(body)) throw new Error("Expected development chat command")
      if (operation === "execution-settings") return {schemaVersion: 1, revision: 1, connections: config.execution.connections,
        general: {connectionId: config.execution.connectionId}, types: {}}
      const selected = target(body)
      if (operation === "agent-profile-prepare" || operation === "agent-profile-update") {
        if (typeof body.executorId !== "string") throw new Error("Нужен точный исполнитель Source комнаты")
        const existing = (await sessions.list(body.address as string)).find(value => value.executorId === body.executorId)
        if (!existing) throw new Error("Исполнитель не найден в Source комнате")
        const scope = {packageName: catalog.subject(existing.address).name, executorId: existing.executorId}
        if (operation === "agent-profile-prepare") return {...await profiles.ensure(scope), name: existing.executorLabel}
        const update = body.profile as DevelopmentAgentProfileUpdate
        if (!object(update) || typeof update.name !== "string" || !update.name.trim() || update.name.trim().length > 128 ||
            typeof update.expectedName !== "string" || !update.expectedName.trim()) throw new Error("Нужны имя и исходное имя исполнителя")
        const saved = await profiles.update(scope, update, () => sessions.renameExecutor({address: existing.address, executorId: existing.executorId}, update.name, update.expectedName))
        return {...saved, name: update.name.trim()}
      }
      if (typeof body.chatId === "string" && (await sessions.read(selected)).id !== body.chatId) throw new Error("Development chat identity changed")
      switch (operation) {
        case "session": return sessions.read(selected)
        case "executor-preferences": {
          const snapshot = await sessions.read(selected)
          return {...snapshot, execution: await execution.resolve({subject: {address: body.address as string, cwd: catalog.subject(body.address as string).directory, label: catalog.subject(body.address as string).label}, executorId: snapshot.executorId, selection: {}})}
        }
        case "execution-options": {
          const connection = config.execution.connections.find(connection => connection.id === body.connectionId && connection.enabled)
          if (!connection) throw new Error("Development connection is not assigned")
          if (probing) throw new Error("Development capability probe is already running")
          probing = true
          const scope = new AbortController(), id = crypto.randomUUID()
          let probe: Awaited<ReturnType<StorybookChatSession.Input["connect"]>> | undefined
          const source = catalog.subject(body.address as string)
          try {
            probe = await (options.connect ?? nativeConnect)({subject: {address: source.address, label: source.label, cwd: source.directory}, localSessionId: id, executorId: id,
              executorLabel: "Capabilities", signal: AbortSignal.any([signal, scope.signal, AbortSignal.timeout(60_000)]),
              execution: {selection: {}, executorSelection: {}, effective: {connectionId: connection.id}, sources: {connectionId: "general"}, connections: config.execution.connections},
              onUpdate() {}, async onPermission() {return {outcome: {outcome: "cancelled"}}}})
            let values = probe.configOptions
            if (body.model !== undefined) {
              if (typeof body.model !== "string") throw new Error("Expected a model identity")
              const option = values.find(option => option.category === "model" && option.type === "select")
              if (!option || option.type !== "select" || !option.options.flatMap(item => "options" in item ? item.options : [item]).some(item => item.value === body.model)) throw new Error("Assigned connection does not provide that model")
              if (option.currentValue !== body.model) values = await probe.setConfigOption(option.id, body.model)
            }
            return values.flatMap(option => option.type !== "select" || option.category !== "model" && option.category !== "thought_level" ? [] : [{id: option.id,
              category: option.category, name: option.name, value: option.currentValue,
              options: option.options.flatMap(item => "options" in item ? item.options : [item]).map(item => ({value: item.value, name: item.name}))}])
          } finally {scope.abort(); try {await probe?.dispose()} finally {probing = false}}
        }
        case "list": return Promise.all((await sessions.list(body.address as string)).map(snapshot => presentation(snapshot)))
        case "create": return presentation(await sessions.create({address: body.address as string, label: body.label as string}), true)
        case "sessions": return sessions.listSessions(selected)
        case "session-create": return sessions.createSession(selected, body.label as string)
        case "session-rename": return sessions.renameSession(selected, body.label as string)
        case "session-delete": await sessions.deleteSession(selected); return {deleted: true}
        case "sessions-deleted": return sessions.listDeletedSessions(selected)
        case "session-restore": return sessions.restoreSession(selected)
        case "session-purge": await sessions.purgeSession(selected); return {purged: true}
        case "prepare": return sessions.prepare(selected)
        case "configure": return sessions.configure(selected, body.id as string, body.value as string)
        case "execution-configure": return sessions.configureExecution(selected, body.configuration as Parameters<typeof sessions.configureExecution>[1])
        case "prompt": return sessions.prompt(selected, (body.content ?? body.text) as Parameters<typeof sessions.prompt>[1], body.requestId as string)
        case "enqueue": return sessions.enqueue(selected, (body.content ?? body.text) as Parameters<typeof sessions.prompt>[1], body.requestId as string)
        case "cancel": return sessions.cancel(selected)
        case "stop": return sessions.stop(selected)
        case "permission": return sessions.permission(selected, body.id as string, body.optionId as string, body.requestHash as string | undefined)
        case "history": return sessions.history(selected, body.query as Parameters<typeof sessions.history>[1])
        case "history-display": return sessions.displayHistory(selected, body.query as Parameters<typeof sessions.displayHistory>[1])
        case "history-content": return sessions.historyContent(selected, body.id as string, body.query as Parameters<typeof sessions.historyContent>[2])
        case "history-detail": return sessions.historyDetail(selected, body.id as string, body.query as Parameters<typeof sessions.historyDetail>[2])
        case "history-terminal": return sessions.historyTerminal(selected, body.id as string, body.query as Parameters<typeof sessions.historyTerminal>[2])
        case "history-copy": return {text: await sessions.copyMessage(selected, body.id as string)}
        case "history-group": return sessions.groupHistory(selected, body.groupId as string, body.query as Parameters<typeof sessions.groupHistory>[2])
        case "history-group-item": return sessions.groupHistoryItem(selected, body.groupId as string, body.id as string)
        case "history-item": return sessions.historyItem(selected, body.id as string)
        case "history-evidence": return sessions.historyEvidence(selected, body.id as string, body.query as Parameters<typeof sessions.historyEvidence>[2])
        default: throw new Error("Development operation is not implemented")
      }
    },
    async close() {await profiles.close(); await sessions.dispose()},
  }
}
