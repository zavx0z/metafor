import {useEffect, useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {Button, Inspector, Typography} from "@zavx0z/immersive/ui"
import {iconSvg} from "@zavx0z/immersive/ui/icons"
import type {AtomRef, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel} from "./agent-workspace"
import type {AtomSceneModel} from "./atom-scene"
import {AtomFieldNode} from "./atom-field-node"

const stateIcon = iconSvg('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>')
const matterIcon = iconSvg('<path d="M12 4v6M5 16v-6h14v6"/><rect x="8" y="1" width="8" height="4"/><rect x="1" y="16" width="8" height="6"/><rect x="15" y="16" width="8" height="6"/>')
const massIcon = iconSvg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>')

/** Agent принадлежит owning Atom либо сам является адресованным Atom. */
export function agentsForAtom(workspace: AgentWorkspaceModel, ref: AtomRef) {
  const snapshot = workspace.getSnapshot()
  return snapshot.agents.filter(agent => agent.atom?.ref === ref || snapshot.input.offices.some(office => office.id === agent.officeId && office.owner === ref))
}

/** Содержимое готового SpatialTree Display; состояние и связи берутся из наблюдаемого Atom. */
export function AtomSurface(props: Readonly<{atom: RuntimeAtom; workspace: AgentWorkspaceModel; scene: AtomSceneModel}>) {
  const scene = useSyncExternalStore(props.scene.subscribe, props.scene.getSnapshot)
  const active = scene.mode === "atoms" && scene.selectedAtom?.ref === props.atom.ref
  return <section data-atom-ref={props.atom.ref} style={css`
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  `}>
    {active ? <AtomInspector atom={props.atom} scene={props.scene} workspace={props.workspace} active={active} /> : null}
  </section>
}

function AtomInspector(props: Readonly<{atom: RuntimeAtom; scene: AtomSceneModel; workspace: AgentWorkspaceModel; active: boolean}>) {
  const [panel, setPanel] = useState("state")
  const [notice, setNotice] = useState("")
  const lifetime = useMemo(() => new AbortController(), [props.atom.ref])
  useEffect(() => () => lifetime.abort(), [lifetime])
  return <Inspector ariaLabel="Инспектор Atom" categoriesLabel="Панели Atom" selectedCategoryId={panel} onCategoryChange={setPanel} query="" showSearch={false}
    style={css`
      flex: 1;
      height: auto;
      min-height: 0;
    `}
    categories={[{id: "state", label: "Состояние", iconSrc: stateIcon, panelIds: ["state"]}, {id: "matter", label: "Matter", iconSrc: matterIcon, panelIds: ["matter"]}, {id: "mass", label: "Mass", iconSrc: massIcon, panelIds: ["mass"]}]}>
    <AtomInspectorPanels atom={props.atom} scene={props.scene} workspace={props.workspace} active={props.active} panel={panel} notice={notice} setNotice={setNotice} signal={lifetime.signal} />
  </Inspector>
}

function AtomInspectorPanels(props: Readonly<{atom: RuntimeAtom; scene: AtomSceneModel; workspace: AgentWorkspaceModel; active: boolean; panel: string; notice: string; setNotice(value: string): void; signal: AbortSignal}>) {
  const input = props.workspace.getSnapshot().input
  const slots = input.connectableSlots?.filter(slot => slot.owner?.ref === props.atom.ref && !slot.enabled) ?? []
  return (
    <div style={css`display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: auto; padding: var(--spacing-12);`}>
      <section hidden={props.panel !== "state"} style={css`&[hidden] {display: none;}`}>
        <Typography text={`${props.atom.meta} · ${props.atom.ref}`} />
        <Typography text={`Состояние: ${props.atom.state ?? "не наблюдается"}`} />
        <AtomFieldNode
          key={JSON.stringify([input.verseId, input.observedWorld?.root, input.observedWorld?.cutId, props.atom.ref])}
          atom={props.atom}
          fields={input.graph?.template[props.atom.meta]?.fields ?? []}
          workspace={props.workspace}
          signal={props.signal}
        />
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

function AtomMatterEntry(props: Readonly<{node: RuntimeNode; scene: AtomSceneModel}>) {
  const atom = props.node.kind === "atom" ? props.node : null
  return <Button label={atom ? `${atom.meta} · ${atom.ref}` : props.node.kind} disabled={atom === null} onClick={() => {if (atom) props.scene.select(atom.ref)}} />
}
