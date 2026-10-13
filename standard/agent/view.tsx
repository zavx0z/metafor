import {useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type JSX} from "@zavx0z/immersive/XReact"
import {Button, Typography, Inspector} from "@zavx0z/immersive/ui"
import {iconSvg} from "@zavx0z/immersive/ui/icons"
import {useAtom, type AtomContext, type AtomViewSnapshot} from "./atom"
import StorybookChatView from "@zavx0z/storybook-chat-view"
import {providerPreferences} from "./provider-pane"
import {createAgentChatHistory} from "./chat-history"
import {projectAgentPresentation, type AgentViewTab} from "./presentation"
import type {AgentToolReference} from "@metafor/types/metafor/agents"

const labels = {chat: "Беседа", provider: "Провайдер", tools: "Инструменты", context: "Контекст"} as const
const icons = {
  chat: iconSvg('<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h6"/>'),
  tools: iconSvg('<path d="m14 6 4 4M4 20l8-8M14 3a6 6 0 0 0-5 8L3 17l4 4 6-6a6 6 0 0 0 8-5l-4 2-5-5Z"/>'),
  context: iconSvg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>'),
} as const

/**
Общий Chat и production Inspector [Agent](./README.md) в принимающем Document.
Переданный owning Atom предоставляет snapshots и Environment callbacks.
Категория Inspector, draft и notice локальны view; canonical состояние приходит
subscription. Public Chat ограничивает frontend окно уже полученной Mass; lazy
backend этот adapter не объявляет. Provider pane размещает приложение в HUD.
Именованные outlets chat/tools/context принимают public DOM content.
Компонент не создаёт Canvas, transport или canonical Store; slots не выдают capabilities.
Сценарии compilation/mount — [view tests](./test/view.test.ts).
*/
export function AgentView(props: Readonly<{atom: AtomContext}>): JSX.Element<{
  chat: JSX.Element
  tools: JSX.Element
  context: JSX.Element
}> {
  const atom = useAtom(props.atom)
  const source = useMemo(() => ({
    subscribe: (listener: () => void) => atom.subscribe(listener),
    getSnapshot: () => atom.getSnapshot(),
  }), [atom])
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const presentation = projectAgentPresentation(snapshot.configuration)
  const [tab, setTab] = useState<AgentViewTab>(presentation.defaultTab)
  useEffect(() => {
    setTab(presentation.defaultTab)
  }, [atom])
  return <section
    data-agent-atom={atom.ref}
    aria-label={`Agent ${presentation.id}`}
    style={css`
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      gap: var(--spacing-4);
      padding: var(--spacing-8);
      color: var(--widget-regular-content);
      font-family: var(--font-family);
      background: transparent;
    `}
  >
    <Typography text={`${presentation.id} · ${snapshot.state ?? "состояние не наблюдается"}`} />
    <Inspector
      ariaLabel="Инспектор Agent"
      categoriesLabel="Панели"
      categories={presentation.tabs.filter(item => item !== "provider").map(item => ({id: item, label: labels[item], iconSrc: icons[item], panelIds: [item]}))}
      selectedCategoryId={tab === "provider" ? "chat" : tab}
      query=""
      showSearch={false}
      onCategoryChange={value => setTab(value as AgentViewTab)}
      style={css`
        flex: 1;
        height: auto;
        min-height: 0;
      `}
    >
      <AgentInspectorPanels atom={atom} snapshot={snapshot} tab={tab}>
        <slot name="chat" slot="chat"><AgentChat atom={atom} snapshot={snapshot} /></slot>
        <slot name="tools" slot="tools"><AgentTools atom={atom} snapshot={snapshot} /></slot>
        <slot name="context" slot="context"><AgentContextDetails snapshot={snapshot} /></slot>
      </AgentInspectorPanels>
    </Inspector>

  </section>
}

function AgentInspectorPanels(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot; tab: AgentViewTab}>): JSX.Element<{chat: JSX.Element; tools: JSX.Element; context: JSX.Element}> {
  return <div style={css`display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%;`}>
    <section role="tabpanel" aria-label="Беседа" hidden={props.tab !== "chat"} style={css`display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; &[hidden] {display: none;}`}><slot name="chat" /></section>
    <section role="tabpanel" aria-label="Инструменты" hidden={props.tab !== "tools"}><slot name="tools" /></section>
    <section role="tabpanel" aria-label="Контекст" hidden={props.tab !== "context"}><slot name="context" /></section>
  </div>
}

function AgentContextDetails(props: Readonly<{snapshot: AtomViewSnapshot}>) {
  return <pre
    aria-label="Разрешённый контекст Atom"
    style={css`
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: var(--font-size-md);
    `}
  >{JSON.stringify(props.snapshot.context, null, 2)}</pre>
}

function AgentChat(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot}>) {
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const lifetime = useMemo(() => new AbortController(), [props.atom])
  useEffect(() => {
    setDraft("")
    setBusy(false)
    setNotice("")
    return () => lifetime.abort()
  }, [lifetime])
  const send = async () => {
    const action = props.atom.actions.runDevelopment ?? props.atom.actions.sendMessage
    if (busy || !draft.trim() || action === undefined) return
    const active = lifetime
    const text = draft
    setBusy(true)
    setNotice("")
    try {
      await action(text, active.signal)
      if (!active.signal.aborted) {
        setDraft("")
        setNotice("")
      }
    } catch (error) {
      if (!active.signal.aborted) setNotice(error instanceof Error ? error.message : "Окружение отклонило запрос")
    } finally {
      if (!active.signal.aborted) setBusy(false)
    }
  }
  const history = useMemo(() => createAgentChatHistory(), [props.atom])
  useLayoutEffect(() => {history.present(props.atom.ref, props.snapshot.chat)}, [history, props.snapshot.chat])
  useEffect(() => () => history.dispose(), [history])
  const observed = useSyncExternalStore(history.subscribe, history.getSnapshot)
  return <AgentConversationContent atom={props.atom} snapshot={props.snapshot} history={history} observed={observed} draft={draft} busy={busy} setDraft={setDraft} send={() => {void send()}} notice={notice} />
}

function AgentConversationContent(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot; history: ReturnType<typeof createAgentChatHistory>; observed: ReturnType<ReturnType<typeof createAgentChatHistory>["getSnapshot"]>; draft: string; busy: boolean; setDraft(value: string): void; send(): void; notice: string}>) {
  const preferences = providerPreferences(props.snapshot)
  const timeline = props.history.timeline(props.observed)
  const [preparing, setPreparing] = useState(false)
  const [settingsError, setSettingsError] = useState("")
  const lifetime = useMemo(() => new AbortController(), [props.atom])
  useEffect(() => () => lifetime.abort(), [lifetime])
  return <StorybookChatView
    history={timeline.history}
    onHistoryViewport={timeline.onHistoryViewport}
    onHistoryVisible={timeline.onHistoryVisible}
    onHistoryExpand={timeline.onHistoryExpand}
    onHistoryRetry={timeline.onHistoryRetry}
    onHistoryRetryPage={timeline.onHistoryRetryPage}
    onHistoryEvidence={timeline.onHistoryEvidence}
    onHistoryTail={timeline.onHistoryTail}
    address={props.atom.ref}
    label={props.snapshot.configuration.id}
    status={props.busy ? "connecting" : "idle"}
    draft={props.draft}
    sending={props.busy}
    settings={preferences.settings}
    error={settingsError || props.notice || undefined}
    configuring={preparing}
    onPrepareSettings={props.atom.actions.prepareProviderSettings ? () => {
      if (preparing) return
      setPreparing(true)
      setSettingsError("")
      void props.atom.actions.prepareProviderSettings!(lifetime.signal).catch(error => {
        if (!lifetime.signal.aborted) setSettingsError(error instanceof Error ? error.message : "Настройки недоступны")
      }).finally(() => {if (!lifetime.signal.aborted) setPreparing(false)})
    } : undefined}
    onDraftChange={props.setDraft}
    onSend={props.send}
    onConfigure={props.atom.actions.configureProvider ? (id, value) => {
      const setting = preferences.settings.find(setting => setting.id === id)
      if (!setting || preparing) return
      setPreparing(true)
      setSettingsError("")
      void props.atom.actions.configureProvider!({model: setting.category === "model" ? value : null,
        reasoning: setting.category === "thought_level" ? value : null}, lifetime.signal).catch(error => {
        if (!lifetime.signal.aborted) setSettingsError(error instanceof Error ? error.message : "Настройки не подтверждены")
      }).finally(() => {if (!lifetime.signal.aborted) setPreparing(false)})
    } : undefined}
  />
}

function AgentTools(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot}>) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const lifetime = useMemo(() => new AbortController(), [props.atom])
  useEffect(() => {
    setBusy(false)
    setNotice("")
    return () => lifetime.abort()
  }, [lifetime])
  const invoke = async (index: number) => {
    const tool = props.snapshot.configuration.tools[index]
    if (busy || tool === undefined || !props.snapshot.operations.includes(tool.name) || props.atom.actions.invokeTool === undefined) return
    const active = lifetime
    const owner = props.atom
    setBusy(true)
    setNotice("")
    try {
      await owner.actions.invokeTool!(tool, active.signal)
      if (!active.signal.aborted) setNotice("Запрос инструмента передан окружению")
    } catch (error) {
      if (!active.signal.aborted) setNotice(error instanceof Error ? error.message : "Окружение отклонило инструмент")
    } finally {
      if (!active.signal.aborted) setBusy(false)
    }
  }
  return <section aria-label="Объявленные инструменты Atom">
    {props.snapshot.configuration.tools.map((tool, index) => <AgentToolRow
      key={`${index}:${tool.name}`}
      tool={tool}
      disabled={busy || !props.snapshot.operations.includes(tool.name) || props.atom.actions.invokeTool === undefined}
      onInvoke={() => {void invoke(index)}}
    />)}
    <Typography text={notice} />
  </section>
}

function AgentToolRow(props: Readonly<{tool: AgentToolReference; disabled: boolean; onInvoke(): void}>) {
  return <article>
    <Typography text={`${props.tool.name}${props.tool.owner === undefined ? "" : ` · ${props.tool.owner.meta}`}`} />
    <pre>{JSON.stringify(props.tool.input, null, 2)}</pre>
    <Button
      label={`Вызвать ${props.tool.name}`}
      disabled={props.disabled}
      onClick={props.onInvoke}
    />
  </article>
}
