import {useEffect, useRef, useState} from "@zavx0z/immersive/XReact"
import {Button, CheckboxField, Panel, SelectField, Tab, TextField, Typography, Window} from "@zavx0z/immersive/ui"
import type {CosmosAgentScope} from "@metafor/types/cosmos/agent-profile"
import type {CosmosConversationAgent} from "@metafor/types/cosmos/conversations"
import type {CosmosRoomGroups, CosmosRoomScope} from "@metafor/types/cosmos/conversation-groups"
import type {CosmosConversationDirectoryClient} from "./agent-workspace-types"
import {ProviderBrowserLogin} from "./provider-browser-login"
import type {ProviderBrowserAccess} from "./provider-hud"

export type RoomActionCreated = Readonly<{kind: "agent"; agent: CosmosConversationAgent}> | Readonly<{kind: "group"; groups: CosmosRoomGroups}>
export type RoomAgentCreationResult = Readonly<{agent: CosmosConversationAgent; configurationError?: string}>
export type RoomActionsProps = Readonly<{
  roomScope: CosmosRoomScope | null
  actors: readonly CosmosConversationAgent[]
  clientDirectory: CosmosConversationDirectoryClient | null
  visible: boolean
  onCreated(value: RoomActionCreated): void | Promise<void>
  providerAccess?: ProviderBrowserAccess | undefined
  connections?: readonly Readonly<{id: string; label: string; enabled: boolean}>[] | undefined
  onCreateAgent?: ((scope: CosmosRoomScope, name: string, connectionId: string) => Promise<RoomAgentCreationResult>) | undefined
  selectedAgentRef?: string | undefined
  onCreateChat?: ((scope: CosmosAgentScope, label?: string) => void | Promise<void>) | undefined
}>

/**
Явные действия активной комнаты [Visual](../README.md#совместная-работа-с-клиентом).
Controls и готовый Window размещаются рядом с другими окнами в общем родителе
HUD, как Settings. Компонент заимствует directory capability, не закрывает её
и не создаёт actor, группу или chat до действия человека. Group сохраняется
через свежую revision; onCreateChat принадлежит принимающему приложению.
*/
export function RoomActions(props: RoomActionsProps) {
  const [mode, setMode] = useState<"agent" | "group" | "chat" | null>(null)
  const [name, setName] = useState("")
  const [members, setMembers] = useState<readonly string[]>([])
  const [revision, setRevision] = useState<number | null>(null)
  const [knownGroups, setKnownGroups] = useState<CosmosRoomGroups | null>(null)
  const [chatActor, setChatActor] = useState("")
  const [connectionId, setConnectionId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const current = useRef(props), operation = useRef(false), generation = useRef(0)
  const completedWarning = useRef("")
  const reading = useRef<AbortController | null>(null), alive = useRef(true)
  current.current = props
  const scopeKey = JSON.stringify([props.roomScope?.verseId, props.roomScope?.atomRef])
  const available = props.visible && props.roomScope !== null && props.clientDirectory !== null
  const actors = props.actors.filter(actor => actor.scope.verseId === props.roomScope?.verseId && actor.scope.atomRef === props.roomScope?.atomRef)
  const windowId = `room-actions-${encodeURIComponent(scopeKey)}`
  useEffect(() => {
    generation.current++
    reading.current?.abort()
    reading.current = null
    setBusy(operation.current)
    setMode(null); setName(""); setMembers([]); setRevision(null); setKnownGroups(null); setChatActor(""); setError("")
  }, [scopeKey, props.clientDirectory, props.visible])
  useEffect(() => {alive.current = true; return () => {alive.current = false; generation.current++; reading.current?.abort()}}, [])
  const capability = () => {
    const value = current.current
    if (!value.visible || !value.roomScope || !value.clientDirectory) throw new Error("Активная комната недоступна")
    return {scope: value.roomScope, client: value.clientDirectory}
  }
  const loadRevision = async () => {
    const {scope, client} = capability(), expectedGeneration = generation.current
    reading.current?.abort()
    const controller = new AbortController()
    reading.current = controller
    setRevision(null)
    setBusy(true)
    try {
      const groups = await client.listGroups(scope, controller.signal)
      if (!alive.current || controller.signal.aborted || generation.current !== expectedGeneration) return
      if (groups.scope.verseId !== scope.verseId || groups.scope.atomRef !== scope.atomRef) throw new Error("Получены группы другой комнаты")
      setRevision(groups.revision)
      setKnownGroups(groups)
      setError("")
    } catch (cause) {if (alive.current && !controller.signal.aborted && generation.current === expectedGeneration) setError(String(cause))}
    finally {if (reading.current === controller) {reading.current = null; if (alive.current) setBusy(false)}}
  }
  const open = (kind: "agent" | "group" | "chat") => {
    if (operation.current) return
    setMode(kind); setName(""); setMembers([]); setError(""); setRevision(null)
    if (kind === "agent") setConnectionId(props.connections?.filter(value => value.enabled).length === 1 ? props.connections.find(value => value.enabled)!.id : "")
    if (kind === "chat") setChatActor(actors.find(actor => actor.scope.agentRef === props.selectedAgentRef)?.scope.agentRef ?? (actors.length === 1 ? actors[0]!.scope.agentRef : ""))
    if (kind === "group") void loadRevision()
  }
  const mutate = async (action: () => Promise<void>, close = true) => {
    if (operation.current || reading.current) return
    operation.current = true
    completedWarning.current = ""
    const expectedGeneration = generation.current
    setBusy(true)
    try {
      await action()
      if (alive.current && generation.current === expectedGeneration) {if (close) setMode(null); setError(completedWarning.current)}
    } catch (cause) {if (alive.current && generation.current === expectedGeneration) setError(cause instanceof Error ? cause.message : String(cause))}
    finally {operation.current = false; if (alive.current) setBusy(false)}
  }
  const save = () => mutate(async () => {
    const {scope, client} = capability(), title = name.trim()
    if (mode !== "chat" && !title || title.length > 128) throw new Error("Введите имя от 1 до 128 символов")
    if (mode === "agent") {
      if (current.current.onCreateAgent && !current.current.connections?.some(value => value.id === connectionId && value.enabled)) throw new Error("Выберите подключение агента")
      const result: RoomAgentCreationResult = current.current.onCreateAgent ? await current.current.onCreateAgent(scope, title, connectionId) : {agent: await client.createAgent(scope, title)}
      completedWarning.current = result.configurationError ?? ""
      setMode(null)
      await current.current.onCreated({kind: "agent", agent: result.agent})
    } else if (mode === "group") {
      if (revision === null) throw new Error("Сначала обновите каталог групп")
      const allowed = new Set(actors.map(actor => actor.scope.agentRef))
      if (members.length === 0 || members.some(member => !allowed.has(member))) throw new Error("Выберите существующих участников этой комнаты")
      const groups = await client.createGroup(scope, revision, title, members)
      setKnownGroups(groups); setRevision(groups.revision); setName(""); setMembers([])
      await current.current.onCreated({kind: "group", groups})
    } else if (mode === "chat") {
      const actor = actors.find(value => value.scope.agentRef === chatActor)
      if (!actor || !current.current.onCreateChat) throw new Error("Выберите агента для новой беседы")
      await current.current.onCreateChat(actor.scope, title || undefined)
    }
  }, mode !== "group")
  return <>
    {available ? <RoomActionControls
      busy={busy}
      onAgent={() => open("agent")}
      onGroup={() => open("group")}
      error={mode === null ? error : ""}
      onCreateChat={props.onCreateChat ? () => open("chat") : undefined}
    /> : null}
    {available ? <Window
      id={windowId}
      title={mode === "group" ? "Добавить группу" : mode === "chat" ? "Добавить чат" : "Добавить агента"}
      open={mode !== null}
      onOpenChange={value => {if (!value && !operation.current) {reading.current?.abort(); setMode(null)}}}
      geometry={{x: 24, y: 24, width: 420, height: 380}}
      movable={true}
      resizable={true}
      minWidth={320}
      minHeight={240}
      message={error ? {message: error, tone: "error"} : undefined}
      onMessageDismiss={() => setError("")}
    >
      {mode !== null ? <RoomActionForm
        mode={mode}
        name={name}
        actors={actors}
        members={members}
        busy={busy}
        revision={revision}
        groups={knownGroups}
        chatActor={chatActor}
        connectionId={connectionId}
        connections={props.connections ?? []}
        providerAccess={props.providerAccess}
        requireConnection={!!props.onCreateAgent}
        onConnection={setConnectionId}
        onChatActor={setChatActor}
        onName={setName}
        onMember={(id, checked) => setMembers(values => checked ? [...values.filter(value => value !== id), id] : values.filter(value => value !== id))}
        onReload={() => {void loadRevision()}}
        onSave={() => {void save()}}
        onCancel={() => {if (!operation.current) {reading.current?.abort(); setMode(null)}}}
      /> : null}
    </Window> : null}
  </>
}

type RoomActionControlProps = Readonly<{busy: boolean; error: string; onAgent(): void; onGroup(): void; onCreateChat: (() => void) | undefined}>
function RoomActionControls(props: RoomActionControlProps) {
  return <Tab label="Комната" position={{edge: "left", offset: .5}}>
    <RoomActionButtons busy={props.busy} error={props.error} onAgent={props.onAgent} onGroup={props.onGroup} onCreateChat={props.onCreateChat} />
  </Tab>
}

function RoomActionButtons(props: RoomActionControlProps) {
  return <div data-room-actions="" style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    <Button label="Добавить агента" disabled={props.busy} onClick={props.onAgent} />
    <Button label="Добавить группу" disabled={props.busy} onClick={props.onGroup} />
    {props.onCreateChat ? <Button label="Добавить чат" disabled={props.busy} onClick={props.onCreateChat} /> : null}
    {props.error ? <Typography text={props.error} /> : null}
  </div>
}

function RoomActionForm(props: Readonly<{
  mode: "agent" | "group" | "chat"; name: string; actors: readonly CosmosConversationAgent[]; members: readonly string[]; busy: boolean; revision: number | null
  groups: CosmosRoomGroups | null; chatActor: string; onChatActor(id: string): void
  connectionId: string; connections: readonly Readonly<{id: string; label: string; enabled: boolean}>[]
  providerAccess: ProviderBrowserAccess | undefined; requireConnection: boolean; onConnection(id: string): void
  onName(value: string): void; onMember(id: string, checked: boolean): void; onReload(): void; onSave(): void; onCancel(): void
}>) {
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  `}>
    {props.mode === "chat" ? <SelectField
      label="Агент беседы"
      value={props.chatActor}
      options={[{key: "unselected", value: "", label: "Выберите агента"}, ...props.actors.map(actor => ({key: actor.scope.agentRef, value: actor.scope.agentRef, label: actor.profile.name}))]}
      disabled={props.busy}
      onChange={props.onChatActor}
    /> : null}
    <TextField label={props.mode === "agent" ? "Имя агента" : props.mode === "chat" ? "Имя беседы (необязательно)" : "Название группы"} value={props.name} disabled={props.busy} onInput={props.onName} />
    {props.mode === "agent" && (props.connections.length > 0 || props.requireConnection) ? <RoomAgentConnection
      connectionId={props.connectionId}
      connections={props.connections}
      providerAccess={props.providerAccess}
      busy={props.busy}
      onConnection={props.onConnection}
    /> : null}
    {props.mode === "group" ? <RoomGroupMembers actors={props.actors} members={props.members} busy={props.busy} onMember={props.onMember} /> : null}
    {props.mode === "group" ? <Button label="Обновить каталог групп" disabled={props.busy} onClick={props.onReload} /> : null}
    <Button label="Отмена" disabled={props.busy} onClick={props.onCancel} />
    <Button label="Создать" disabled={props.busy || (props.mode === "agent" && props.requireConnection && !props.connections.some(value => value.id === props.connectionId && value.enabled)) || (props.mode !== "chat" && !props.name.trim()) || (props.mode === "chat" && !props.actors.some(actor => actor.scope.agentRef === props.chatActor)) || (props.mode === "group" && (props.revision === null || props.members.length === 0))} onClick={props.onSave} />
    {props.mode === "group" && props.groups ? <RoomGroupCatalog groups={props.groups!} actors={props.actors} /> : null}
  </section>
}

function RoomGroupCatalog(props: Readonly<{groups: CosmosRoomGroups; actors: readonly CosmosConversationAgent[]}>) {
  return <Panel label="Группы комнаты" expanded={true}>
    {props.groups.groups.map(group => <Typography
      key={group.id}
      text={`${group.title} · ${group.members.map(member => props.actors.find(actor => actor.scope.agentRef === member)?.profile.name ?? member).join(", ")}`}
    />)}
  </Panel>
}

function RoomGroupMembers(props: Readonly<{actors: readonly CosmosConversationAgent[]; members: readonly string[]; busy: boolean; onMember(id: string, checked: boolean): void}>) {
  return <Panel label="Участники группы" expanded={true}>
    {props.actors.map(actor => <CheckboxField
      key={actor.scope.agentRef}
      label={actor.profile.name}
      checked={props.members.includes(actor.scope.agentRef)}
      disabled={props.busy}
      onChange={checked => props.onMember(actor.scope.agentRef, checked)}
    />)}
    {props.actors.length === 0 ? <Typography text="Сначала добавьте участника комнаты" /> : null}
  </Panel>
}

function RoomAgentConnection(props: Readonly<{
  connectionId: string
  connections: readonly Readonly<{id: string; label: string; enabled: boolean}>[]
  providerAccess: ProviderBrowserAccess | undefined
  busy: boolean
  onConnection(id: string): void
}>) {
  return <section>
    <SelectField
      label="Подключение агента"
      value={props.connectionId}
      options={[{key: "unselected", value: "", label: "Выберите подключение"}, ...props.connections.filter(value => value.enabled).map(value => ({key: value.id, value: value.id, label: value.label}))]}
      disabled={props.busy}
      onChange={props.onConnection}
    />
    {props.providerAccess ? <ProviderBrowserLogin
      access={props.providerAccess}
      connectionId={props.connectionId}
      visible={true}
    /> : null}
  </section>
}
