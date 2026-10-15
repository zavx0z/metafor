import {createInstalledReleaseStore, isReleaseDigest} from "@metafor/tech-release/installed"
import {installedReleaseStoreIdentity, prepareInstalledReleaseSelection, readInstalledStateCompatibility, verifyInstalledReleaseSelection, type InstalledReleaseSelection} from "../../../selection"
import {authorizeAgentRequest} from "../agents"
import {RELEASE_MANAGEMENT_ACTIVATION_VIEW, RELEASE_MANAGEMENT_VIEW_HEADER, type ReleaseManagementRequest, type ReleaseManagementSnapshot, type ReleaseManagementStatus} from "../../shared/management"

type Host = Parameters<typeof authorizeAgentRequest>[1]

/**
Локальная HTTP-проекция существующего startup selection owner. Core только
принимает intent и передаёт его parent после ответа; subprocess/launcher и
activation record принадлежат startup. Readback не повторяет mutation.
Ошибка ожидания IPC оставляет исход unknown до terminal receipt startup:
истечение ожидания не отменяет уже переданный intent.
*/
export function createReleaseManagement(options: {
  storeRoot: string
  request(selection: InstalledReleaseSelection, operationId: string): Promise<void>
  defer(work: () => Promise<void>): void
}) {
  const store = createInstalledReleaseStore({root: options.storeRoot})
  let queued: {input: ReleaseManagementRequest; selection: InstalledReleaseSelection; error?: string} | null = null
  let accepting = false

  function reconcile(operation: ReleaseManagementSnapshot["operation"] | undefined) {
    if (queued?.input.operationId === operation?.id && (operation?.state === "complete" || operation?.state === "failed")) queued = null
  }

  function status(current: Awaited<ReturnType<typeof store.readActivation>>): ReleaseManagementStatus {
    reconcile(current?.operation)
    const operation = current?.operation
    const pending = queued && operation?.id !== queued.input.operationId
    return {schemaVersion: 1, active: current ? {digest: current.digest} : null, revision: current?.revision ?? 0,
      operation: pending && queued ? {id: queued.input.operationId, kind: queued.input.kind, target: queued.selection.target,
        state: queued.error ? "unknown" : "accepted", ...(queued.error ? {error: queued.error} : {})}
        : operation ? {id: operation.id, kind: operation.kind, target: operation.target, state: operation.state,
          ...(operation.error ? {error: publicFailure(operation.error)} : {})} : null}
  }

  async function readStatus(): Promise<ReleaseManagementStatus> {return status(await store.readActivation())}

  async function read(): Promise<ReleaseManagementSnapshot> {
    const current = await store.readActivation()
    const activation = status(current)
    const candidates = await store.listCandidates()
    const previous = current?.successful.find(item => item.digest !== current.digest)
    const compatibility = new Map<string, string | null>()
    for (const candidate of candidates) {
      compatibility.set(candidate.digest, await readInstalledStateCompatibility(store, candidate.digest).catch(() => null))
    }
    const activeLine = current ? compatibility.get(current.digest) : null
    const operation = current?.operation
    const pending = queued && operation?.id !== queued.input.operationId
    const busy = operation?.state === "running" || !!pending
    const items = candidates.map(candidate => {
      const member = candidate.graph.packages.find(item => item.name === "@cosmos/release")
      const active = candidate.digest === current?.digest
      const previousSuccessful = candidate.digest === previous?.digest
      const line = compatibility.get(candidate.digest) ?? null
      const supported = member?.environments.some(part => part.env === "server" && part.outputs.some(output => output.artifact === "." && output.kind === "entry-point"))
      const disabled = busy ? "Переключение уже выполняется" : active ? "Этот выпуск уже выбран" : !supported ? "Нет server-части Release"
        : !line || !activeLine ? "Совместимость сохранённых данных не подтверждена"
          : line !== activeLine ? "Форматы сохранённых данных несовместимы" : null
      const reason = disabled ?? (!previousSuccessful ? "Это не предыдущий подтверждённый выпуск"
        : !line || !activeLine || previous?.compatibility !== line ? "Совместимость сохранённых данных не подтверждена"
          : line !== activeLine ? "Форматы сохранённых данных несовместимы" : null)
      return {digest: candidate.digest, version: member?.version ?? "—", active, previousSuccessful, compatibilityLine: line,
        activate: {allowed: !disabled, ...(disabled ? {reason: disabled} : {})},
        downgrade: {allowed: !reason, ...(reason ? {reason} : {})}}
    }).sort((a, b) => Number(b.active) - Number(a.active) || Number(b.previousSuccessful) - Number(a.previousSuccessful) || a.digest.localeCompare(b.digest))
    const selected = items.find(item => item.active)
    return {...activation, active: current ? {digest: current.digest, version: selected?.version ?? "—"} : null, candidates: items}
  }

  async function fetch(request: Request, host: Host): Promise<Response> {
    try {authorizeAgentRequest(request, host)} catch {return new Response(null, {status: 403})}
    if (new URL(request.url).search) return new Response(null, {status: 400})
    if (request.method === "GET") {
      const view = request.headers.get(RELEASE_MANAGEMENT_VIEW_HEADER)
      if (view !== null && view !== RELEASE_MANAGEMENT_ACTIVATION_VIEW) return new Response(null, {status: 400})
      return Response.json(view === RELEASE_MANAGEMENT_ACTIVATION_VIEW ? await readStatus() : await read(), {headers: {
        "Cache-Control": "no-store", "X-Cosmos-Store-Identity": await installedReleaseStoreIdentity(options.storeRoot),
      }})
    }
    if (request.method !== "POST") return new Response(null, {status: 405})
    const expectedStore = request.headers.get("X-Cosmos-Store-Identity")
    if (expectedStore !== null && expectedStore !== await installedReleaseStoreIdentity(options.storeRoot))
      return Response.json({error: "Владелец работающего выпуска не совпадает с выбранным хранилищем"}, {status: 409})
    if (accepting) return Response.json({error: "Проверка выбора уже выполняется"}, {status: 409})
    accepting = true
    try {
      const input = await readRequest(request)
      const active = await store.readActivation()
      const previous = active?.operation
      reconcile(previous)
      if (previous?.id === input.operationId) {
        if (previous.kind !== input.kind || input.target !== undefined && previous.target !== input.target ||
          previous.expected.digest !== input.expected.digest || previous.expected.revision !== input.expected.revision)
          return Response.json({error: "Identity операции уже использована для другого выбора"}, {status: 409})
        return accepted(input.operationId)
      }
      if (queued?.input.operationId === input.operationId) {
        if (JSON.stringify(queued.input) !== JSON.stringify(input)) return new Response(null, {status: 409})
        return accepted(input.operationId)
      }
      if (previous?.state === "running" || queued && previous?.id !== queued.input.operationId)
        return Response.json({error: "Переключение уже выполняется"}, {status: 409})
      const selection = await prepareInstalledReleaseSelection(options.storeRoot,
        input.kind === "activate" ? {kind: "activate", target: input.target!} : {kind: "downgrade"})
      if (selection.expected.digest !== input.expected.digest || selection.expected.revision !== input.expected.revision ||
        input.target !== undefined && selection.target !== input.target)
        return Response.json({error: "Текущий выбор изменился. Обновите список"}, {status: 409})
      await verifyInstalledReleaseSelection(options.storeRoot, selection, {compatible: true})
      const intent = {input, selection}
      queued = intent
      options.defer(async () => {
        try {await options.request(selection, input.operationId)}
        catch (error) {if (queued === intent) queued = {...intent, error: publicFailure(error instanceof Error ? error.message : String(error))}}
      })
      return accepted(input.operationId)
    } catch (error) {
      return Response.json({error: publicFailure(error instanceof Error ? error.message : String(error))}, {status: 409})
    } finally {accepting = false}
  }
  return {read, readStatus, fetch}
}

function accepted(operationId: string) {return Response.json({operationId, state: "accepted"}, {status: 202, headers: {"Cache-Control": "no-store"}})}

function publicFailure(message: string) {
  if (/compatibility|persisted-state/i.test(message)) return "Совместимость сохранённых данных не подтверждена"
  if (/changed|another selection/i.test(message)) return "Текущий выбор изменился. Обновите список"
  if (/previous successfully|previous successful/i.test(message)) return "Нет подтверждённого предыдущего выпуска"
  if (/corrupt|missing|not ready/i.test(message)) return "Артефакты выпуска недоступны или повреждены"
  if (/already selected/i.test(message)) return "Этот выпуск уже выбран"
  return "Startup не подтвердил переключение. Проверьте журнал MetaFor"
}

async function readRequest(request: Request): Promise<ReleaseManagementRequest> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") throw new Error("Invalid request")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Invalid request")
  const timer = setTimeout(() => {void reader.cancel().catch(() => {})}, 5000)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > 8192) {await reader.cancel(); throw new Error("Request too large")}
      chunks.push(item.value)
    }
  } finally {clearTimeout(timer); reader.releaseLock()}
  const value = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
  const expected = value?.expected as Record<string, unknown> | null
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    !["expected,kind,operationId", "expected,kind,operationId,target"].includes(Object.keys(value).sort().join()) ||
    typeof value.operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(value.operationId) ||
    value.kind !== "activate" && value.kind !== "downgrade" ||
    value.kind === "activate" && !isReleaseDigest(value.target) || value.target !== undefined && !isReleaseDigest(value.target) ||
    !expected || typeof expected !== "object" || Array.isArray(expected) || Object.keys(expected).sort().join() !== "digest,revision" ||
    expected.digest !== null && !isReleaseDigest(expected.digest) || !Number.isSafeInteger(expected.revision) || Number(expected.revision) < 0)
    throw new Error("Invalid request")
  return {operationId: value.operationId, kind: value.kind,
    ...(value.target === undefined ? {} : {target: value.target as string}), expected: {digest: expected.digest as string | null, revision: Number(expected.revision)}}
}
