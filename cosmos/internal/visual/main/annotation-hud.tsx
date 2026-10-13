import {useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {IconButton, Window} from "@zavx0z/immersive/ui"
import {iconSvg} from "@zavx0z/immersive/ui/icons"
import type {ClientAnnotationTarget} from "@metafor/types/cosmos/client"
import type {ProductAnnotationState} from "./product-annotation-state"
import type {AgentWorkspaceModel} from "./agent-workspace"

const pencil = iconSvg('<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/><path d="m4 15 5 5"/>')

/** Обычный IconButton в существующем Tab включает выбор того же Document. */
export function AnnotationControl(props: Readonly<{model: ProductAnnotationState}>) {
  const state = useSyncExternalStore(props.model.subscribe, props.model.getSnapshot)
  return <span data-annotation-ui="true">
    <IconButton label="Аннотировать Root" title="Выбрать элемент для аннотации" iconSrc={pencil} variant="text" selected={state.enabled}
      onClick={() => props.model.setEnabled(!state.enabled)} />
  </span>
}

/** Окно и отметки принадлежат существующему HUD; unknown projection не рисует фиктивную геометрию. */
export function AnnotationHUD(props: Readonly<{model: ProductAnnotationState; workspace?: AgentWorkspaceModel | undefined}>) {
  const state = useSyncExternalStore(props.model.subscribe, props.model.getSnapshot)
  return <>
    {state.enabled && state.selected?.projection.hudPoint ? <AnnotationMark target={state.selected} label="Выбрано" /> : null}
    {state.enabled && state.active?.projection.hudPoint && state.active.semanticNodeId !== state.selected?.semanticNodeId ? <AnnotationMark target={state.active} label="Активно" /> : null}
    <Window id="root-annotation-window" title="Аннотация · Root" open={state.enabled} onOpenChange={open => props.model.setEnabled(open)}
      geometry={{x: 24, y: 24, width: 360, height: 320}} movable={true} resizable={true}>
      <AnnotationBody model={props.model} workspace={props.workspace} />
    </Window>
  </>
}

function AnnotationBody(props: Readonly<{model: ProductAnnotationState; workspace?: AgentWorkspaceModel | undefined}>) {
  const state = useSyncExternalStore(props.model.subscribe, props.model.getSnapshot)
  return <section data-annotation-ui="true" style={css`display: flex; flex-direction: column; gap: 8px; padding: 12px;`}>
        <p>Выберите элемент в текущем представлении.</p>
        {state.selected ? <AnnotationDetails target={state.selected} text={state.textSelection} /> : <AnnotationMessage text="Элемент не выбран" />}
        <p>Выбор автоматически передаёт служебное наблюдение выбранному агенту.</p>
        {state.message ? <AnnotationMessage text={state.message} /> : null}
      </section>
}

function AnnotationDetails(props: Readonly<{target: ClientAnnotationTarget; text: string}>) {
  return <div>
    <p>{props.target.tag} · semantic {props.target.semanticNodeId}</p>
    <p>Atom: {props.target.ownAtomRef ?? "unknown"}</p>
    <p>Spatial hit: {props.target.spatialHitId ?? "unknown"}</p>
    <p>HUD projection: {props.target.projection.status}</p>
    <p>{props.text || props.target.text}</p>
  </div>
}
function AnnotationMessage(props: Readonly<{text: string}>) {return <p role="status">{props.text}</p>}

function AnnotationMark(props: Readonly<{target: ClientAnnotationTarget; label: string}>) {
  const point = props.target.projection.hudPoint!
  return <div data-annotation-ui="true" data-annotation-mark={props.label} style={css`
    position: absolute;
    left: ${point.x}px;
    top: ${point.y}px;
    pointer-events: none;
    border: 2px solid #ffd36a;
    border-radius: 8px;
    padding: 2px 6px;
    color: #ffd36a;
    background: rgb(0 0 0 / .8);
  `}>{props.label} · {props.target.semanticNodeId}</div>
}
