import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Inspector, SelectField, Typography} from "@zavx0z/immersive/ui"
import type {AtomRef, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel} from "./agent-workspace"
import type {AtomSceneModel} from "./atom-scene"

/** Agent принадлежит owning Atom либо сам является адресованным Atom. */
export function agentsForAtom(workspace: AgentWorkspaceModel, ref: AtomRef) {
  const snapshot = workspace.getSnapshot()
  return snapshot.agents.filter(agent => agent.atom.ref === ref || snapshot.input.offices.some(office => office.id === agent.officeId && office.owner === ref))
}

/** Содержимое готового SpatialTree Display; состояние и связи берутся из наблюдаемого Atom. */
export function AtomSurface(props: Readonly<{atom: RuntimeAtom; workspace: AgentWorkspaceModel; scene: AtomSceneModel}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const current = useSyncExternalStore(props.workspace.subscribe, props.workspace.getSnapshot)
  const active = scene.mode === "atoms" && scene.selectedAtom?.ref === props.atom.ref
  const agents = agentsForAtom(props.workspace, props.atom.ref)
  return <section data-atom-ref={props.atom.ref} style={css`display: flex; flex-direction: column; height: 100%; min-height: 0; background: transparent;`}>
    {active && agents.length > 0 ? <AtomAgentSurface atom={props.atom} workspace={props.workspace} selected={current.selected} /> : <AtomInspector atom={props.atom} scene={props.scene} workspace={props.workspace} active={active} />}
  </section>
}

function AtomAgentSurface(props: Readonly<{atom: RuntimeAtom; workspace: AgentWorkspaceModel; selected: string | null}>) {
  const agents = agentsForAtom(props.workspace, props.atom.ref)
  const host = useMemo(() => ({current: null as unknown}), [props.workspace])
  const bind = useMemo(() => (value: unknown) => {
    if (value === null) {props.workspace.releaseCommon(host.current); host.current = null}
    else {host.current = value; props.workspace.bindCommon(value)}
  }, [props.workspace, host])
  useEffect(() => () => props.workspace.releaseCommon(host.current), [props.workspace, host])
  return <section aria-label="Агенты выбранного Atom" style={css`display: flex; flex-direction: column; flex: 1; height: 100%; min-height: 0; background: transparent;`}>
    <div hidden={agents.length < 2}>
      <SelectField
        label="Агент"
        value={agents.some(agent => agent.key === props.selected) ? props.selected! : ""}
        options={agents.map(agent => ({key: agent.key, value: agent.key, label: agent.atom.getSnapshot().configuration.id}))}
        onChange={key => {if (agents.some(agent => agent.key === key)) props.workspace.select(key)}}
      />
    </div>
    <div ref={bind} data-agent-common-host="true" style={css`display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;`} />
  </section>
}

function AtomInspector(props: Readonly<{atom: RuntimeAtom; scene: AtomSceneModel; workspace: AgentWorkspaceModel; active: boolean}>) {
  const [panel, setPanel] = useState("state")
  const [notice, setNotice] = useState("")
  const lifetime = useMemo(() => new AbortController(), [props.atom.ref])
  useEffect(() => () => lifetime.abort(), [lifetime])
  return <Inspector ariaLabel="Инспектор Atom" categoriesLabel="Панели Atom" selectedCategoryId={panel} onCategoryChange={setPanel} query="" showSearch={false}
    categories={[{id: "state", label: "Состояние", panelIds: ["state"]}, {id: "matter", label: "Matter", panelIds: ["matter"]}, {id: "mass", label: "Mass", panelIds: ["mass"]}]}>
    <AtomInspectorPanels atom={props.atom} scene={props.scene} workspace={props.workspace} active={props.active} panel={panel} notice={notice} setNotice={setNotice} signal={lifetime.signal} />
  </Inspector>
}

function AtomInspectorPanels(props: Readonly<{atom: RuntimeAtom; scene: AtomSceneModel; workspace: AgentWorkspaceModel; active: boolean; panel: string; notice: string; setNotice(value: string): void; signal: AbortSignal}>) {
  const slots = props.workspace.getSnapshot().input.connectableSlots?.filter(slot => slot.owner?.ref === props.atom.ref && !slot.enabled) ?? []
  return (
    <div style={css`display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; padding: var(--spacing-12);`}>
      <section hidden={props.panel !== "state"} style={css`&[hidden] {display: none;}`}>
        <Typography text={`${props.atom.meta} · ${props.atom.ref}`} />
        <Typography text={`Состояние: ${props.atom.state ?? "не наблюдается"}`} />
        {Object.entries(props.atom.values).map(([key, value]) => <AtomField key={key} name={key} value={value} />)}
        {slots.map(slot => <Button key={slot.ref} label="Подключить агента" disabled={!props.active} onClick={() => {
          void props.workspace.connectSlot(slot.ref, props.signal).then(() => props.setNotice("Подключение передано окружению"), error => {if (!props.signal.aborted) props.setNotice(error instanceof Error ? error.message : "Подключение не подтверждено")})
        }} />)}
        <Typography text={props.notice} />
      </section>
      <section hidden={props.panel !== "matter"} style={css`&[hidden] {display: none;}`}>
        {(props.atom.children ?? []).map((child, index) => <AtomMatterEntry key={index} node={child} scene={props.scene} />)}
      </section>
      <section hidden={props.panel !== "mass"} style={css`&[hidden] {display: none;}`}>
        {props.atom.mass.map(item => <Typography key={item.key} text={`${item.key} · ${item.format} · ${item.ref}`} />)}
        {props.atom.mass.length === 0 ? <Typography text="У Atom нет собственной Mass" /> : null}
      </section>
    </div>
  )
}

function AtomField(props: Readonly<{name: string; value: unknown}>) {
  return <div style={css`padding: 4px 0; overflow-wrap: anywhere;`}><Typography text={`${props.name}: ${typeof props.value === "string" ? props.value.slice(0, 800) : JSON.stringify(props.value)}`} /></div>
}

function AtomMatterEntry(props: Readonly<{node: RuntimeNode; scene: AtomSceneModel}>) {
  const atom = props.node.kind === "atom" ? props.node : null
  return <Button label={atom ? `${atom.meta} · ${atom.ref}` : props.node.kind} disabled={atom === null} onClick={() => {if (atom) props.scene.select(atom.ref)}} />
}
