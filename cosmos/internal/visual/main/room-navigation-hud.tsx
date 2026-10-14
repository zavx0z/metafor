import {useEffect, useState} from "@zavx0z/immersive/XReact"
import {Button, Inspector, Menu, Panel, Typography, Window} from "@zavx0z/immersive/ui"
import type {JsonValue, RuntimeAtom} from "@metafor/types/metafor/graph"

export type RoomNavigationView = "overview" | "display" | "room"
export type RoomNavigationAgent = Readonly<{key: string; name: string}>
export type RoomNavigationHUDProps = Readonly<{
  view: RoomNavigationView
  canGoBack: boolean
  roomLabel: string | null
  agents: readonly RoomNavigationAgent[]
  selectedAgentKey?: string | undefined
  chatOpen: boolean
  error?: string | undefined
  onBack(): void
  onEnter(): void
  onAgent(key: string): void
  onInfo(): void
  onDisplay?: (() => void) | undefined
}>

/** HUD [Visual](../README.md#визуальная-среда-main) показывает подтверждённое место; camera, выбор комнаты и перенос chat принадлежат host. */
export function RoomNavigationHUD(props: RoomNavigationHUDProps) {
  const selected = props.agents.find(agent => agent.key === props.selectedAgentKey)
  const location = props.chatOpen ? `Чат · ${selected?.name ?? "Агент"} · ${props.roomLabel ?? "Комната"}`
    : props.view === "overview" ? "Общий план"
      : `${props.view === "display" ? "Главный дисплей" : "Комната"} · ${props.roomLabel ?? "Не выбрана"}`
  return <section
    data-room-navigation-hud={props.view}
    style={css`
      display: flex;
      flex-direction: column;
      width: 280px;
      max-width: 100%;
      min-width: 0;
      gap: 8px;
      --panel-header-background: rgb(var(--surface-800) / 0.5);
      --panel-content-background: transparent;
    `}
  >
    <Panel label={location} expanded={true}>
      <RoomNavigationActions
        view={props.view}
        canGoBack={props.canGoBack || props.chatOpen}
        roomLabel={props.roomLabel}
        chatOpen={props.chatOpen}
        onBack={props.onBack}
        onEnter={props.onEnter}
        onInfo={props.onInfo}
        onDisplay={props.onDisplay}
      />
      {props.error ? <Typography text={`Наблюдение недоступно: ${props.error}`} /> : null}
    </Panel>
    {props.view === "room" && !props.chatOpen ? <Panel label="Участники комнаты" expanded={true}>
      <RoomNavigationAgents agents={props.agents} selectedAgentKey={props.selectedAgentKey} onAgent={props.onAgent} />
    </Panel> : null}
  </section>
}

function RoomNavigationActions(props: Readonly<{
  view: RoomNavigationView
  canGoBack: boolean
  roomLabel: string | null
  chatOpen: boolean
  onBack(): void
  onEnter(): void
  onInfo(): void
  onDisplay: (() => void) | undefined
}>) {
  return <section style={css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `}>
    {props.canGoBack ? <Button label="Назад" onClick={props.onBack} /> : null}
    {props.view === "display" && !props.chatOpen ? <Button label="Войти в комнату" disabled={!props.roomLabel} onClick={props.onEnter} /> : null}
    {props.view === "room" && !props.chatOpen && props.onDisplay ? <Button label="Главный дисплей" onClick={props.onDisplay} /> : null}
    <Button label="Информация" disabled={!props.roomLabel} onClick={props.onInfo} />
  </section>
}

function RoomNavigationAgents(props: Readonly<{
  agents: readonly RoomNavigationAgent[]
  selectedAgentKey: string | undefined
  onAgent(key: string): void
}>) {
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `}>
    {props.agents.map(agent => <Button
      key={agent.key}
      label={agent.name}
      selected={agent.key === props.selectedAgentKey}
      onClick={() => props.onAgent(agent.key)}
    />)}
    {props.agents.length === 0 ? <Typography text="В комнате пока нет агентов" /> : null}
  </section>
}

export type RoomContextMenuProps = Readonly<{
  open: boolean
  x: number
  y: number
  roomLabel: string
  canGoBack: boolean
  onClose(): void
  onDisplay(): void
  onEnter(): void
  onInfo(): void
  onBack(): void
}>

/** Готовый Menu [Visual](../README.md#визуальная-среда-main) использует координаты public context event; identity выбранной комнаты задаёт host. */
export function RoomContextMenu(props: RoomContextMenuProps) {
  return <Menu
    open={props.open}
    x={props.x}
    y={props.y}
    label={`Меню комнаты «${props.roomLabel}»`}
    onClose={props.onClose}
    items={[
      {key: "display", label: "Главный дисплей", onSelect: () => {props.onClose(); props.onDisplay()}},
      {key: "enter", label: "Войти в комнату", onSelect: () => {props.onClose(); props.onEnter()}},
      {key: "info", label: "Информация", onSelect: () => {props.onClose(); props.onInfo()}},
      {key: "back", label: "Назад", disabled: !props.canGoBack, onSelect: () => {props.onClose(); props.onBack()}},
    ]}
  />
}

export type RoomInfoWindowProps = Readonly<{
  open: boolean
  roomLabel: string
  atom: RuntimeAtom | null
  agents: readonly RoomNavigationAgent[]
  onOpenChange(open: boolean): void
}>

/** Read-only Inspector [Visual](../README.md#визуальная-среда-main) читает уже наблюдаемый Atom; Mass content не запрашивается, редактор не копируется. */
export function RoomInfoWindow(props: RoomInfoWindowProps) {
  const [category, setCategory] = useState("state")
  useEffect(() => setCategory("state"), [props.atom?.ref])
  return <Window
    id="metafor-room-info"
    title={`Информация · ${props.roomLabel}`}
    open={props.open}
    onOpenChange={props.onOpenChange}
    geometry={{x: 24, y: 24, width: 500, height: 440}}
    movable={true}
    resizable={true}
    minWidth={320}
    minHeight={240}
    style={css`
      backdrop-filter: blur(8px);
      --widget-surface-background: transparent;
      --panel-header-background: rgb(var(--surface-800) / 0.5);
      --panel-content-background: transparent;
    `}
  >
    <Inspector
      ariaLabel="Информация комнаты"
      categoriesLabel="Разделы информации"
      categories={[
        {id: "state", label: "Состояние", panelIds: ["state"]},
        {id: "matter", label: "Matter", panelIds: ["matter"]},
        {id: "mass", label: "Mass", panelIds: ["mass"]},
        {id: "agents", label: "Агенты", panelIds: ["agents"]},
      ]}
      selectedCategoryId={category}
      onCategoryChange={setCategory}
      query=""
      showSearch={false}
      context={{label: props.roomLabel, secondary: {label: props.atom?.meta ?? "Atom ещё не получен"}}}
    >
      <RoomInfoContent category={category} atom={props.atom} agents={props.agents} />
    </Inspector>
  </Window>
}

function RoomInfoContent(props: Readonly<{category: string; atom: RuntimeAtom | null; agents: readonly RoomNavigationAgent[]}>) {
  return <section
    data-room-info={props.category}
    style={css`
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      min-height: 0;
      overflow: auto;
    `}
  >
    {props.category === "state" ? <RoomInfoState atom={props.atom} /> : null}
    {props.category === "matter" ? <RoomInfoMatter atom={props.atom} /> : null}
    {props.category === "mass" ? <RoomInfoMass atom={props.atom} /> : null}
    {props.category === "agents" ? <RoomInfoAgents agents={props.agents} /> : null}
  </section>
}

function RoomInfoState(props: Readonly<{atom: RuntimeAtom | null}>) {
  const values = Object.entries(props.atom?.values ?? {})
  return <section>
    <Typography text={`Atom: ${props.atom?.ref ?? "не получен"}`} />
    <Typography text={`Meta: ${props.atom?.meta ?? "не получена"}`} />
    <Typography text={`Состояние: ${props.atom?.state ?? "не наблюдается"}`} />
    {values.slice(0, 128).map(([key, value]) => <Typography key={key} text={`${key}: ${roomInfoValue(value)}`} />)}
    {values.length > 128 ? <Typography text={`Показаны 128 из ${values.length} полей`} /> : null}
  </section>
}

function RoomInfoMatter(props: Readonly<{atom: RuntimeAtom | null}>) {
  return <section>
    {(props.atom?.children ?? []).map(child => <Typography
      key={child.ref}
      text={child.kind === "atom" ? `${child.meta} · ${child.ref}` : `${child.topology} · ${child.ref}`}
    />)}
    {!props.atom?.children?.length ? <Typography text="У Atom нет вложенных участников Matter" /> : null}
  </section>
}

function RoomInfoMass(props: Readonly<{atom: RuntimeAtom | null}>) {
  return <section>
    {(props.atom?.mass ?? []).map(mass => <Typography key={mass.ref} text={`${mass.label ?? mass.key} · ${mass.format} · ${mass.ref}`} />)}
    {!props.atom?.mass.length ? <Typography text="У Atom нет собственной Mass" /> : null}
  </section>
}

function RoomInfoAgents(props: Readonly<{agents: readonly RoomNavigationAgent[]}>) {
  return <section>
    {props.agents.map(agent => <Typography key={agent.key} text={agent.name} />)}
    {props.agents.length === 0 ? <Typography text="В комнате пока нет агентов" /> : null}
  </section>
}

function roomInfoValue(value: JsonValue): string {
  const text = JSON.stringify(value)
  return text.length > 512 ? `${text.slice(0, 512)}…` : text
}
