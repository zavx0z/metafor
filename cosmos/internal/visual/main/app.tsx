import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {HTMLElement} from "@zavx0z/immersive"
import {Button, Tab, Typography} from "@zavx0z/immersive/ui"
import {AnnotationControl, AnnotationHUD} from "./annotation-hud"
import type {ProductAnnotationState} from "./product-annotation-state"
import type {Bot} from "./bot.ts"
import {createNetworkSpace, NetworkSpace, type NetworkSpaceModel} from "./network-space.tsx"
import {AgentOffices, AtomOffices} from "./agent-offices"
import {SpatialTree} from "@zavx0z/immersive/nodes/spatial/tree"
import {useSpatialVisibility} from "./spatial-visibility"
import {ProviderHUD} from "./provider-hud"
import type {AtomSceneModel} from "./atom-scene"
import type {AgentWorkspaceModel} from "./agent-workspace"
import {INITIAL_VIEW_POINT} from "./view-state.ts"
import {RoomActions} from "./room-actions"
import {RoomContextMenu, RoomInfoWindow, RoomNavigationHUD} from "./room-navigation-hud"
import {RoomChatWindow} from "./room-chat-window"
import type {ReleaseSettingsClient} from "./release-settings"
import type {DevelopmentRoomSceneModel} from "./development-room-scene"
import type {DevelopmentRoomAgentsModel} from "./development-room-agents"
import {DevelopmentRoomsHUD, DevelopmentRoomsSpace} from "./development-rooms"

/** Одна сеть в одном Space и Document; свет, HUD и ввод разделяют общий lifecycle. */
export function App(props: Readonly<{network?: NetworkSpaceModel | undefined; bot?: Bot | undefined; workspace?: AgentWorkspaceModel | undefined; annotations?: ProductAnnotationState | undefined; scene?: AtomSceneModel | undefined; releaseManagement?: ReleaseSettingsClient | undefined; development?: Readonly<{active: boolean}> | undefined; developmentScene?: DevelopmentRoomSceneModel | undefined; developmentAgents?: DevelopmentRoomAgentsModel | undefined; developmentError?: string | null | undefined; onRefreshDevelopmentCatalog?: (() => void) | undefined; onDevelopment?: (() => void) | undefined; onQuantum?: (() => void) | undefined}>) {
  const network = useMemo(() => props.network ?? createNetworkSpace(), [props.network])
  const developing = props.development?.active === true
  const [context, setContext] = useState<{x: number; y: number} | null>(null)
  useEffect(() => () => {
    props.scene?.dispose()
    props.annotations?.dispose()
    props.workspace?.dispose()
    props.developmentAgents?.dispose()
    props.developmentScene?.dispose()
    network.dispose()
  }, [network, props.workspace, props.annotations, props.scene, props.developmentAgents, props.developmentScene])
  return <>
    <link
      rel="stylesheet"
      href={`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`}
    />
    <space onContextMenu={event => {
      if (event.defaultPrevented || (developing
        ? props.developmentScene?.getSnapshot().selectedPackage?.resolution !== "source"
        : props.scene?.getSnapshot().mode !== "atoms")) return
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return
      event.preventDefault()
      setContext({x: event.clientX, y: event.clientY})
    }} style={css`
      font-family: var(--font-family);
      color: var(--widget-regular-content);
      --chat-surface-background: transparent;
      --chat-bubble-background: rgba(50, 58, 68, .24);
      --chat-composer-background: rgba(50, 58, 68, .28);
      --widget-surface-background: rgba(24, 30, 38, .14);
      --widget-text-background: rgba(35, 42, 50, .24);
      --space-node-navigation-background: rgba(25, 32, 40, .3);
      --space-node-header-background: rgba(35, 44, 55, .3);
      & [data-spatial-node-id] {background: transparent; backdrop-filter: none; --spatial-node-surface-opacity: 0;}
      & [data-metafor-display-fitted="true"] {backdrop-filter: blur(8px); --spatial-node-surface-opacity: .16;}
    `}>
      <viewpoint
        x={INITIAL_VIEW_POINT.position.x}
        y={INITIAL_VIEW_POINT.position.y}
        z={INITIAL_VIEW_POINT.position.z}
        targetX={INITIAL_VIEW_POINT.target.x}
        targetY={INITIAL_VIEW_POINT.target.y}
        targetZ={INITIAL_VIEW_POINT.target.z}
        fov={INITIAL_VIEW_POINT.fov}
        near={INITIAL_VIEW_POINT.near}
        far={INITIAL_VIEW_POINT.far}
        controls={true}
      />
      <xr-light
        name="Основной свет сети"
        kind="directional"
        color="#d9eaff"
        intensity={3}
        x={-100000}
        y={-100000}
        z={200000}
      />
      <xr-light
        name="Мягкий свет сети"
        kind="directional"
        color="#8ed8dc"
        intensity={1.5}
        x={100000}
        y={40000}
        z={120000}
      />
      <xr-light
        name="Контровой свет сети"
        kind="directional"
        color="#cfb5f3"
        intensity={1}
        x={0}
        y={100000}
        z={60000}
      />
      {props.scene ? <AtomSceneView active={!developing} scene={props.scene} network={network} workspace={props.workspace!} bot={props.bot} /> : null}
      {!props.scene && !developing ? <NetworkSpace model={network} /> : null}
      {!developing && props.workspace === undefined && props.bot !== undefined ? <BotAvatar bot={props.bot!} /> : null}
      {developing || props.workspace === undefined || props.scene !== undefined ? null : <AgentOffices workspace={props.workspace!} bot={props.bot} />}
      {props.developmentScene && props.developmentAgents ? <DevelopmentRoomsSpace
        active={developing}
        scene={props.developmentScene}
        agents={props.developmentAgents}
        bot={props.bot}
      /> : null}
      <hud id="cosmos-development-hud">
        {props.onDevelopment && props.onQuantum ? <ModeTabs active={developing ? "cosmos" : "quantum"}
          onQuantum={props.onQuantum} onCosmos={props.onDevelopment} /> : null}
        <div hidden={developing} style={css`
          &[hidden] {
            display: none;
          }
        `}>
        {props.scene ? <AtomNavigation scene={props.scene} workspace={props.workspace!} annotations={props.annotations} /> : <NetworkNavigation network={network} workspace={props.workspace} annotations={props.annotations} />}
        </div>
        {props.workspace && props.scene ? <AgentRoomHUD active={!developing} workspace={props.workspace} scene={props.scene} /> : null}
        {props.workspace && props.scene ? <RoomExperience
          active={!developing}
          workspace={props.workspace}
          scene={props.scene}
          context={context}
          onCloseContext={() => setContext(null)}
        /> : null}
        {props.workspace ? <AgentParking workspace={props.workspace} /> : null}
        {props.annotations ? <AnnotationHUD active={!developing} model={props.annotations} workspace={props.workspace} /> : null}
        {props.developmentScene && props.developmentAgents ? <DevelopmentRoomsHUD
          active={developing}
          scene={props.developmentScene}
          agents={props.developmentAgents}
          catalogError={props.developmentError ?? null}
          onRefreshCatalog={props.onRefreshDevelopmentCatalog}
          context={context}
          onCloseContext={() => setContext(null)}
        /> : null}
        {props.workspace ? <AgentProviderHUD workspace={props.workspace} scene={props.scene} releaseManagement={props.releaseManagement} /> : null}
      </hud>
    </space>
  </>
}

function AtomSceneView(props: Readonly<{active: boolean; scene: AtomSceneModel; network: NetworkSpaceModel; workspace: AgentWorkspaceModel; bot?: Bot | undefined}>) {
  const state = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const spatial = useSpatialVisibility(props.scene.spatial, props.active)
  return <>
    <SpatialTree source={spatial} style={css`
      ${!props.active && css`
        display: none;
      `}
    `} />
    <AtomOffices active={props.active} scene={props.scene} workspace={props.workspace} bot={props.bot} />
    {state.mode === "networks" ? <NetworkSpace model={props.network} active={props.active} /> : null}
  </>
}

function AgentRoomHUD(props: Readonly<{active: boolean; scene: AtomSceneModel; workspace: AgentWorkspaceModel}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const workspace = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const roomScope = scene.selectedAtom && workspace.input.verseId ? {verseId: workspace.input.verseId, atomRef: scene.selectedAtom.ref} : null
  const actors = workspace.agents.flatMap(agent => agent.scope && agent.profile && agent.scope.atomRef === roomScope?.atomRef
    ? [{scope: agent.scope, profile: agent.profile}] : [])
  const selected = workspace.agents.find(agent => agent.key === workspace.selected)
  return <RoomActions
    roomScope={roomScope}
    actors={actors}
    providerAccess={{atom: selected?.atom ?? null, registries: workspace.input.providerRegistries, profiles: workspace.input.profiles?.targets}}
    connections={workspace.input.providerRegistries?.flatMap(owner => owner.registry.settings.configuration?.connections ?? [])
      .filter((connection, index, all) => all.findIndex(other => other.id === connection.id) === index)
      .map(connection => ({id: connection.id, label: connection.label ?? connection.id, enabled: connection.enabled})) ?? []}
    clientDirectory={props.workspace.conversations ?? null}
    visible={props.active && scene.mode === "atoms" && roomScope !== null && workspace.input.status === "ready"}
    selectedAgentRef={selected?.scope?.agentRef}
    onCreated={async value => {
      const scope = value.kind === "agent" ? value.agent.scope : value.groups.scope
      await props.workspace.refreshRoom(scope.atomRef as import("@metafor/types/metafor/graph").AtomRef)
      if (value.kind === "agent") props.workspace.select(JSON.stringify([scope.atomRef, value.agent.scope.agentRef]))
    }}
    onCreateAgent={(scope, name, connectionId) => props.workspace.createAgent(scope, name, connectionId)}
    onCreateChat={(scope, label) => {
      if (props.scene.getSnapshot().view !== "room") props.scene.enterRoom()
      return props.workspace.createChat(scope, label)
    }}
  />
}

function RoomExperience(props: Readonly<{
  active: boolean
  workspace: AgentWorkspaceModel
  scene: AtomSceneModel
  context: {x: number; y: number} | null
  onCloseContext(): void
}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const workspace = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const [info, setInfo] = useState(false)
  const ref = scene.selectedAtom?.ref
  const roomLabel = scene.selectedAtom ? scene.source.graph?.template[scene.selectedAtom.meta]?.name ?? scene.selectedAtom.meta : null
  const offices = new Set(scene.offices.filter(value => value.office.owner === ref).map(value => value.office.id))
  const agents = workspace.agents.filter(agent => offices.has(agent.officeId)).map(agent => ({key: agent.key, name: agent.label}))
  const chat = agents.find(agent => agent.key === workspace.focusedChat)
  const observationError = scene.source.status === "error" ? scene.message ?? "Не удалось обновить мир" : undefined
  useEffect(() => {
    props.onCloseContext()
    setInfo(false)
    if (scene.view !== "room" || !chat) props.workspace.closeChat(false)
  }, [ref, scene.view])
  const back = () => {if (chat) props.workspace.closeChat(); else props.scene.back()}
  const display = () => {
    props.workspace.closeChat(false)
    if (ref) props.scene.select(ref, true)
  }
  return <>
    <section hidden={!props.active || scene.mode !== "atoms"} style={css`
      position: absolute;
      left: 12px;
      top: 12px;
      max-width: 100%;
      &[hidden] {display: none;}
    `}>
      <RoomNavigationHUD
        view={scene.view}
        canGoBack={scene.canGoBack}
        roomLabel={roomLabel}
        agents={agents}
        selectedAgentKey={workspace.selected ?? undefined}
        chatOpen={chat !== undefined}
        error={observationError}
        onBack={back}
        onEnter={() => {props.scene.enterRoom()}}
        onAgent={key => props.workspace.openChat(key)}
        onInfo={() => setInfo(true)}
        onDisplay={display}
      />
    </section>
    <RoomChatWindow
      workspace={props.workspace}
      open={props.active && chat !== undefined && scene.view === "room"}
      title={`${roomLabel ?? "Комната"} · ${chat?.name ?? "Чат"}${observationError ? " · Наблюдение недоступно" : ""}`}
      onBack={() => props.workspace.closeChat()}
    />
    <RoomContextMenu
      open={props.active && scene.mode === "atoms" && props.context !== null}
      x={props.context?.x ?? 0}
      y={props.context?.y ?? 0}
      roomLabel={roomLabel ?? "Текущая комната"}
      canGoBack={scene.canGoBack || chat !== undefined}
      onClose={props.onCloseContext}
      onBack={back}
      onEnter={() => {props.scene.enterRoom()}}
      onDisplay={display}
      onInfo={() => setInfo(true)}
    />
    <RoomInfoWindow
      open={props.active && info && scene.mode === "atoms"}
      onOpenChange={setInfo}
      roomLabel={roomLabel ?? "Atom"}
      atom={scene.selectedAtom}
      agents={agents}
    />
  </>
}

function AtomNavigation(props: Readonly<{scene: AtomSceneModel; workspace: AgentWorkspaceModel; annotations?: ProductAnnotationState | undefined}>) {
  const state = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  return <div id="main-display-dock" style={css`position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;`}>
    <Tab label={state.selectedAtom ? `${state.selectedAtom.meta} · ${state.selectedAtom.ref}` : "MetaFor"} position={{edge: "bottom", offset: .5}}>
      <AtomNavigationContents scene={props.scene} annotations={props.annotations} />
    </Tab>
  </div>
}

function AtomNavigationContents(props: Readonly<{scene: AtomSceneModel; annotations?: ProductAnnotationState | undefined}>) {
  const state = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  return <>
      <nav aria-label="Навигация Multiverse" style={css`display: flex; align-items: center; gap: var(--spacing-4); padding: var(--spacing-4);`}>
        {props.annotations ? <AnnotationControl model={props.annotations} /> : null}
        <Button label="−" onClick={() => props.scene.zoom(1.25)} />
        <Button label="Обзор" onClick={() => props.scene.fit()} />
        <Button label="Дисплей" disabled={state.selectedAtom === null} onClick={() => {if (state.selectedAtom) props.scene.select(state.selectedAtom.ref, true)}} />
        <Button label="+" onClick={() => props.scene.zoom(.8)} />
        <Button label="Сети" onClick={() => props.scene.navigateNetworks()} />
      </nav>
      <Typography text={state.message ?? ""} />
  </>
}

/** Два маршрутных режима используют пристыкованные Tab одного HUD. */
function ModeTabs(props: Readonly<{active: "quantum" | "cosmos"; onQuantum(): void; onCosmos(): void}>) {
  return <div id="cosmos-mode-dock" style={css`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `}>
    <Tab label="Quantum" position={{edge: "bottom", offset: .08}}>
      <Button label="Quantum" selected={props.active === "quantum"} onClick={() => {if (props.active !== "quantum") props.onQuantum()}} />
    </Tab>
    <Tab label="Cosmos" position={{edge: "bottom", offset: .2}}>
      <Button label="Cosmos" selected={props.active === "cosmos"} onClick={() => {if (props.active !== "cosmos") props.onCosmos()}} />
    </Tab>
  </div>
}

function AgentParking(props: Readonly<{workspace: AgentWorkspaceModel}>) {
  return <div hidden={true} ref={props.workspace.bindParking} data-agent-parking="true" style={css`display: none;`} />
}

function AgentProviderHUD(props: Readonly<{workspace: AgentWorkspaceModel; scene?: AtomSceneModel | undefined; releaseManagement?: ReleaseSettingsClient | undefined}>) {
  const state = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const [open, setOpen] = useState(false)
  const selected = state.agents.find(agent => agent.key === state.selected)
  return <ProviderHUD registries={state.input.providerRegistries} connectProviderBrowser={props.workspace.connectProviderBrowser} atom={selected?.atom ?? null} open={open} onOpenChange={setOpen} scopeLabel={selected?.label ?? "Verse"}
    profiles={state.input.profiles?.targets} profileError={state.input.profileError} profileIntent={props.workspace.profileIntent}
    releaseManagement={props.releaseManagement} />
}

/** Как в Workbench: общий Tab владеет drag/docking, Button — доступностью и темой. */
function NetworkNavigation(props: Readonly<{network: NetworkSpaceModel; workspace?: AgentWorkspaceModel | undefined; annotations?: ProductAnnotationState | undefined}>) {
  const [vertical, setVertical] = useState(false)
  return <div
    id="main-display-dock"
    style={css`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `}
  >
    <Tab
      label={props.workspace === undefined ? "Сети" : "MetaFor"}
      position={{edge: "bottom", offset: .5}}
      onPositionChange={position => setVertical(position.edge === "left" || position.edge === "right")}
    >
      <NetworkNavigationActions network={props.network} workspace={props.workspace} vertical={vertical} annotations={props.annotations} />
    </Tab>
  </div>
}

function NetworkNavigationActions(props: Readonly<{network: NetworkSpaceModel; vertical: boolean; workspace?: AgentWorkspaceModel | undefined; annotations?: ProductAnnotationState | undefined}>) {
  return <nav
    role="toolbar"
    aria-label="Навигация сети"
    style={css`
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-4);
      ${props.vertical && css`flex-direction: column;`}
    `}
  >
    {props.annotations ? <AnnotationControl model={props.annotations} /> : null}
    {props.workspace === undefined ? null : <WorkspaceNavigation workspace={props.workspace!} />}
    <Button label="−" title="Отдалить сеть" aria-label="Отдалить сеть" onClick={() => props.network.zoom(1.25)} />
    <Button label="Вписать сеть" title="Вписать сеть в область просмотра" onClick={() => props.workspace === undefined ? props.network.fit() : props.workspace.showNetwork()} />
    <Button label="+" title="Приблизить сеть" aria-label="Приблизить сеть" onClick={() => props.network.zoom(.8)} />
  </nav>
}

function BotAvatar(props: Readonly<{bot: Bot}>) {
  return <xr-asset
    name="bot"
    factory={props.bot.object}
    x={550}
    y={0}
    z={0}
    scaleX={.5}
    scaleY={.5}
    scaleZ={.5}
  >
    <xr-animation
      factory={props.bot.animation}
      playing={false}
      loop={true}
    />
  </xr-asset>
}

function WorkspaceNavigation(props: Readonly<{workspace: AgentWorkspaceModel}>) {
  return <>
    <Button label="Агенты" onClick={() => props.workspace.showAgents()} />
    <Button label="Офисы" onClick={() => props.workspace.showOffices()} />
    <Button label="Сети" onClick={() => props.workspace.showNetwork()} />
  </>
}
