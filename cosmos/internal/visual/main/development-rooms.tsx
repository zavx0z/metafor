import {DisplayElement, HTMLElement} from "@zavx0z/immersive"
import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Panel, Tab, TextField, Typography, Window} from "@zavx0z/immersive/ui"
import {SpatialTree} from "@zavx0z/immersive/nodes/spatial/tree"
import {layoutAgentOffice, type OfficeLayout} from "@metafor/agent/office-layout"
import type {DevelopmentPackage} from "../../../release/shared/development"
import {createOfficeSceneGeometry} from "./office-geometry"
import type {Bot} from "./bot"
import type {DevelopmentRoomAgentsModel} from "./development-room-agents"
import type {DevelopmentRoomSceneModel} from "./development-room-scene"
import {developmentActorId, type DevelopmentRoomAgent} from "./development-room-ports"
import {RoomContextMenu, RoomNavigationHUD} from "./room-navigation-hud"
import {useSpatialVisibility} from "./spatial-visibility"

type Room = Readonly<{
  package: DevelopmentPackage
  agents: readonly DevelopmentRoomAgent[]
  layout: OfficeLayout
  position: Readonly<{x: number; y: number; z: number}>
}>

/** Existing Space получает package geometry и участников только выбранной комнаты. */
export function DevelopmentRoomsSpace(props: Readonly<{
  active: boolean
  scene: DevelopmentRoomSceneModel
  agents: DevelopmentRoomAgentsModel
  bot?: Bot | undefined
}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const agents = useSyncExternalStore(props.agents.subscribe, props.agents.getSnapshot)
  const spatial = useSpatialVisibility(props.scene.spatial, props.active)
  const roomNode = scene.geometryNodes.find(node => node.id === scene.selectedPackage?.name)
  const r = roomNode?.rect
  const signature = JSON.stringify([scene.selectedPackage?.name, r, agents.agents.map(agent => [agent.executorId, agent.label, agent.profile?.gender])])
  const room = useMemo<Room | null>(() => {
    if (!props.bot || !scene.selectedPackage || !r || agents.packageName !== scene.selectedPackage.name || scene.view !== "room") return null
    const bot = props.bot
    const bounds = {min: {x: -r.width / 2, y: -r.height / 2, z: 0}, max: {x: r.width / 2, y: r.height / 2, z: 180}}
    return {package: scene.selectedPackage, agents: agents.agents,
      layout: layoutAgentOffice({roomBounds: bounds, humanoid: bot.bounds, overheadDisplayId: "chat",
        agents: agents.agents.map(agent => ({id: agent.executorId, humanoid: bot.variants[agent.profile?.gender ?? "male"].bounds,
          displays: [{id: "chat", width: 900, height: 600, depth: 20}]}))}),
      position: {x: r.x + r.width / 2, y: r.y + r.height / 2, z: r.z - 180}}
  }, [signature, props.bot, scene.view, agents.packageName])
  return <>
    <SpatialTree source={spatial} style={css`
      ${!props.active && css`
        display: none;
      `}
    `} />
    {room && props.bot ? <DevelopmentRoomOffice
      room={room}
      bot={props.bot}
      agents={props.agents}
      active={props.active}
    /> : null}
  </>
}

function DevelopmentRoomOffice(props: Readonly<{room: Room; bot: Bot; agents: DevelopmentRoomAgentsModel; active: boolean}>) {
  const room = props.room
  const instances = useMemo(() => createOfficeSceneGeometry([{id: room.package.name, layout: room.layout, position: room.position,
    genders: new Map(room.agents.map(agent => [agent.executorId, agent.profile?.gender ?? "male"] as const))}], props.bot),
    [props.bot, room.package.name, room.layout, room.position.x, room.position.y, room.position.z])
  useEffect(() => () => instances.dispose(), [instances])
  return <>
    <xr-asset name={`Агенты ${room.package.label}`} factory={instances.object} visible={props.active} />
    {room.layout.agents.map(agent => <DevelopmentAgentScreens
      key={developmentActorId(room.package.name, agent.id)}
      active={props.active}
      packageName={room.package.name}
      agent={agent}
      position={room.position}
      agents={props.agents}
      label={room.agents.find(value => value.executorId === agent.id)?.label ?? agent.id}
    />)}
  </>
}

function DevelopmentAgentScreens(props: Readonly<{
  active: boolean
  packageName: string
  agent: OfficeLayout["agents"][number]
  position: Readonly<{x: number; y: number; z: number}>
  agents: DevelopmentRoomAgentsModel
  label: string
}>) {
  return <>{props.agent.displays.map(display => <DevelopmentAgentScreen
    key={display.id}
    active={props.active}
    packageName={props.packageName}
    agent={props.agent}
    display={display}
    position={props.position}
    agents={props.agents}
    label={props.label}
  />)}</>
}

function DevelopmentAgentScreen(props: Readonly<{
  active: boolean
  packageName: string
  agent: OfficeLayout["agents"][number]
  display: OfficeLayout["agents"][number]["displays"][number]
  position: Readonly<{x: number; y: number; z: number}>
  agents: DevelopmentRoomAgentsModel
  label: string
}>) {
  const actorId = developmentActorId(props.packageName, props.agent.id)
  const d = props.display
  const geometry = {position: {x: d.position.x + props.position.x, y: d.position.y + props.position.y,
    z: d.position.z + props.position.z}, width: d.width, height: d.height}
  const [rotation, setRotation] = useState("0 0 1 0rad")
  const [element, setElement] = useState<DisplayElement | null>(null)
  useEffect(() => {
    props.agents.bindDisplay(actorId, element, geometry, setRotation)
    return () => props.agents.bindDisplay(actorId, null, geometry, setRotation)
  }, [props.agents, actorId, element, geometry.position.x, geometry.position.y, geometry.position.z, geometry.width, geometry.height])
  const bindDisplay = useMemo(() => (value: unknown) => {
    if (value !== null && !(value instanceof DisplayElement)) throw new Error("Development room requires a Display")
    setElement(value)
  }, [])
  const bindWall = useMemo(() => (value: unknown) => {
    if (value !== null && !(value instanceof HTMLElement)) throw new Error("Development Chat wall requires an Element")
    props.agents.bindWall(actorId, value)
  }, [props.agents, actorId])
  // Полный стиль живёт у самого Display до его удаления из Document.
  return <DevelopmentAgentScreenSurface
    actorId={actorId}
    packageName={props.packageName}
    executorId={props.agent.id}
    width={d.width}
    height={d.height}
    label={props.label}
    bindDisplay={bindDisplay}
    bindWall={bindWall}
    onOpen={() => props.agents.open(props.agent.id)}
    style={css`
      width: 900px;
      height: 600px;
      translate: ${geometry.position.x}mm ${geometry.position.y}mm ${geometry.position.z}mm;
      rotate: ${rotation};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--widget-box-outline);
      border-radius: var(--radius-large);
      background: rgb(var(--surface-900) / .18);
      ${!props.active && css`
        display: none;
      `}
    `}
  />
}

function DevelopmentAgentScreenSurface(props: Readonly<{
  actorId: string
  packageName: string
  executorId: string
  width: number
  height: number
  label: string
  bindDisplay(value: unknown): void
  bindWall(value: unknown): void
  onOpen(): void
  style: CssStyle
}>) {
  return <display
    ref={props.bindDisplay}
    data-development-actor={props.actorId}
    data-package-name={props.packageName}
    data-executor-id={props.executorId}
    width={props.width}
    height={props.height}
    style={props.style}
  >
    <Button label={`Беседа · ${props.label}`} onClick={props.onOpen} />
    <div ref={props.bindWall} data-development-chat-wall={props.actorId} style={css`
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    `} />
  </display>
}

/** Общий RoomNavigationHUD управляет Cosmos комнатой и двумя проекциями одного Chat. */
export function DevelopmentRoomsHUD(props: Readonly<{
  active: boolean
  scene: DevelopmentRoomSceneModel
  agents: DevelopmentRoomAgentsModel
  catalogError?: string | null
  onRefreshCatalog?: (() => void) | undefined
  context?: Readonly<{x: number; y: number}> | null
  onCloseContext?: (() => void) | undefined
}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const agents = useSyncExternalStore(props.agents.subscribe, props.agents.getSnapshot)
  const [info, setInfo] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [creationError, setCreationError] = useState("")
  const pkg = scene.selectedPackage
  const selected = agents.agents.find(agent => pkg && developmentActorId(pkg.name, agent.executorId) === agents.selectedActorId)
  const back = () => {if (agents.chatOpen) props.agents.close(); else props.scene.back()}
  const bindWindow = useMemo(() => (value: unknown) => {
    if (value !== null && !(value instanceof HTMLElement)) throw new Error("Development Chat window requires an Element")
    props.agents.bindWindow(value)
  }, [props.agents])
  const bindParking = useMemo(() => (value: unknown) => {
    if (value !== null && !(value instanceof HTMLElement)) throw new Error("Development Chat parking requires an Element")
    props.agents.bindParking(value)
  }, [props.agents])
  useEffect(() => {props.onCloseContext?.()}, [pkg?.name, scene.view])
  return <>
    <div
      hidden={!props.active}
      id="cosmos-room-navigation-dock"
      style={css`
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;

        &[hidden] {
          display: none;
        }
      `}
    >
      <Tab label={pkg ? `${pkg.label} · ${pkg.name}` : "Cosmos · Пакеты"} position={{edge: "bottom", offset: .5}}>
        <DevelopmentRoomNavigation
          scene={props.scene}
          selected={pkg?.resolution === "source"}
          catalogError={props.catalogError ?? null}
          onRefreshCatalog={props.onRefreshCatalog}
        />
      </Tab>
    </div>
    <section
      hidden={!props.active || !pkg}
      style={css`
        position: absolute;
        left: 12px;
        top: 12px;
        max-width: 100%;

        &[hidden] {
          display: none;
        }
      `}
    >
      {pkg?.resolution === "external" ? <Panel label={`Внешний Package · ${pkg.label}`} expanded={true}>
        <Typography text={pkg.name} />
        <Typography text="Метаданные зависимости; исходная комната и агенты не назначены" />
        {scene.catalog?.dependencies.filter(edge => edge.to === pkg.name).map(edge => <Typography
          key={`${edge.from}:${edge.kind}`}
          text={`${edge.from} · ${edge.kind} · ${edge.range}`}
        />)}
      </Panel> : <RoomNavigationHUD
        view={scene.view}
        canGoBack={scene.canGoBack}
        roomLabel={pkg?.label ?? null}
        agents={agents.agents.map(agent => ({key: agent.executorId, name: agent.label}))}
        selectedAgentKey={selected?.executorId}
        chatOpen={agents.chatOpen}
        error={scene.error ?? agents.error ?? undefined}
        onBack={back}
        onEnter={() => {props.scene.enterRoom()}}
        onAgent={id => {props.agents.open(id)}}
        onInfo={() => setInfo(true)}
        onDisplay={() => {props.agents.close(); props.scene.showDisplay()}}
      />}
      {scene.view === "room" && pkg?.resolution === "source" && !agents.chatOpen ? <Panel label="Новый агент" expanded={false}>
        <TextField label="Имя агента" value={newName} disabled={creating} onInput={setNewName} />
        <Button
          label="Создать агента"
          disabled={creating || !newName.trim()}
          onClick={() => {
            setCreating(true)
            setCreationError("")
            void props.agents.create(newName.trim()).then(agent => {
              if (agent) {setNewName(""); props.agents.open(agent.executorId)}
            }).catch(error => setCreationError(error instanceof Error ? error.message : "Не удалось создать агента"))
              .finally(() => setCreating(false))
          }}
        />
        {creationError ? <Typography text={creationError} /> : null}
      </Panel> : null}
    </section>
    <Window
      id="cosmos-development-chat"
      title={`${pkg?.label ?? "Package"} · ${selected?.label ?? "Агент"}`}
      open={props.active && agents.chatOpen}
      onOpenChange={open => {if (!open) props.agents.close()}}
      layout="fill"
      actions={[{key: "back", label: "Назад в комнату"}]}
      onAction={key => {if (key === "back") props.agents.close()}}
    >
      <DevelopmentChatWindowHost bind={bindWindow} />
    </Window>
    <Window
      id="cosmos-development-info"
      title={pkg?.label ?? "Package"}
      open={props.active && info && pkg !== null}
      onOpenChange={setInfo}
    >
      <Typography text={pkg?.name ?? ""} />
      <Typography text={pkg?.resolution === "source" ? "Исходный Package" : "Внешний Package"} />
    </Window>
    <RoomContextMenu
      open={props.active && pkg?.resolution === "source" && props.context != null}
      x={props.context?.x ?? 0}
      y={props.context?.y ?? 0}
      roomLabel={pkg?.label ?? "Package"}
      canGoBack={scene.canGoBack || agents.chatOpen}
      onClose={() => props.onCloseContext?.()}
      onBack={back}
      onEnter={() => {props.scene.enterRoom()}}
      onDisplay={() => {props.agents.close(); props.scene.showDisplay()}}
      onInfo={() => setInfo(true)}
    />
    <div
      hidden={true}
      ref={bindParking}
      data-development-chat-parking=""
      style={css`
        display: none;
      `}
    />
  </>
}

function DevelopmentRoomNavigation(props: Readonly<{
  scene: DevelopmentRoomSceneModel
  selected: boolean
  catalogError: string | null
  onRefreshCatalog?: (() => void) | undefined
}>) {
  return <nav
    aria-label="Навигация Cosmos"
    style={css`
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-4);
    `}
  >
    <Button label="−" onClick={() => props.scene.zoom(1.25)} />
    <Button label="Обзор" onClick={() => props.scene.fit()} />
    <Button label="Дисплей" disabled={!props.selected} onClick={() => props.scene.showDisplay()} />
    <Button label="+" onClick={() => props.scene.zoom(.8)} />
    {props.onRefreshCatalog ? <Button label="Обновить каталог" onClick={props.onRefreshCatalog} /> : null}
    {props.catalogError ? <Typography text={props.catalogError} /> : null}
  </nav>
}

function DevelopmentChatWindowHost(props: Readonly<{bind(value: unknown): void}>) {
  return <div
    ref={props.bind}
    data-development-chat-window=""
    style={css`
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    `}
  />
}
