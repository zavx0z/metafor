import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Typography} from "@zavx0z/immersive/ui"
import {SpatialEdges} from "@zavx0z/immersive/space"
import type {OfficeLayout} from "@metafor/agent/office-layout"
import {AgentProfileControls} from "@metafor/agent/profile-view"
import {AGENT_CONTROL_DISPLAY, type AgentOfficeSnapshot, type AgentWorkspaceModel} from "./agent-workspace"
import {createOfficeGeometry, createOfficeSceneGeometry, officeEdges, prepareOfficeGeometry} from "./office-geometry"
import type {Bot} from "./bot"
import type {AtomSceneModel} from "./atom-scene"

/** Офис занимает тело своего Atom в общей пространственной проекции Matter. */
export function AtomOffices(props: Readonly<{scene: AtomSceneModel; workspace: AgentWorkspaceModel; bot?: Bot | undefined}>) {
  const snapshot = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  return <>{props.bot ? <SceneOffices snapshot={snapshot} bot={props.bot} workspace={props.workspace} /> : null}</>
}

function SceneOffices(props: Readonly<{snapshot: ReturnType<AtomSceneModel["getSnapshot"]>; bot: Bot; workspace: AgentWorkspaceModel}>) {
  const signature = JSON.stringify(props.snapshot.offices.map(({office, position}) => [office.id, office.bounds, position,
    office.agents.map(agent => [agent.id, agent.atom.getSnapshot().configuration.displays])]))
  const rooms = useMemo(() => props.snapshot.offices.map(placed => ({...placed, id: placed.office.id,
    layout: prepareOfficeGeometry(placed.office, props.bot)})), [signature, props.bot])
  const avatarCapacity = 2 ** Math.ceil(Math.log2(Math.max(32, rooms.reduce((count, room) => count + room.layout.agents.length, 0))))
  const deviceCapacity = 2 ** Math.ceil(Math.log2(Math.max(32, rooms.reduce((count, room) => count + room.layout.agents.reduce((sum, agent) => sum + agent.displays.length, 0), 0))))
  const instances = useMemo(() => createOfficeSceneGeometry(rooms, props.bot, {avatarCapacity, deviceCapacity}), [props.bot, avatarCapacity, deviceCapacity])
  useMemo(() => {instances.update(rooms)}, [instances, rooms])
  useEffect(() => () => instances.dispose(), [instances])
  return <>
    <xr-asset name="Все агенты и устройства Verse" factory={instances.object} />
    {rooms.filter(room => room.office.owner === props.snapshot.selectedAtom?.ref).map(room => <VisitedOfficeScreens
      key={room.id}
      office={room.office}
      layout={room.layout}
      position={room.position}
      workspace={props.workspace}
    />)}
  </>
}

function VisitedOfficeScreens(props: Readonly<{office: AgentOfficeSnapshot; layout: OfficeLayout; position: {x: number; y: number; z: number}; workspace: AgentWorkspaceModel}>) {
  return <>{props.layout.agents.map(agent => <OfficeAgentScreens
    key={agent.id}
    office={props.office}
    agent={agent}
    position={props.position}
    workspace={props.workspace}
  />)}</>
}

/** Existing Space receives fixed offices and a common Display; only explicitly connected Agents appear. */
export function AgentOffices(props: Readonly<{workspace: AgentWorkspaceModel; bot?: Bot | undefined}>) {
  const snapshot = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  return <>
    {snapshot.offices.map(placed => <OfficeIfReady
      key={placed.office.id}
      office={placed.office}
      position={placed.position}
      bot={props.bot}
      workspace={props.workspace}
    />)}
    <display
      id="agent-control-display"
      width={AGENT_CONTROL_DISPLAY.width}
      height={AGENT_CONTROL_DISPLAY.height}
      style={css`
        width: 1200px;
        height: 675px;
        translate: ${snapshot.control.x}mm ${snapshot.control.y}mm ${snapshot.control.z}mm;
        rotate: x 0deg;
        display: flex;
        flex-direction: column;
        background: rgb(var(--surface-900) / .18);
        color: var(--widget-regular-content);
        overflow: hidden;
      `}
    >
      <nav aria-label="Подключённые агенты" style={css`
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-4);
        padding: var(--spacing-8);
      `}>
        {snapshot.agents.map(agent => <Button key={agent.key} label={agent.label}
          selected={snapshot.selected === agent.key} onClick={() => props.workspace.select(agent.key)} />)}
      </nav>
      {snapshot.input.status === "error" ? <Typography text={snapshot.input.error ?? "Не удалось получить подключённых агентов"} /> : null}
      {snapshot.agents.length === 0 ? <Typography text={snapshot.input.status === "loading"
        ? "Загрузка подключённых агентов…" : "Нет подключённых агентов. Подключите агента через назначенную среду Oracle."} /> : null}
      <AgentSlotConnections workspace={props.workspace} />
      {snapshot.agents.length === 0 ? <AgentProfileControls
        targets={snapshot.input.profiles?.targets ?? []}
        error={snapshot.input.profileError}
        intent={props.workspace.profileIntent}
      /> : null}
      {snapshot.mode !== "agents" && snapshot.agents.length > 0
        ? <Button label="Открыть беседу выбранного агента" onClick={() => props.workspace.showAgents()} /> : null}
      <div ref={props.workspace.bindCommon} data-agent-common-host="true" style={css`
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      `} />
    </display>
  </>
}

function AgentSlotConnections(props: Readonly<{workspace: AgentWorkspaceModel}>) {
  const snapshot = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const lifetime = useMemo(() => new AbortController(), [props.workspace])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState("")
  useEffect(() => () => lifetime.abort(), [lifetime])
  return <nav
    aria-label="Объявленные слоты агентов"
    style={css`
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-8);
      padding: var(--spacing-8);
    `}
  >
    {(snapshot.input.connectableSlots ?? []).filter(slot => !slot.enabled).map(slot => <Button
      key={slot.ref}
      label={`Подключить агента · ${slot.owner?.meta ?? slot.ref}`}
      disabled={pending !== null || snapshot.input.status !== "ready" || slot.owner === null}
      onClick={() => {
        setPending(slot.ref)
        setError("")
        void props.workspace.connectSlot(slot.ref, lifetime.signal).catch(error => {
          if (!lifetime.signal.aborted) setError(error instanceof Error ? error.message : "Подключение недоступно")
        }).finally(() => {
          if (!lifetime.signal.aborted) setPending(null)
        })
      }}
    />)}
    <Typography text={error} />
  </nav>
}

function OfficeIfReady(props: Readonly<{office: AgentOfficeSnapshot; position: {x: number; y: number; z: number}; bot?: Bot | undefined; workspace: AgentWorkspaceModel}>) {
  return <>
    {props.bot === undefined ? null : <Office office={props.office} position={props.position} bot={props.bot!} workspace={props.workspace} />}
  </>
}

function Office(props: Readonly<{office: AgentOfficeSnapshot; position: {x: number; y: number; z: number}; bot: Bot; workspace: AgentWorkspaceModel}>) {
  const source = useMemo(() => ({
    subscribe(listener: () => void) {
      const releases = props.office.agents.map(agent => agent.atom.subscribe(listener))
      return () => {for (const release of releases) release()}
    },
    getSnapshot: () => JSON.stringify(props.office.agents.map(agent => [agent.id, agent.atom.getSnapshot().configuration.displays])),
  }), [props.office])
  const declarations = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const layout = useMemo(() => prepareOfficeGeometry(props.office, props.bot), [props.office, props.bot, declarations])
  const avatarCapacity = 2 ** Math.ceil(Math.log2(Math.max(32, layout.agents.length)))
  const deviceCapacity = 2 ** Math.ceil(Math.log2(Math.max(32, layout.agents.reduce((sum, agent) => sum + agent.displays.length, 0))))
  const instances = useMemo(() => createOfficeGeometry(layout, props.bot), [props.bot, avatarCapacity, deviceCapacity])
  instances.update(layout)
  useEffect(() => () => instances.dispose(), [instances])
  const edges = useMemo(() => officeEdges(layout), [layout])
  return <>
    <xr-group name={`Офис ${props.office.label}`} data-atom-ref={props.office.owner} x={props.position.x} y={props.position.y} z={props.position.z}>
      <xr-asset name={`Agent instances ${props.office.id}`} factory={instances.object} />
      <SpatialEdges edges={edges} name={`Границы и устройства ${props.office.label}`} />
    </xr-group>
    {layout.agents.map(agent => <OfficeAgentScreens key={agent.id} office={props.office} agent={agent}
      position={props.position} workspace={props.workspace} />)}
  </>
}

function OfficeAgentScreens(props: Readonly<{
  office: AgentOfficeSnapshot
  agent: OfficeLayout["agents"][number]
  position: {x: number; y: number; z: number}
  workspace: AgentWorkspaceModel
}>) {
  return <>
    {props.agent.displays.map(display => <OfficeScreen key={display.id} office={props.office} agent={props.agent}
      display={display} position={props.position} workspace={props.workspace} />)}
  </>
}

function OfficeScreen(props: Readonly<{
  office: AgentOfficeSnapshot
  agent: OfficeLayout["agents"][number]
  display: OfficeLayout["agents"][number]["displays"][number]
  position: {x: number; y: number; z: number}
  workspace: AgentWorkspaceModel
}>) {
  const {display, agent} = props
  const c = Math.cos(display.rotationZ / 2), s = Math.sin(display.rotationZ / 2), half = Math.SQRT1_2
  const qw = c * half, angle = 2 * Math.acos(qw), length = Math.sqrt(1 - qw * qw)
  const normal = {x: -Math.sin(display.rotationZ), y: Math.cos(display.rotationZ)}
  const offset = display.depth / 2 + agent.scale
  const bind = useMemo(() => (value: HTMLDivElement | null) => {
    props.workspace.bindWall(props.office.id, agent.id, value)
  }, [props.workspace, props.office.id, agent.id])
  const bound = props.office.agents.find(value => value.id === agent.id)!.atom
  const snapshot = useSyncExternalStore(listener => bound.subscribe(listener), () => bound.getSnapshot())
  const descriptor = snapshot.configuration.displays.find(value => value.id === display.id)
  return <display
    data-office-id={props.office.id}
    data-agent-screen={agent.id}
    data-atom-ref={bound.ref}
    data-display-id={display.id}
    width={display.width}
    height={display.height}
    style={css`
      width: 1200px;
      height: 800px;
      translate: ${display.position.x + props.position.x + normal.x * offset}mm ${display.position.y + props.position.y + normal.y * offset}mm ${display.position.z + props.position.z}mm;
      rotate: ${-c * half / length} ${-s * half / length} ${s * half / length} ${angle}rad;
      background: rgb(var(--surface-900) / .18);
      color: var(--widget-regular-content);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `}
  >
    {display.id === "chat" ? <ChatScreen workspace={props.workspace} officeId={props.office.id} agentId={agent.id} bind={bind} />
      : <DeclaredScreen agentId={agent.id} displayId={display.id} source={descriptor?.source} providers={snapshot.providers?.registry.entries ?? []} />}

  </display>
}

function ChatScreen(props: Readonly<{workspace: AgentWorkspaceModel; officeId: string; agentId: string; bind(value: HTMLDivElement | null): void}>) {
  return <>
    <Button label={`Беседа · ${props.agentId}`} onClick={() => props.workspace.select(JSON.stringify([props.officeId, props.agentId]))} />
    <div ref={props.bind} data-agent-wall-host={props.agentId} style={css`
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    `} />
  </>
}

function DeclaredScreen(props: Readonly<{agentId: string; displayId: string; source: unknown; providers: readonly {id: string; service: string; host: string; connection: string}[]}>) {
  return <>
    <Typography text={props.displayId} />
    {props.providers.map(provider => <Typography
      key={provider.id}
      text={`${provider.service} · ${provider.host} · ${provider.connection}`}
    />)}
  </>
}
