import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Tab, Typography} from "@zavx0z/immersive/ui"
import {AnnotationControl, AnnotationHUD} from "./annotation-hud"
import type {ProductAnnotationState} from "./product-annotation-state"
import type {Bot} from "./bot.ts"
import {createNetworkSpace, NetworkSpace, type NetworkSpaceModel} from "./network-space.tsx"
import {AgentOffices, AtomOffices} from "./agent-offices"
import {SpatialTree} from "@zavx0z/immersive/nodes/spatial/tree"
import {ProviderHUD} from "./provider-hud"
import type {AtomSceneModel} from "./atom-scene"
import type {AgentWorkspaceModel} from "./agent-workspace"
import {INITIAL_VIEW_POINT} from "./view-state.ts"

/** Одна сеть в одном Space и Document; свет, HUD и ввод разделяют общий lifecycle. */
export function App(props: Readonly<{network?: NetworkSpaceModel | undefined; bot?: Bot | undefined; workspace?: AgentWorkspaceModel | undefined; annotations?: ProductAnnotationState | undefined; scene?: AtomSceneModel | undefined}>) {
  const network = useMemo(() => props.network ?? createNetworkSpace(), [props.network])
  useEffect(() => () => {
    props.scene?.dispose()
    props.annotations?.dispose()
    props.workspace?.dispose()
    network.dispose()
  }, [network, props.workspace, props.annotations, props.scene])
  return <>
    <link
      rel="stylesheet"
      href={`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`}
    />
    <space style={css`
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
      {props.scene ? <AtomSceneView scene={props.scene} network={network} workspace={props.workspace!} bot={props.bot} /> : <NetworkSpace model={network} />}
      {props.workspace === undefined && props.bot !== undefined ? <BotAvatar bot={props.bot!} /> : null}
      {props.workspace === undefined || props.scene !== undefined ? null : <AgentOffices workspace={props.workspace!} bot={props.bot} />}
      <hud>
        {props.scene ? <AtomNavigation scene={props.scene} workspace={props.workspace!} annotations={props.annotations} /> : <NetworkNavigation network={network} workspace={props.workspace} annotations={props.annotations} />}
        {props.workspace ? <AgentProviderHUD workspace={props.workspace} scene={props.scene} /> : null}
        {props.workspace ? <AgentParking workspace={props.workspace} /> : null}
        {props.annotations ? <AnnotationHUD model={props.annotations} workspace={props.workspace} /> : null}
      </hud>
    </space>
  </>
}

function AtomSceneView(props: Readonly<{scene: AtomSceneModel; network: NetworkSpaceModel; workspace: AgentWorkspaceModel; bot?: Bot | undefined}>) {
  const state = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  return <>
    <SpatialTree source={props.scene.spatial} />
    <AtomOffices scene={props.scene} workspace={props.workspace} bot={props.bot} />
    {state.mode === "networks" ? <NetworkSpace model={props.network} /> : null}
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

function AgentParking(props: Readonly<{workspace: AgentWorkspaceModel}>) {
  return <div hidden={true} ref={props.workspace.bindParking} data-agent-parking="true" style={css`display: none;`} />
}

function AgentProviderHUD(props: Readonly<{workspace: AgentWorkspaceModel; scene?: AtomSceneModel | undefined}>) {
  const state = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const [open, setOpen] = useState(false)
  const selected = state.agents.find(agent => agent.key === state.selected)
  return <ProviderHUD registries={state.input.providerRegistries} connectProviderBrowser={props.workspace.connectProviderBrowser} atom={selected?.atom ?? null} open={open} onOpenChange={setOpen} scopeLabel={selected?.label ?? "Verse"}
    profiles={state.input.profiles?.targets} profileError={state.input.profileError} profileIntent={props.workspace.profileIntent} />
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
