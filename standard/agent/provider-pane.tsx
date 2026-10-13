import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Panel, Typography} from "@zavx0z/immersive/ui"
import Preferences, {type StorybookChatPreferences} from "@zavx0z/storybook-chat-preferences"
import {useAtom, type AtomContext, type AtomViewSnapshot} from "./atom"
import {AgentProviderConnections} from "./provider-view"

/** Готовая форма Storybook получает только presentation catalog и действующие операции данного Atom. */
export function AgentProviderPane(props: Readonly<{atom: AtomContext; active?: boolean | undefined}>) {
  const atom = useAtom(props.atom)
  const source = useMemo(() => ({subscribe: (listener: () => void) => atom.subscribe(listener), getSnapshot: () => atom.getSnapshot()}), [atom])
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  return <ProviderSettings atom={atom} snapshot={snapshot} active={props.active ?? true} />
}

/** Только наблюдаемые варианты; отсутствие каталога моделей не заменяется встроенными значениями. */
export function providerPreferences(snapshot: AtomViewSnapshot) {
  const provider = snapshot.provider
  const entries = snapshot.providers?.registry.entries ?? []
  const connectionId = snapshot.providerBinding?.id ?? snapshot.providers?.registry.settings.selectedId ?? undefined
  const connections = entries.map(entry => ({id: entry.id, label: entry.service, enabled: entry.resolution === "exact" && entry.connection === "connected" && entry.capabilities.modelTurn && entry.checks.status !== "failed"}))
  const settings: StorybookChatPreferences.Input["settings"] = [
    ...(provider?.models.length ? [{id: "model", category: "model" as const, name: "Модель", value: provider.model ?? "", options: provider.models.map(value => ({value: value.id, name: value.label}))}] : []),
    ...(provider?.reasoningLevels.length ? [{id: "reasoning", category: "thought_level" as const, name: "Мышление", value: provider.reasoning ?? "", options: provider.reasoningLevels.map(value => ({value: value.id, name: value.label}))}] : []),
  ]
  return {connectionId, connections, settings}
}

function ProviderSettings(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot; active: boolean}>) {
  const provider = props.snapshot.provider, projection = providerPreferences(props.snapshot)
  const [model, setModel] = useState(provider?.model ?? "")
  const [reasoning, setReasoning] = useState(provider?.reasoning ?? "")
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("")
  const [detail, setDetail] = useState(false)
  const lifetime = useMemo(() => new AbortController(), [props.atom])
  useEffect(() => {setBusy(false); setNotice(""); return () => lifetime.abort()}, [lifetime])
  useEffect(() => {setModel(provider?.model ?? ""); setReasoning(provider?.reasoning ?? "")}, [props.atom, provider?.model, provider?.reasoning, projection.connectionId])
  const selection = {...(projection.connectionId ? {connectionId: projection.connectionId} : {}), ...(model ? {model} : {}), ...(reasoning ? {thoughtLevel: reasoning} : {})}
  const select = async (value: StorybookChatPreferences.Input["selection"]) => {
    if (busy) return
    if (value.connectionId !== projection.connectionId) {
      const entry = projection.connections.find(entry => entry.id === value.connectionId)
      if (!entry?.enabled || !props.atom.actions.selectProvider || props.snapshot.providerBinding?.locked) {setNotice("Подключение закреплено за беседой или недоступно"); return}
      setBusy(true); setNotice("")
      try {await props.atom.actions.selectProvider(value.connectionId!, lifetime.signal)}
      catch (error) {if (!lifetime.signal.aborted) setNotice(error instanceof Error ? error.message : "Подключение недоступно")}
      finally {if (!lifetime.signal.aborted) setBusy(false)}
      return
    }
    setModel(value.model ?? "")
    setReasoning(value.thoughtLevel ?? "")
  }
  const configure = async () => {
    const action = props.atom.actions.configureProvider
    if (busy || !action) return
    const signal = lifetime.signal
    setBusy(true); setNotice("")
    try {await action({model: model || null, reasoning: reasoning || null}, signal); if (!signal.aborted) setNotice("Запрос настроек передан окружению")}
    catch (error) {if (!signal.aborted) setNotice(error instanceof Error ? error.message : "Окружение отклонило настройки")}
    finally {if (!signal.aborted) setBusy(false)}
  }
  const disabled: StorybookChatPreferences.Field[] = []
  if (!props.atom.actions.selectProvider || props.snapshot.providerBinding?.locked) disabled.push("connectionId")
  if (!props.atom.actions.configureProvider) disabled.push("model", "thoughtLevel")
  return <section aria-label="Настройки провайдера Atom" style={css`display: flex; flex-direction: column; min-height: 0; gap: var(--spacing-8);`}>
    <Preferences selection={selection} effective={projection.connectionId ? {connectionId: projection.connectionId, ...(provider?.model ? {model: provider.model} : {}), ...(provider?.reasoning ? {thoughtLevel: provider.reasoning} : {})} : undefined}
      connections={projection.connections} settings={projection.settings} fields={["connectionId", "model", "thoughtLevel"]} disabledFields={disabled}
      inheritLabel="По умолчанию" busy={busy} onChange={value => {void select(value)}} />
    {props.atom.actions.configureProvider ? <Button label="Применить настройки" disabled={busy || (!provider?.models.length && !provider?.reasoningLevels.length)} onClick={() => {void configure()}} /> : null}
    {notice ? <Typography text={notice} /> : null}
    <AgentProviderConnections atom={props.atom} snapshot={props.snapshot} active={props.active} />
    <Panel label="Подробности подключения" expanded={detail} onToggle={setDetail}>
      {detail ? <Typography text={JSON.stringify({binding: props.snapshot.providerBinding, session: provider?.sessionId ?? null, registry: props.snapshot.providers?.registry}, null, 2)} /> : null}
    </Panel>
  </section>
}

export {ProviderBrowserConnections} from "./provider-view"
