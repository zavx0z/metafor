import {readCosmosLegacyConversation} from "./legacy-conversation"
import {createCosmosConversationGroups} from "./conversation-groups"
import {mkdir} from "node:fs/promises"
import createSessions, {type StorybookChatSession} from "@zavx0z/storybook-chat-session"
import connectAcp from "@zavx0z/storybook-tech-acp"
import peer from "@zavx0z/provider-tech-peer"
import {authorizedProviderPeerLease, resolveConfiguredProvider} from "@metafor/provider/driver"
import type {ProviderConnection} from "@metafor/types/metafor/providers"
import {agentConversationDirectory, atomConversationDirectory, createCosmosAgentProfiles} from "./agent-profile"
import type {CosmosAgentScope} from "../shared/agent-profile"
import {COSMOS_CONVERSATIONS_PATH, type CosmosConversationRequest, type CosmosAtomConversationScope} from "../shared/conversations"

type Subject = ReturnType<StorybookChatSession.Input["resolve"]>
export type CosmosConversationsOptions = Readonly<{
  directory: string
  onDirectoryChange?(room: CosmosAtomConversationScope): void
  authorize(request: Request): void | Promise<void>
  validAtom(scope: CosmosAtomConversationScope): boolean | Promise<boolean>
  validParticipant(scope: CosmosAgentScope): Readonly<{name: string}> | null | Promise<Readonly<{name: string}> | null>
  resolveExecution: NonNullable<StorybookChatSession.Input["resolveExecution"]>
  /** Доверенное назначение исполнения хостом; по умолчанию используется native peer capability Provider. */
  connect?: StorybookChatSession.Input["connect"]
}>

const bodyLimit = 1024 * 1024
const replyLimit = 16 * 1024 * 1024
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
class ConversationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {super(message)}
}
const invalid = () => new ConversationError(400, "invalid_request", "Нужен точный запрос беседы Cosmos")
const scopeKey = (scope: CosmosAgentScope) => JSON.stringify([scope.verseId, scope.atomRef, scope.agentRef])

function scopeValue(value: unknown): CosmosAgentScope {
  if (!object(value) || Object.keys(value).length !== 3 || !["verseId", "atomRef", "agentRef"].every(key =>
    typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 2048 && !/[\u0000-\u001f]/u.test(value[key]))) throw invalid()
  return {verseId: value.verseId as string, atomRef: value.atomRef as string, agentRef: value.agentRef as string}
}

function atomScopeValue(value: unknown): CosmosAtomConversationScope {
  if (!object(value) || Object.keys(value).length !== 2) throw invalid()
  const scope = scopeValue({...value, agentRef: value.atomRef})
  return {verseId: scope.verseId, atomRef: scope.atomRef}
}

async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw invalid()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > bodyLimit) {await reader.cancel(); throw new ConversationError(413, "request_limit", "Запрос беседы слишком велик")}
      chunks.push(next.value)
    }
  } finally {reader.releaseLock()}
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength}
  try {return JSON.parse(new TextDecoder().decode(bytes))} catch {throw invalid()}
}

function parse(value: unknown): CosmosConversationRequest {
  if (!object(value) || typeof value.action !== "string") throw invalid()
  if (["agent.create", "agent.ensure", "agent.list", "group.list", "group.create", "group.update"].includes(value.action)) atomScopeValue(value.scope)
  else scopeValue(value.scope)
  const required: Record<string, readonly string[]> = {
    "group.list": [], "group.create": ["expectedRevision", "title", "members"], "group.update": ["expectedRevision", "id", "title", "members"],
    "agent.list": [], "agent.create": ["name"], "agent.ensure": ["name"], "legacy.read": [], "profile.read": [], "profile.update": ["update"], list: [], create: [], read: [], prepare: [], cancel: [], stop: [], permission: ["id", "optionId"], delete: [], restore: [], purge: [],
    rename: ["label"], configure: ["id", "value"], configureExecution: ["selection"], prompt: ["text", "requestId"],
    displayHistory: [], historyItem: ["id"], groupHistory: ["groupId"], groupHistoryItem: ["groupId", "id"],
    historyContent: ["id"], historyDetail: ["id"], historyTerminal: ["id"], historyEvidence: ["id"],
  }
  if (!Object.hasOwn(required, value.action)) throw invalid()
  const keys = required[value.action]!
  const selected = !["group.list", "group.create", "group.update", "agent.list", "agent.create", "agent.ensure", "legacy.read", "profile.read", "profile.update", "list", "create"].includes(value.action)
  const allowed = new Set(["action", "scope", ...keys, ...(selected ? ["sessionId"] : []),
    ...(value.action === "create" ? ["label"] : []), ...(value.action === "permission" ? ["requestHash"] : []), ...(["displayHistory", "groupHistory", "historyContent", "historyDetail", "historyTerminal", "historyEvidence"].includes(value.action) ? ["query"] : [])])
  if (Object.keys(value).some(key => !allowed.has(key)) || keys.some(key => !Object.hasOwn(value, key))) throw invalid()
  for (const key of ["sessionId", "label", "id", "groupId", "requestId", "value", "optionId", "requestHash"]) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !value[key] || value[key].length > 4096)) throw invalid()
  }
  if (value.action === "group.create" || value.action === "group.update") {
    if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0 || typeof value.title !== "string" || !Array.isArray(value.members) || value.members.some(member => typeof member !== "string")) throw invalid()
  }
  if ((value.action === "agent.create" || value.action === "agent.ensure") && (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 128)) throw invalid()
  if (value.action === "prompt" && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 64000)) throw invalid()
  if (value.action === "configureExecution" && (!object(value.selection) || Object.keys(value.selection).some(key => !["connectionId", "model", "thoughtLevel", "approvalMode"].includes(key)))) throw invalid()
  if (value.action === "profile.update" && (!object(value.update) || Object.keys(value.update).length !== 3 || !["expectedRevision", "name", "gender"].every(key => Object.hasOwn(value.update as object, key)))) throw invalid()
  if (value.query !== undefined && !object(value.query)) throw invalid()
  return value as unknown as CosmosConversationRequest
}

/** Полный ACP lifecycle использует публичный stream Provider без второй сети, CLI либо протокола сообщений. */
export async function nativeConnect(input: Parameters<StorybookChatSession.Input["connect"]>[0]) {
  const selected = input.execution.connections.find(value => value.id === input.execution.effective.connectionId)
  if (!selected?.enabled || !selected.peer) throw new Error("Выберите подтверждённое peer-подключение; локальный CLI этой поверхностью не запускается")
  const binding = await resolveConfiguredProvider(selected as ProviderConnection, [])
  const lease = await authorizedProviderPeerLease(binding, input.signal)
  const remote = peer.createPeerClient(lease.network)
  let port: Awaited<ReturnType<typeof remote.open>> | undefined
  let disposing: Promise<void> | undefined
  const dispose = () => disposing ??= (async () => {
    try {await port?.dispose()} finally {try {await remote.close()} finally {await lease.close()}}
  })()
  try {
    port = await remote.open({peerId: binding.remotePeerId, executorId: binding.executorId,
      ...(binding.assignmentId === undefined ? {} : {assignmentId: binding.assignmentId}),
      ...(input.previousSessionId === undefined ? {} : {previousSessionId: input.previousSessionId}), signal: input.signal})
    return await connectAcp({cwd: input.subject.cwd, agentCwd: "/", mcpServers: [],
      ...(input.previousSessionId === undefined ? {} : {previousSessionId: input.previousSessionId}),
      ...(input.preferResume === undefined ? {} : {preferResume: input.preferResume}),
      signal: input.signal, ...(input.onProgress === undefined ? {} : {onProgress: input.onProgress}), onUpdate: input.onUpdate,
      ...(input.onReplay === undefined ? {} : {onReplay: input.onReplay}), onPermission: input.onPermission,
      ownedStream: {stream: port.stream, closed: port.closed, dispose}})
  } catch (error) {await dispose(); throw error}
}

/**
 * Cosmos сохраняет беседы готовым Storybook store в своём каталоге, отдельно от Quantum.
 * Scope допускает живой Graph хоста до любого чтения или создания профиля. История,
 * native identity, replay и request dedup остаются у Session; здесь только same-origin HTTP.
 * @see ../../README.md#беседы-и-представление-агентов
 */
export function createCosmosConversations(options: CosmosConversationsOptions) {
  const profiles = createCosmosAgentProfiles(options.directory)
  const groups = createCosmosConversationGroups(options.directory)
  const ensuring = new Map<string, Promise<Awaited<ReturnType<StorybookChatSession.Output["create"]>>>>()
  const subjects = new Map<string, Subject>()
  const directories = new Map<string, string>()
  const sessions = createSessions({directory(subject) {
    const directory = directories.get(subject.address)
    if (!directory) throw new Error("Беседа не принадлежит открытому участнику")
    return directory
  }, resolve(address) {
    const subject = subjects.get(address)
    if (!subject) throw new Error("Участник беседы не подтверждён хостом")
    return subject
  }, resolveExecution: options.resolveExecution, connect: options.connect ?? nativeConnect})

  const openAtom = async (scope: CosmosAtomConversationScope) => {
    if (!await options.validAtom(scope)) throw new ConversationError(403, "forbidden", "Комната недоступна в выбранном мире")
    const folder = atomConversationDirectory(options.directory, scope)
    const address = JSON.stringify([scope.verseId, scope.atomRef])
    await mkdir(folder, {recursive: true, mode: 0o700})
    directories.set(address, folder)
    subjects.set(address, {address, label: scope.atomRef, cwd: folder})
    return address
  }
  const open = async (scope: CosmosAgentScope) => {
    if (scope.agentRef.startsWith("agent:")) {
      const address = await openAtom(scope)
      const executorId = scope.agentRef.slice(6)
      const actor = (await sessions.list(address)).find(value => value.executorId === executorId)
      if (!actor) throw new ConversationError(403, "forbidden", "Агент не принадлежит выбранной комнате")
      const profile = await profiles.ensure(scope, actor.executorLabel)
      return {address, profile, executorId}
    }
    const participant = await options.validParticipant(scope)
    if (!participant) throw new ConversationError(403, "forbidden", "Участник недоступен в выбранном мире")
    const folder = agentConversationDirectory(options.directory, scope)
    const profile = await profiles.ensure(scope, participant.name)
    const address = scopeKey(scope)
    await mkdir(folder, {recursive: true, mode: 0o700})
    directories.set(address, folder)
    subjects.set(address, {address, label: profile.name, cwd: folder})
    return {address, profile, executorId: undefined}
  }
  const target = async (address: string, executorId?: string, sessionId?: string) => executorId !== undefined
    ? {address, executorId, ...(sessionId === undefined ? {} : {sessionId})}
    : sessionId === undefined ? address : {address, executorId: (await sessions.read(address)).executorId, sessionId}
  const ensureActor = (address: string, label: string, room: CosmosAtomConversationScope) => {
    let pending = ensuring.get(address)
    if (!pending) {
      pending = (async () => {
        const current = (await sessions.list(address))[0]
        if (current) return current
        const created = await sessions.create({address, label})
        options.onDirectoryChange?.(room)
        return created
      })()
      ensuring.set(address, pending)
      const current = pending
      void current.finally(() => {if (ensuring.get(address) === current) ensuring.delete(address)}).catch(() => {})
    }
    return pending
  }
  const execute = async (request: CosmosConversationRequest): Promise<unknown> => {
    if (request.action === "group.list" || request.action === "group.create" || request.action === "group.update") {
      const scope = atomScopeValue(request.scope)
      await openAtom(scope)
      if (request.action === "group.list") return groups.read(scope)
      if (request.members.length > 128 || new Set(request.members).size !== request.members.length) throw invalid()
      for (const agentRef of request.members) await open({...scope, agentRef})
      const changed = await (request.action === "group.create" ? groups.create(scope, request) : groups.update(scope, request))
      options.onDirectoryChange?.(scope)
      return changed
    }
    if (request.action === "agent.create" || request.action === "agent.ensure" || request.action === "agent.list") {
      const scope = atomScopeValue(request.scope)
      const address = await openAtom(scope)
      const actors = request.action === "agent.create" ? [await sessions.create({address, label: request.name})]
        : request.action === "agent.ensure" ? [await ensureActor(address, request.name, scope)] : await sessions.list(address)
      if (actors.length > 256) throw new ConversationError(413, "agent_limit", "Комната содержит более 256 агентов")
      const result = await Promise.all(actors.map(async actor => {
        const agentScope = {...scope, agentRef: `agent:${actor.executorId}`}
        return {scope: agentScope, profile: await profiles.ensure(agentScope, actor.executorLabel)}
      }))
      if (request.action === "agent.create") options.onDirectoryChange?.(scope)
      return request.action === "agent.list" ? result : result[0]
    }
    const scope = scopeValue(request.scope)
    const {address, profile, executorId} = await open(scope)
    if (request.action === "legacy.read") return readCosmosLegacyConversation(options.directory, scope)
    if (request.action === "profile.read") return profile
    if (request.action === "profile.update") {
      const updated = await profiles.update(scope, request.update)
      options.onDirectoryChange?.({verseId: scope.verseId, atomRef: scope.atomRef})
      return updated
    }
    const base = await target(address, executorId)
    if (request.action === "list") {
      const result = await sessions.listSessions(base)
      if (result.length > 256) throw new ConversationError(413, "session_limit", "Каталог содержит более 256 сессий")
      return result
    }
    if (request.action === "create") return sessions.createSession(base, request.label)
    const selected = await target(address, executorId, request.sessionId)
    switch (request.action) {
      case "read": return sessions.read(selected)
      case "prepare": return sessions.prepare(selected)
      case "cancel": return sessions.cancel(selected)
      case "stop": return sessions.stop(selected)
      case "permission": return sessions.permission(selected, request.id, request.optionId, request.requestHash)
      case "delete": await sessions.deleteSession(selected); return null
      case "restore": return sessions.restoreSession(selected)
      case "purge": await sessions.purgeSession(selected); return null
      case "rename": return sessions.renameSession(selected, request.label)
      case "configure": return sessions.configure(selected, request.id, request.value)
      case "configureExecution": return sessions.configureExecution(selected, {scope: "session", selection: request.selection})
      case "prompt": return sessions.prompt(selected, request.text, request.requestId)
      case "displayHistory": return sessions.displayHistory(selected, request.query)
      case "historyItem": return sessions.historyItem(selected, request.id)
      case "groupHistory": return sessions.groupHistory(selected, request.groupId, request.query)
      case "groupHistoryItem": return sessions.groupHistoryItem(selected, request.groupId, request.id)
      case "historyContent": return sessions.historyContent(selected, request.id, request.query)
      case "historyDetail": return sessions.historyDetail(selected, request.id, request.query)
      case "historyTerminal": return sessions.historyTerminal(selected, request.id, request.query)
      case "historyEvidence": return sessions.historyEvidence(selected, request.id, request.query)
    }
  }
  return {
    /** Подписка только на snapshots владельца Session; unsubscribe сохраняет его выполнение. */
    async subscribe(scope: CosmosAgentScope, sessionId: string | undefined, listener: Parameters<StorybookChatSession.Output["subscribe"]>[1]) {
      const opened = await open(scopeValue(scope))
      return sessions.subscribe(await target(opened.address, opened.executorId, sessionId), listener)
    },
    async handleRequest(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url)
      if (url.pathname !== COSMOS_CONVERSATIONS_PATH) return
      try {
        await options.authorize(request)
        request.signal.throwIfAborted()
        const input = request.method === "GET"
          ? parse({action: "list", scope: Object.fromEntries(url.searchParams)})
          : request.method === "POST" ? parse(await body(request)) : null
        if (!input) return Response.json({ok: false, error: {code: "method_not_allowed", message: "Используйте GET или POST"}}, {status: 405})
        const json = JSON.stringify({ok: true, result: (await execute(input)) ?? null})
        if (Buffer.byteLength(json) > replyLimit) throw new ConversationError(413, "reply_limit", "Уменьшите размер страницы истории")
        return new Response(json, {headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}})
      } catch (error) {
        return Response.json({ok: false, error: {code: error instanceof ConversationError ? error.code : "conversation_failed",
          message: (error instanceof Error ? error.message : "Беседа недоступна").slice(0, 4096)}},
        {status: error instanceof ConversationError ? error.status : 409, headers: {"Cache-Control": "no-store"}})
      }
    },
    dispose: () => sessions.dispose(),
  }
}
