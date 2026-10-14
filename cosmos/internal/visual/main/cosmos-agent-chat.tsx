import {useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {observeElementLayout} from "@zavx0z/immersive"
import {Button, Panel, SelectField, TextField, Typography} from "@zavx0z/immersive/ui"
import Conversations from "@zavx0z/chat/conversations"
import Header from "@zavx0z/chat/header"
import ChatView from "@zavx0z/storybook-chat-view"
import {ChatTimeline} from "@zavx0z/storybook-chat-view/timeline"
import HistoryView from "@zavx0z/chat/history/view"
import {createAgentChatHistory} from "@metafor/agent/chat-history"
import type {AtomChatMessage} from "@metafor/agent/atom"
import type {CosmosAgentProfile, CosmosAgentProfileUpdate, CosmosAgentScope} from "@metafor/types/cosmos/agent-profile"
import type {CosmosConversationClient, CosmosConversationSnapshot, CosmosLegacyChatView} from "./agent-workspace-types"
import {createCosmosConversationHistory} from "./cosmos-agent-chat-history"
import {ProviderBrowserLogin, isBrowserProviderConnection} from "./provider-browser-login"
import type {ProviderBrowserAccess} from "./provider-hud"

export type CosmosAgentChatProps = Readonly<{
  actorScope: CosmosAgentScope
  client: CosmosConversationClient
  profile: CosmosAgentProfile
  connections: readonly Readonly<{id: string; label: string; enabled: boolean}>[]
  providerAccess?: ProviderBrowserAccess | undefined
  onProfileChange?: ((update: CosmosAgentProfileUpdate) => Promise<CosmosAgentProfile | void>) | undefined
  /** Host может явно задать visibility; иначе используется фактическая раскладка существующего элемента. */
  visible?: boolean | undefined
  /** Разрешает подключить сессию модели у явно открытого выбранного чата; сама видимость истории этого не разрешает. */
  nativePreparationActive?: boolean | undefined
  /** Новый id — одноразовый выбор созданной беседы; ручная selection после него сохраняется. */
  selectedSessionId?: string | undefined
}>

/**
Беседы над Agent в [Visual](../README.md#совместная-работа-с-клиентом).
Использует общий Conversations/Header/ChatView без Workbench и Quantum actions.
Клиент назначает Window; canonical sessions и имя/пол принадлежат Cosmos backend.
Скрытие освобождает bounded history и чтения, не отменяя принятый server turn.
*/
export function CosmosAgentChat(props: CosmosAgentChatProps) {
  const scopeKey = JSON.stringify([props.actorScope.verseId, props.actorScope.atomRef, props.actorScope.agentRef])
  return <section
    data-cosmos-agent-ref={props.actorScope.agentRef}
    style={css`
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: transparent;
    `}
  >
    <CosmosAgentChatContent
      key={scopeKey}
      actorScope={props.actorScope}
      client={props.client}
      profile={props.profile}
      connections={props.connections}
      providerAccess={props.providerAccess}
      onProfileChange={props.onProfileChange}
      visible={props.visible}
      nativePreparationActive={props.nativePreparationActive}
      selectedSessionId={props.selectedSessionId}
    />
  </section>
}

function CosmosAgentChatContent(props: CosmosAgentChatProps) {
  const history = useMemo(() => createCosmosConversationHistory(props.client), [props.client])
  const window = useSyncExternalStore(history.subscribe, history.getSnapshot)
  const [sessions, setSessions] = useState<readonly CosmosConversationSnapshot[]>([])
  const [snapshot, setSnapshot] = useState<CosmosConversationSnapshot | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [readError, setReadError] = useState("")
  const [visible, setVisible] = useState(props.visible ?? false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [browserOpenRequest, setBrowserOpenRequest] = useState(0)
  const [legacy, setLegacy] = useState<CosmosLegacyChatView | null>(null)
  const [legacyError, setLegacyError] = useState("")
  const [showLegacy, setShowLegacy] = useState(false)
  const host = useRef<HTMLElement | null>(null)
  const selected = useRef<CosmosConversationSnapshot | null>(null)
  const drafts = useRef(new Map<string, string>())
  const sends = useRef(new Map<string, {text: string; requestId: string}>())
  const alive = useRef(true), working = useRef(false), epoch = useRef(0)
  const reading = useRef<AbortController | null>(null)
  const selectedHint = useRef<string | undefined>(undefined)
  const streamed = useRef<CosmosConversationSnapshot | null>(null)
  const sameScope = props.client.scope.verseId === props.actorScope.verseId && props.client.scope.atomRef === props.actorScope.atomRef && props.client.scope.agentRef === props.actorScope.agentRef
  const accept = (next: CosmosConversationSnapshot, changeSelection = false) => {
    if (!alive.current) return
    if (next.id !== next.sessionId) throw new Error("Identity беседы не подтверждена")
    const latest = streamed.current
    if (!changeSelection && latest?.id === next.id && next.history.revision <= latest.history.revision && next.version < latest.version) next = latest
    if (changeSelection && selected.current?.id !== next.id) setDraft(drafts.current.get(next.id) ?? "")
    selected.current = next
    setSnapshot(next)
    setSessions(values => values.some(value => value.id === next.id) ? values.map(value => value.id === next.id ? next : value) : [...values, next])
    history.accept(next)
  }
  useLayoutEffect(() => {
    if (props.visible !== undefined) {setVisible(props.visible); return}
    return host.current ? observeElementLayout(host.current, rect => setVisible(rect !== null && rect.width > 0 && rect.height > 0)) : undefined
  }, [props.visible])
  useEffect(() => {
    alive.current = true
    return () => {alive.current = false; epoch.current++; reading.current?.abort(); history.dispose(); props.client.dispose()}
  }, [history, props.client])
  useEffect(() => {
    history.setActive(visible)
    if (!visible || !sameScope) return
    let stopped = false
    const refresh = async (catalog = false) => {
      if (stopped || working.current || reading.current || (!selected.current && props.selectedSessionId)) return
      const controller = new AbortController(), generation = epoch.current
      reading.current = controller
      try {
        const items = catalog ? await props.client.list(controller.signal) : undefined
        if (items && items.length > 256) throw new Error("Каталог бесед превысил допустимый размер")
        const id = selected.current?.id ?? items?.[0]?.id
        const next = await props.client.read(id, controller.signal)
        if (stopped || !alive.current || controller.signal.aborted || epoch.current !== generation) return
        if (items) setSessions(items)
        accept(next, selected.current?.id !== next.id)
        setReadError("")
      } catch (failure) {if (!stopped && alive.current && !controller.signal.aborted && epoch.current === generation) setReadError(String(failure))}
      finally {if (reading.current === controller) reading.current = null}
    }
    void refresh(true)
    return () => {stopped = true; reading.current?.abort(); reading.current = null; history.setActive(false)}
  }, [props.client, history, visible, sameScope])
  useEffect(() => {
    const id = snapshot?.sessionId
    if (!visible || !sameScope || !id) return
    streamed.current = null
    let active = true
    const receive = (value: CosmosConversationSnapshot) => {
      if (!active || !alive.current || selected.current?.sessionId !== id) return
      if (value.sessionId !== id) {setReadError("Получен поток другой беседы"); return}
      streamed.current = value
      accept(value)
      setReadError("")
    }
    const failure = (error: Error) => {
      if (active && alive.current) {streamed.current = null; setReadError(error.message)}
    }
    let release: (() => void) | undefined
    try {release = props.client.subscribe(id, receive, failure)} catch (error) {failure(error instanceof Error ? error : new Error(String(error)))}
    return () => {active = false; streamed.current = null; release?.()}
  }, [props.client, visible, sameScope, snapshot?.sessionId])
  useEffect(() => {
    if (!visible || !sameScope) {setLegacy(null); return}
    const controller = new AbortController()
    void props.client.legacy(controller.signal).then(value => {
      if (!controller.signal.aborted && alive.current) {setLegacy(value); setLegacyError("")}
    }, failure => {if (!controller.signal.aborted && alive.current) setLegacyError(`Архив недоступен: ${String(failure)}`)})
    return () => controller.abort()
  }, [props.client, visible, sameScope])
  useEffect(() => {
    const id = props.selectedSessionId
    if (!id || !visible || !sameScope || selectedHint.current === id) return
    selectedHint.current = id
    const generation = ++epoch.current, controller = new AbortController()
    let accepted = false
    reading.current?.abort()
    reading.current = controller
    setBusy(true)
    void (async () => {
      try {
        const items = await props.client.list(controller.signal)
        if (alive.current && !controller.signal.aborted && epoch.current === generation) setSessions(items)
        if (!items.some(value => value.sessionId === id)) throw new Error("Выбранная беседа отсутствует в каталоге этого агента")
        const next = await props.client.read(id, controller.signal)
        if (!alive.current || controller.signal.aborted || epoch.current !== generation) return
        setSessions(items)
        accept(next, true)
        setShowLegacy(false)
        accepted = true
        setError(""); setReadError("")
      } catch (failure) {if (alive.current && !controller.signal.aborted && epoch.current === generation) setError(String(failure))}
      finally {if (reading.current === controller) {reading.current = null; if (alive.current) setBusy(false)}}
    })()
    return () => {controller.abort(); if (!accepted && epoch.current === generation) selectedHint.current = undefined}
  }, [props.client, props.selectedSessionId, visible, sameScope])
  const action = async (run: () => Promise<void>) => {
    if (working.current || !sameScope) return
    working.current = true
    epoch.current++
    reading.current?.abort()
    reading.current = null
    setBusy(true)
    try {await run(); if (alive.current) {setError(""); setReadError("")}}
    catch (failure) {if (alive.current) setError(failure instanceof Error ? failure.message : String(failure)); throw failure}
    finally {working.current = false; if (alive.current) setBusy(false)}
  }
  const current = () => {if (!selected.current) throw new Error("Беседа ещё не выбрана"); return selected.current}
  const rename = (id: string, label: string) => action(async () => {
    const next = await props.client.rename(id, label)
    if (selected.current?.id === id) accept(next)
    else setSessions(values => values.map(value => value.id === id ? next : value))
  })
  const send = () => action(async () => {
    const value = current(), text = draft.trim()
    if (!text || text.length > 64_000) throw new Error("Сообщение должно содержать от 1 до 64000 символов")
    let identity = sends.current.get(value.id)
    if (identity && identity.text !== text) throw new Error("Исход прежней отправки не подтверждён; повторите исходный текст перед новой отправкой")
    if (!identity) {identity = {text, requestId: crypto.randomUUID()}; sends.current.set(value.id, identity)}
    const next = await props.client.prompt(value.id, text, identity.requestId)
    sends.current.delete(value.id)
    drafts.current.delete(value.id)
    if (selected.current?.id === value.id) {setDraft(""); accept(next)}
  })
  const execution = snapshot?.execution ? {...snapshot.execution, connections: snapshot.execution.connections.map(connection => {
    const option = props.connections.find(value => value.id === connection.id)
    return option ? {...connection, label: option.label, enabled: connection.enabled && option.enabled} : connection
  })} : undefined
  const chatError = error || readError || snapshot?.error || ""
  const browserConnection = isBrowserProviderConnection(props.providerAccess, snapshot?.execution?.effective.connectionId)
  return <section
    ref={element => {host.current = element}}
    data-cosmos-agent-chat={props.actorScope.agentRef}
    style={css`
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      gap: 8px;
      background: transparent;
    `}
  >
    <Panel label="Настройки агента" expanded={settingsOpen} onToggle={value => {setSettingsOpen(value); if (!value) setBrowserOpenRequest(0)}}>
      {settingsOpen ? <CosmosAgentSettings
        profile={props.profile}
        onProfileChange={props.onProfileChange}
        connections={props.connections}
        providerAccess={props.providerAccess}
        selectedConnectionId={snapshot?.execution?.effective.connectionId}
        openBrowserRequest={browserOpenRequest}
        visible={visible}
        onConnectionChange={connectionId => {
          if (selected.current) void action(async () => accept(await props.client.configureExecution(current().id, {...current().execution?.selection, connectionId}))).catch(() => {})
        }}
      /> : null}
    </Panel>
    <div style={css`
      display: flex;
      flex-direction: row;
      flex: 1;
      min-height: 0;
      gap: 8px;
    `}>
      <div style={css`
        flex: 0 0 220px;
        min-width: 0;
        overflow-y: auto;
      `}>
        <Conversations
          items={sessions.map(value => ({id: value.sessionId, title: value.sessionLabel}))}
          selectedId={showLegacy ? undefined : snapshot?.sessionId}
          busy={busy || !sameScope}
          onSelect={id => {void action(async () => {accept(await props.client.read(id), true); setShowLegacy(false)}).catch(() => {})}}
          onCreate={() => action(async () => {
            if (sessions.length >= 256) throw new Error("Каталог содержит 256 бесед; новая беседа не создана")
            accept(await props.client.create(), true)
            setShowLegacy(false)
          })}
          onRename={rename}
          onDelete={id => action(async () => {
            await props.client.delete(id)
            drafts.current.delete(id)
            sends.current.delete(id)
            const items = await props.client.list()
            setSessions(items)
            if (selected.current?.id === id) accept(await props.client.read(items[0]?.sessionId), true)
          })}
        />
        {legacy ? <Button label="Архив прежней беседы" selected={showLegacy} disabled={busy} onClick={() => {setShowLegacy(true); history.setActive(false)}} /> : null}
        {legacyError ? <Typography text={legacyError} /> : null}
      </div>
      <div style={css`
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
      `}>
        {snapshot && !showLegacy ? <Header id={snapshot.sessionId} title={snapshot.sessionLabel} busy={busy} onRename={label => rename(snapshot.sessionId, label)} /> : null}
        {showLegacy ? <LegacyCosmosConversation identity={`legacy:${legacy?.record.source.digest ?? props.actorScope.agentRef}`} messages={legacy?.messages ?? null} error={legacyError} /> : null}
        {!showLegacy && snapshot ? <ChatView
          address={snapshot.address}
          label={props.profile.name}
          executorId={snapshot.executorId}
          history={window}
          onHistoryViewport={history.viewport}
          onHistoryVisible={value => history.setActive(visible && value)}
          onHistoryExpand={history.expand}
          onHistoryRetry={history.retry}
          onHistoryRetryPage={history.retryPage}
          onHistoryEvidence={(id, after) => {void history.evidence(id, after)}}
          onHistoryTail={history.tail}
          createGroupHistory={history.createGroupHistory}
          readHistoryContent={(id, cursor, signal) => props.client.historyContent(snapshot.id, id, {cursor}, signal)}
          readHistoryDetail={(id, offset, signal, evidenceId) => props.client.historyDetail(snapshot.id, id, {offset, ...(evidenceId === undefined ? {} : {evidenceId})}, signal)}
          readHistoryTerminal={(id, cursor, signal) => props.client.historyTerminal(snapshot.id, id, {cursor}, signal)}
          status={snapshot.status}
          activity={snapshot.activity}
          pendingTasks={snapshot.pending.length}
          draft={draft}
          sending={busy}
          error={chatError || undefined}
          settings={snapshot.settings}
          execution={execution}
          configuring={snapshot.configuring || busy}
          progress={snapshot.progress}
          usage={snapshot.usage}
          permissions={snapshot.permissions}
          onDraftChange={value => {if (value.length <= 64_000) {setDraft(value); if (snapshot) drafts.current.set(snapshot.id, value)}}}
          onSend={() => {void send().catch(() => {})}}
          onCancel={() => {void action(async () => accept(await props.client.cancel(current().id))).catch(() => {})}}
          onStop={() => {void action(async () => accept(await props.client.stop(current().id))).catch(() => {})}}
          onPermission={(id, optionId) => action(async () => accept(await props.client.permission(current().id, id, optionId)))}
          onPrepareSettings={visible && props.nativePreparationActive === true ? () => {void action(async () => accept(await props.client.prepare(current().id))).catch(() => {})} : undefined}
          onConfigure={(id, value) => {void action(async () => accept(await props.client.configure(current().id, id, value))).catch(() => {})}}
          onExecutionChange={selection => {void action(async () => accept(await props.client.configureExecution(current().id, selection))).catch(() => {})}}
        /> : null}
        {!showLegacy && chatError && browserConnection ? <ProviderBrowserRecoveryAction onOpen={() => {
          setSettingsOpen(true)
          setBrowserOpenRequest(value => value + 1)
        }} /> : null}
        {!showLegacy && !snapshot ? <Typography text={sameScope ? error || readError || "Загрузка бесед…" : "Клиент принадлежит другому Agent"} /> : null}
      </div>
    </div>
  </section>
}

/** Только существующая public history reuse цепь; composer и native continuation отсутствуют. */
function LegacyCosmosConversation(props: Readonly<{identity: string; messages: readonly AtomChatMessage[] | null; error: string}>) {
  const history = useMemo(() => createAgentChatHistory(), [props.identity])
  const value = useSyncExternalStore(history.subscribe, history.getSnapshot)
  useEffect(() => {history.present(props.identity, props.messages ?? [])}, [history, props.identity, props.messages])
  useEffect(() => () => history.dispose(), [history])
  const timeline = history.timeline(value)
  return <section data-cosmos-legacy-chat="" style={css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  `}>
    <Typography text={props.error || (props.messages ? "Архив прежней беседы · только чтение" : "Чтение архива прежней беседы…")} />
    <HistoryView identity={props.identity} history={timeline.history} onViewport={timeline.onHistoryViewport} onVisible={timeline.onHistoryVisible} onTail={timeline.onHistoryTail} onRetry={timeline.onHistoryRetryPage}>
      <ChatTimeline view={timeline} />
    </HistoryView>
  </section>
}

function CosmosAgentProfileEditor(props: Readonly<{profile: CosmosAgentProfile; onChange: CosmosAgentChatProps["onProfileChange"]}>) {
  const [draft, setDraft] = useState<CosmosAgentProfileUpdate | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState("")
  const working = useRef(false)
  const update = (value: Partial<Pick<CosmosAgentProfileUpdate, "name" | "gender">>) => setDraft(current => ({expectedRevision: props.profile.revision,
    name: props.profile.name, gender: props.profile.gender, ...current, ...value}))
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    <TextField label="Имя агента" value={draft?.name ?? props.profile.name} disabled={busy || !props.onChange} onInput={name => update({name})} />
    <SelectField label="Пол" value={draft?.gender ?? props.profile.gender} disabled={busy || !props.onChange}
      options={[{key: "male", value: "male", label: "Мужской"}, {key: "female", value: "female", label: "Женский"}]}
      onChange={gender => {if (gender === "male" || gender === "female") update({gender})}}
    />
    {draft ? <CosmosAgentProfileActions
      busy={busy}
      disabled={!draft.name.trim() || !props.onChange}
      onCancel={() => {setDraft(null); setError("")}}
      onSave={() => {
        if (working.current || !props.onChange) return
        working.current = true
        setBusy(true)
        void props.onChange({...draft, name: draft.name.trim()}).then(() => {setDraft(null); setError("")}, cause => setError(String(cause))).finally(() => {working.current = false; setBusy(false)})
      }}
    /> : null}
    {error ? <Typography text={error} /> : null}
  </section>
}

function CosmosAgentProfileActions(props: Readonly<{busy: boolean; disabled: boolean; onSave(): void; onCancel(): void}>) {
  return <div>
    <Button label="Отменить настройки агента" disabled={props.busy} onClick={props.onCancel} />
    <Button label="Сохранить настройки агента" disabled={props.busy || props.disabled} onClick={props.onSave} />
  </div>
}

function CosmosAgentSettings(props: Readonly<{
  profile: CosmosAgentProfile
  onProfileChange: CosmosAgentChatProps["onProfileChange"]
  connections: CosmosAgentChatProps["connections"]
  providerAccess: ProviderBrowserAccess | undefined
  selectedConnectionId: string | undefined
  openBrowserRequest: number
  visible: boolean
  onConnectionChange(id: string): void
}>) {
  const [connectionId, setConnectionId] = useState(props.selectedConnectionId ?? "")
  useEffect(() => {if (props.selectedConnectionId) setConnectionId(props.selectedConnectionId)}, [props.selectedConnectionId, props.openBrowserRequest])
  return <section>
    <CosmosAgentProfileEditor profile={props.profile} onChange={props.onProfileChange} />
    <SelectField
      label="Подключение агента"
      value={connectionId}
      options={[{key: "unselected", value: "", label: "Выберите подключение"}, ...props.connections.filter(value => value.enabled).map(value => ({key: value.id, value: value.id, label: value.label}))]}
      onChange={value => {setConnectionId(value); props.onConnectionChange(value)}}
    />
    {props.providerAccess ? <ProviderBrowserLogin
      access={props.providerAccess}
      connectionId={connectionId}
      visible={props.visible}
      openRequest={props.openBrowserRequest}
    /> : null}
  </section>
}

function ProviderBrowserRecoveryAction(props: Readonly<{onOpen(): void}>) {
  return <section
    data-provider-browser-recovery=""
    style={css`
      display: flex;
      flex-shrink: 0;
      padding-top: 8px;
    `}
  >
    <Button label="Открыть браузер провайдера" onClick={props.onOpen} />
  </section>
}
