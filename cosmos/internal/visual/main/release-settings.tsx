import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {Button, Panel, Typography} from "@zavx0z/immersive/ui"

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const locked = !state.fresh || state.pending !== null
  const status = snapshot?.operation
  const unknownOutcome = state.pending !== null && status?.id !== state.pending
  const candidates = snapshot?.candidates ?? []
  const active = candidates.find(candidate => candidate.digest === snapshot?.active?.digest)
  const previous = candidates.find(candidate => candidate.previousSuccessful)
  const compatible = (candidate: ReleaseManagementSnapshot["candidates"][number]) =>
    active?.compatibilityLine !== null && active?.compatibilityLine !== undefined && candidate.compatibilityLine === active.compatibilityLine
  const upgrades = candidates.filter(candidate => !candidate.active && !candidate.previousSuccessful && compatible(candidate)
    && candidate.activate.allowed && compareVersions(candidate.version, snapshot?.active?.version ?? "") > 0)
    .sort((left, right) => compareVersions(right.version, left.version))
  const history = candidates.filter(candidate => !candidate.active && !candidate.previousSuccessful && compatible(candidate)
    && compareVersions(candidate.version, snapshot?.active?.version ?? "") <= 0)
    .sort((left, right) => compareVersions(right.version, left.version))
  const archived = candidates.filter(candidate => !candidate.active && !compatible(candidate)).length
  const operationLabel = unknownOutcome || status?.state === "unknown" ? "Подтверждение этой операции не получено; выполняется только чтение состояния"
    : status?.state === "complete" ? "Смена сборки завершена"
    : status?.state === "failed" ? "Смена сборки не выполнена"
    : state.pending ? status?.state === "running" ? "Сборка меняется…" : "Запрос ожидает завершения…" : ""
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 14px;
  `}>
    <section style={css`
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    `}>
      <Typography text={snapshot?.active ? `Текущая версия: ${snapshot.active.version}` : snapshot ? "Активная версия не выбрана" : "Читаем установленные версии…"} />
      <Button label="Обновить состояние" variant="text" size="small" onClick={() => {void controller?.refresh()}} />
    </section>
    {operationLabel ? <Typography text={operationLabel} /> : null}
    {state.error ? <Typography text={state.error} /> : null}
    {state.pending ? <Typography text="Во время перезапуска связь может прерваться. Состояние обновится после подключения." /> : null}
    {snapshot ? <ReleaseReturn previous={previous} pending={state.pending !== null} locked={locked} controller={controller} /> : null}
    {upgrades.length ? <ReleaseUpdates candidates={upgrades} locked={locked} controller={controller} /> : null}
    {snapshot && !state.pending && !upgrades.length ? <Typography text="Подготовленных совместимых обновлений нет." /> : null}
    <section aria-label="Восстановление из терминала" style={css`
      display: flex;
      flex-direction: column;
      gap: 6px;
    `}>
      <Typography text="Если интерфейс не открывается, выполните в терминале:" />
      <code>metafor downgrade</code>
      <Typography text="Меняется версия программы. Беседы и исходные файлы сохраняют текущее состояние; их прошлые версии не восстанавливаются. Совместимость данных проверяется до переключения." />
    </section>
    {history.length ? <Panel
      label={`Другие совместимые сборки (${history.length})`}
      expanded={historyOpen}
      onToggle={setHistoryOpen}
    >
      {historyOpen ? <ReleaseHistory candidates={history} activeVersion={snapshot?.active?.version ?? ""} locked={locked} controller={controller} /> : null}
    </Panel> : null}
    {archived ? <Typography text={`Архив (${archived}). Совместимость этих сборок с текущими данными не подтверждена.`} /> : null}
    <Panel
      label="Технические подробности"
      expanded={technicalOpen}
      onToggle={setTechnicalOpen}
    >
      {technicalOpen ? <ReleaseTechnical state={state} /> : null}
    </Panel>
  </section>
}

type Candidate = ReleaseManagementSnapshot["candidates"][number]
type Controller = ReturnType<typeof createReleaseSettingsController> | null

function ReleaseReturn(props: Readonly<{previous?: Candidate | undefined; pending: boolean; locked: boolean; controller: Controller}>) {
  const {previous} = props
  return <section aria-label="Возврат рабочей версии" style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid rgb(var(--surface-600) / 0.5);
    border-radius: 6px;
  `}>
    {previous?.downgrade.allowed ? <Button
      label={`Вернуть предыдущую рабочую версию ${previous.version}`}
      tone="primary"
      disabled={props.locked}
      onClick={() => {void props.controller?.request("downgrade", previous.digest)}}
    /> : <Typography text={props.pending
      ? "Дождитесь подтверждения текущего переключения."
      : previous ? "Совместимой точки возврата сейчас нет. Предыдущая рабочая версия недоступна для этих данных."
        : "Точки возврата пока нет. После первого совместимого обновления текущая версия станет предыдущей рабочей."} />}
  </section>
}

function ReleaseUpdates(props: Readonly<{candidates: readonly Candidate[]; locked: boolean; controller: Controller}>) {
  return <section aria-label="Доступные обновления" style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    <Typography text="Подготовленные обновления" />
    {props.candidates.map(candidate => <Button
      key={candidate.digest}
      label={`Установить обновление ${candidate.version}`}
      variant="outlined"
      disabled={props.locked}
      onClick={() => {void props.controller?.request("activate", candidate.digest)}}
    />)}
  </section>
}

function ReleaseHistory(props: Readonly<{candidates: readonly Candidate[]; activeVersion: string; locked: boolean; controller: Controller}>) {
  return <section aria-label="Другие совместимые сборки" style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    {props.candidates.map(candidate => <ReleaseAlternative
      key={candidate.digest}
      candidate={candidate}
      sameVersion={candidate.version === props.activeVersion}
      locked={props.locked}
      controller={props.controller}
    />)}
  </section>
}

function ReleaseAlternative(props: Readonly<{candidate: Candidate; sameVersion: boolean; locked: boolean; controller: Controller}>) {
  return <section>
    {props.candidate.activate.allowed ? <Button
      label={props.sameVersion ? `Установить другой состав ${props.candidate.version}` : `Установить версию ${props.candidate.version}`}
      variant="outlined"
      disabled={props.locked}
      onClick={() => {void props.controller?.request("activate", props.candidate.digest)}}
    /> : <Typography text={props.sameVersion ? `Другой состав ${props.candidate.version}` : `Версия ${props.candidate.version}`} />}
  </section>
}

function ReleaseTechnical(props: Readonly<{state: State}>) {
  return <pre aria-label="Технические данные выпуска" style={css`
    margin: 0;
    font-size: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  `}>{JSON.stringify({pendingOperation: props.state.pending, ...props.state.snapshot}, null, 2)}</pre>
}

/** Только порядок отображения: доступность действий по-прежнему решает owner snapshot. */
function compareVersions(left: string, right: string): number {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (!pattern.test(left) || !pattern.test(right)) return 0
  const a = left.split("."), b = right.split(".")
  for (let index = 0; index < 3; index++) {
    const order = a[index]!.length - b[index]!.length || (a[index]! < b[index]! ? -1 : a[index]! > b[index]! ? 1 : 0)
    if (order) return order
  }
  return 0
}
