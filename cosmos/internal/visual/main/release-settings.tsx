import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {Button, Typography} from "@zavx0z/immersive/ui"

import type {ReleaseManagementSnapshot, ReleaseManagementClient} from "../../../release/shared/management"
export type {ReleaseManagementSnapshot} from "../../../release/shared/management"
export type ReleaseSettingsClient = ReleaseManagementClient

type State = Readonly<{snapshot: ReleaseManagementSnapshot | null; fresh: boolean; pending: string | null; error: string}>
type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const pendingKey = "cosmos.release.pending-operation"

/** Pending переживает UI remount; потерянный ответ не разрешает повторную отправку. Только terminal snapshot завершает ожидание. */
export function createReleaseSettingsController(client: ReleaseSettingsClient, storage?: PendingStorage) {
  const lifetime = new AbortController()
  let state: State = {snapshot: null, fresh: false, pending: storedPending(storage), error: ""}
  let reading: Promise<void> | undefined
  const listeners = new Set<(state: State) => void>()
  const publish = (patch: Partial<State>) => {
    if (lifetime.signal.aborted) return
    state = {...state, ...patch}
    for (const listener of listeners) listener(state)
  }
  const retain = (operationId: string | null) => {
    try {
      if (operationId) storage?.setItem(pendingKey, operationId)
      else storage?.removeItem(pendingKey)
    } catch {}
  }
  const refresh = (): Promise<void> => {
    if (lifetime.signal.aborted) return Promise.resolve()
    if (reading) return reading
    reading = (async () => {
      try {
        const snapshot = await client.read(lifetime.signal)
        if (lifetime.signal.aborted) return
        let pending = state.pending
        const operation = snapshot.operation
        if (operation?.state === "accepted" || operation?.state === "unknown" || operation?.state === "running") pending ??= operation.id
        if (operation?.id === pending && (operation.state === "complete" || operation.state === "failed")) pending = null
        retain(pending)
        const unknownOutcome = pending !== null && operation?.id !== pending
        const error = unknownOutcome ? state.error : operation?.state === "unknown" ? operation.error ?? ""
          : operation?.state === "failed" ? operation.error ?? "Не удалось сменить сборку" : ""
        publish({snapshot, fresh: true, pending, error})
      } catch (cause) {
        publish({fresh: false, error: `Состояние недоступно: ${errorText(cause)}`})
      }
    })().finally(() => {reading = undefined})
    return reading
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: (state: State) => void) {
      listeners.add(listener)
      return () => {listeners.delete(listener)}
    },
    refresh,
    async request(kind: "activate" | "downgrade", target: string) {
      const snapshot = state.snapshot
      if (!snapshot || !state.fresh || state.pending || lifetime.signal.aborted) return
      const candidate = snapshot.candidates.find(item => item.digest === target)
      if (!candidate?.[kind].allowed) return
      const operationId = crypto.randomUUID()
      retain(operationId)
      publish({pending: operationId, error: ""})
      try {
        const response = await client.request({operationId, kind, target,
          expected: {digest: snapshot.active?.digest ?? null, revision: snapshot.revision}}, lifetime.signal)
        if (response.operationId === operationId && response.state === "rejected") {
          retain(null)
          publish({pending: null, fresh: false})
          await refresh()
          publish({error: `Запрос отклонён: ${response.error}`})
          return
        }
        if (response.operationId !== operationId || response.state !== "accepted") throw new Error("Неверное подтверждение запроса")
      } catch (cause) {
        publish({fresh: false, error: `Ответ не получен: ${errorText(cause)}. Проверяем состояние без повторной отправки.`})
      }
      // Accepted подтверждает получение, а завершение показывает только новое чтение.
      await refresh()
    },
    destroy() {lifetime.abort(); listeners.clear()},
  }
}

function storedPending(storage?: PendingStorage) {
  try {return storage?.getItem(pendingKey) ?? null} catch {return null}
}
function browserStorage(): PendingStorage | undefined {
  try {return globalThis.sessionStorage} catch {return undefined}
}
function errorText(cause: unknown) {return cause instanceof Error ? cause.message : String(cause)}

/** Содержимое третьего раздела существующего ExecutionSettings; собственного Window, Document или runtime не создаёт. */
export function ReleaseSettings(props: Readonly<{active: boolean; client?: ReleaseSettingsClient | undefined}>) {
  const controller = useMemo(() => props.client ? createReleaseSettingsController(props.client, browserStorage()) : null, [props.client])
  const [state, setState] = useState<State>({snapshot: null, fresh: false, pending: null, error: ""})
  useEffect(() => {
    if (!controller) return
    setState(controller.getSnapshot())
    const unsubscribe = controller.subscribe(setState)
    return () => {unsubscribe(); controller.destroy()}
  }, [controller])
  useEffect(() => {
    if (!controller || !props.active) return
    let unknownAttempts = 0
    const refresh = () => {
      if (globalThis.document?.hidden) return
      unknownAttempts = 0
      void controller.refresh()
    }
    refresh()
    globalThis.addEventListener?.("online", refresh)
    globalThis.document?.addEventListener("visibilitychange", refresh)
    // Во время смены release наблюдение может оборваться. Повторяется только read.
    const timer = setInterval(() => {
      if (globalThis.document?.hidden) return
      const current = controller.getSnapshot()
      const unknownOutcome = current.pending !== null && current.snapshot?.operation?.id !== current.pending
      if (unknownOutcome && unknownAttempts >= 30) return
      if (!unknownOutcome) unknownAttempts = 0
      if (current.pending || !current.fresh) {
        if (unknownOutcome) unknownAttempts++
        void controller.refresh()
      }
    }, 1000)
    return () => {
      clearInterval(timer)
      globalThis.removeEventListener?.("online", refresh)
      globalThis.document?.removeEventListener("visibilitychange", refresh)
    }
  }, [controller, props.active])
  return <section
    aria-label="Сборки и откат"
    data-release-settings=""
    style={css`
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
    `}
  >
    <Typography text="Сборки и откат" />
    {props.client ? <ReleaseSettingsContent state={state} controller={controller} /> : <Typography text="Управление сборками недоступно в этой среде." />}
  </section>
}

function ReleaseSettingsContent(props: Readonly<{
  state: State
  controller: ReturnType<typeof createReleaseSettingsController> | null
}>) {
  const {state, controller} = props
  const snapshot = state.snapshot
  const locked = !state.fresh || state.pending !== null
  const status = snapshot?.operation
  const unknownOutcome = state.pending !== null && status?.id !== state.pending
  const operationLabel = unknownOutcome || status?.state === "unknown" ? "Подтверждение этой операции не получено; выполняется только чтение состояния"
    : status?.state === "complete" ? "Смена сборки завершена"
    : status?.state === "failed" ? "Смена сборки не выполнена"
    : state.pending ? status?.state === "running" ? "Сборка меняется…" : "Запрос ожидает завершения…" : ""
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 14px;
  `}>
    <Typography text={snapshot?.active ? `Текущая сборка: ${snapshot.active.version}` : snapshot ? "Активная сборка не выбрана" : "Читаем установленные сборки…"} />
    <Button label="Обновить состояние" onClick={() => {void controller?.refresh()}} />
    {operationLabel ? <Typography text={operationLabel} /> : null}
    {state.pending || status ? <Typography text={`Операция: ${state.pending ?? status!.id}`} /> : null}
    {status && !unknownOutcome ? <Typography text={`Целевой выпуск: ${status.target}`} /> : null}
    {state.error ? <Typography text={state.error} /> : null}
    {state.pending ? <Typography text="Во время перезапуска связь может прерваться. Состояние обновится после подключения." /> : null}
    {(snapshot?.candidates ?? []).map(candidate => <ReleaseCandidate
      key={candidate.digest}
      candidate={candidate}
      locked={locked}
      controller={controller}
    />)}
  </section>
}

function ReleaseCandidate(props: Readonly<{
  candidate: ReleaseManagementSnapshot["candidates"][number]
  locked: boolean
  controller: ReturnType<typeof createReleaseSettingsController> | null
}>) {
  const {candidate} = props
  return <section
    data-release-candidate={candidate.digest}
    style={css`
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border: 1px solid rgb(var(--surface-600) / 0.5);
      border-radius: 6px;
    `}
  >
    <Typography text={candidate.version} />
    <Typography text={candidate.active ? "Текущая" : candidate.previousSuccessful ? "Предыдущая успешно запущенная" : "Подготовленная"} />
    <Typography text={candidate.digest} />
    <Typography text={candidate.compatibilityLine ? `Совместимость данных: ${candidate.compatibilityLine}` : "Совместимость данных неизвестна"} />
    {!candidate.active ? <ReleaseCandidateActions candidate={candidate} locked={props.locked} controller={props.controller} /> : null}
  </section>
}

function ReleaseCandidateActions(props: Readonly<{
  candidate: ReleaseManagementSnapshot["candidates"][number]
  locked: boolean
  controller: ReturnType<typeof createReleaseSettingsController> | null
}>) {
  const {candidate, locked, controller} = props
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    <Button
      label={`Активировать ${candidate.version}`}
      disabled={locked || !candidate.activate.allowed}
      onClick={() => {void controller?.request("activate", candidate.digest)}}
    />
    {!candidate.activate.allowed && candidate.activate.reason ? <Typography text={candidate.activate.reason} /> : null}
    <Button
      label={`Вернуться к ${candidate.version}`}
      disabled={locked || !candidate.downgrade.allowed}
      onClick={() => {void controller?.request("downgrade", candidate.digest)}}
    />
    {!candidate.downgrade.allowed && candidate.downgrade.reason ? <Typography text={candidate.downgrade.reason} /> : null}
  </section>
}
