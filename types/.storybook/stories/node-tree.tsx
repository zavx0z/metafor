import {
  createGraphNodeTree,
  reconcileGraphNodeTree,
  type GraphNodeTree,
} from "@metafor/node-tree/graph"
import type {
  Document,
  HTMLElement,
  HTMLInputElement,
} from "@zavx0z/dom"
import {Checkbox} from "@ui/components/checkbox"
import {
  createRoot,
  useState,
} from "@zavx0z/react"
import type {GraphDomStory} from "./dom-story.tsx"
import {createGraphFixture} from "../../../quantum/tests/graph/fixture.ts"
import {graphNodeTreeStorySource} from "./source.ts"

export type GraphNodeTreeStoryArgs = Readonly<{incremented: boolean}>

type GraphNodeTreeSnapshot = ReturnType<GraphNodeTree["snapshot"]>

export type GraphNodeTreeDomRefs = Readonly<{
  root: HTMLElement
  incremented: HTMLInputElement
  stats: HTMLElement
  frames: HTMLElement
  links: HTMLElement
  frameElements: ReadonlyMap<string, HTMLElement>
  nodeElements: ReadonlyMap<string, HTMLElement>
  linkElements: ReadonlyMap<string, HTMLElement>
}>

export type GraphNodeTreeDomStory = GraphDomStory<GraphNodeTreeStoryArgs> & Readonly<{
  tree: GraphNodeTree
  refs: GraphNodeTreeDomRefs
  snapshot(): GraphNodeTreeSnapshot
}>

type GraphNodeTreePresentationProps = Readonly<{
  tree: GraphNodeTree
  initialIncremented: boolean
  onArgsChange(args: GraphNodeTreeStoryArgs): void
}>

function GraphNodeTreePresentation(props: GraphNodeTreePresentationProps) {
  const [incremented, setIncremented] = useState(props.initialIncremented)
  const snapshot = props.tree.snapshot()
  const onChange = (nextChecked: boolean): void => {
    reconcileGraphNodeTree(props.tree, graphFixture(nextChecked))
    const next = Object.freeze({incremented: nextChecked})
    props.onArgsChange(next)
    setIncremented(nextChecked)
  }
  return <section
    data-projection="graph-live"
    data-revision={String(snapshot.revision)}
    data-topology-revision={String(snapshot.topologyRevision)}
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        gap: 4px;
        padding: 6px;
        overflow: auto;
        background: var(--space-node-navigation-background);
        color: var(--widget-box-content);
      }
    `}
  >
    <header style={css`
      & {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        min-height: 28px;
        gap: 4px;
      }
    `}>
      <h2 style={css`
        & { display: block; margin: 0; color: var(--widget-box-content); font-size: var(--font-size-md); }
      `}>Graph · NodeTree projection</h2>
      <label
        data-control-key="incremented"
        style={css`
          & {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
            padding: 2px 4px;
            background: var(--space-node-header-background);
            font-size: var(--font-size-xs);
          }
        `}
      >
        <Checkbox
          checked={incremented}
          title="Изменить runtime count"
          onChange={onChange}
          style={css`& { flex-shrink: 0; }`}
        />
        Изменить runtime count
      </label>
    </header>
    <dl data-story-region="stats" style={css`
      & {
        display: flex;
        flex-direction: row;
        gap: 6px;
        margin: 0;
        padding: 4px;
        background: var(--space-node-execution-background);
      }
    `}>
      <GraphNodeTreeStat label="Revision" value={snapshot.revision} />
      <GraphNodeTreeStat label="Topology" value={snapshot.topologyRevision} />
      <GraphNodeTreeStat label="Frames" value={snapshot.frames.length} />
      <GraphNodeTreeStat label="Nodes" value={snapshot.nodes.length} />
      <GraphNodeTreeStat label="Links" value={snapshot.links.length} />
    </dl>
    <div data-story-region="frames" style={css`
      & {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 4px;
        overflow-x: auto;
      }
    `}>
      {snapshot.frames.map((frame) => <GraphNodeTreeFrame
        key={frame.id}
        frame={frame}
        nodes={snapshot.nodes.filter((node) => node.frameId === frame.id)}
      />)}
    </div>
    <ul data-story-region="links" aria-label="Graph links" style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-height: 96px;
        margin: 0;
        padding: 2px;
        overflow-y: auto;
        border: var(--border-width-control) solid var(--widget-regular-outline);
        border-radius: 4px;
        background: var(--widget-text-background);
      }
    `}>
      {snapshot.links.map((link) => <GraphNodeTreeLink key={link.id} link={link} />)}
    </ul>
  </section>
}

function GraphNodeTreeStat(props: Readonly<{label: string; value: number}>) {
  return <div style={css`& { display: flex; flex-direction: row; gap: 2px; }`}>
    <dt style={css`
      & { display: block; color: var(--widget-text-content-readonly); font-size: var(--font-size-2xs); }
    `}>{props.label}</dt>
    <dd style={css`
      & { display: block; margin: 0; color: var(--widget-box-content); font-size: var(--font-size-2xs); }
    `}>{String(props.value)}</dd>
  </div>
}

type GraphFrame = GraphNodeTreeSnapshot["frames"][number]
type GraphNode = GraphNodeTreeSnapshot["nodes"][number]
type GraphLink = GraphNodeTreeSnapshot["links"][number]
type GraphParameter = GraphNode["parameters"][number]
type GraphSocket = GraphNode["sockets"][number]

function GraphNodeTreeFrame(props: Readonly<{frame: GraphFrame; nodes: readonly GraphNode[]}>) {
  return <section
    data-frame-id={props.frame.id}
    data-parent-frame-id={props.frame.parentFrameId}
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 240px;
        min-height: 88px;
        gap: 3px;
        padding: 4px;
        overflow: hidden;
        border: var(--border-width-control) solid var(--widget-box-outline);
        border-radius: 4px;
        background: var(--widget-box-background);
        color: var(--widget-box-content);
      }
    `}
  >
    <h3 style={css`
      & { display: block; margin: 0; color: var(--widget-box-content); font-size: var(--font-size-xs); }
    `}>{props.frame.metadata?.label ?? props.frame.id} · {props.frame.id}</h3>
    <div style={css`& { display: flex; flex-direction: column; gap: 3px; }`}>
      {props.nodes.map((node) => <GraphNodeTreeNode key={node.id} node={node} />)}
    </div>
  </section>
}

function GraphNodeTreeNode(props: Readonly<{node: GraphNode}>) {
  return <article
    data-node-id={props.node.id}
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px;
        overflow: hidden;
        border: var(--border-width-control) solid var(--widget-regular-background-selected);
        border-radius: 0;
        background: var(--widget-box-background);
        color: var(--widget-box-content);
      }
    `}
  >
    <h4 style={css`
      & { display: block; margin: 0; color: var(--widget-box-content); font-size: var(--font-size-xs); }
    `}>{props.node.metadata?.title ?? props.node.id} · {props.node.id}</h4>
    <ul aria-label={`Parameters for ${props.node.id}`} style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-height: 96px;
        margin: 0;
        padding: 2px;
        overflow-y: auto;
        color: var(--widget-list-content);
      }
    `}>
      {props.node.parameters.map((parameter) => <GraphNodeTreeParameter
        key={parameter.id}
        parameter={parameter}
      />)}
    </ul>
    <ul aria-label={`Sockets for ${props.node.id}`} style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-height: 96px;
        margin: 0;
        padding: 2px;
        overflow-y: auto;
        color: var(--widget-list-content);
      }
    `}>
      {props.node.sockets.map((socket) => <GraphNodeTreeSocket
        key={socket.id}
        socket={socket}
      />)}
    </ul>
  </article>
}

function GraphNodeTreeParameter(props: Readonly<{parameter: GraphParameter}>) {
  return <li
    data-parameter-id={props.parameter.id}
    style={css`
      & { display: block; min-height: 24px; padding: 2px 6px; font-size: var(--font-size-xs); }
    `}
  >{props.parameter.presentation.label}: {displayValue(props.parameter.value)}</li>
}

function GraphNodeTreeSocket(props: Readonly<{socket: GraphSocket}>) {
  return <li
    data-socket-id={props.socket.id}
    style={css`
      & { display: block; min-height: 24px; padding: 2px 6px; font-size: var(--font-size-xs); }
    `}
  >{props.socket.direction} · {props.socket.metadata?.label ?? props.socket.id}</li>
}

function GraphNodeTreeLink(props: Readonly<{link: GraphLink}>) {
  return <li
    data-link-id={props.link.id}
    style={css`
      & {
        display: block;
        min-height: 24px;
        padding: 2px 6px;
        color: var(--widget-list-content);
        font-size: var(--font-size-xs);
      }
    `}
  >{props.link.metadata?.label ?? props.link.id}: {props.link.from.nodeId}/{props.link.from.socketId} → {props.link.to.nodeId}/{props.link.to.socketId}</li>
}

/** Presents the actual derived GraphNodeTree as one retained TSX ComponentRoot. */
export function createGraphNodeTreeStory(document: Document): GraphNodeTreeDomStory {
  const tree = createGraphNodeTree(graphFixture(false))
  const staging = document.createElement("div")
  const componentRoot = createRoot(staging)
  let currentArgs: GraphNodeTreeStoryArgs = Object.freeze({incremented: false})
  let disposed = false
  componentRoot.render(<GraphNodeTreePresentation
    tree={tree}
    initialIncremented={false}
    onArgsChange={(next) => { currentArgs = next }}
  />)
  const element = staging.firstElementChild as HTMLElement | null
  if (element === null || element.getAttribute("data-projection") !== "graph-live") {
    componentRoot.unmount()
    tree.dispose()
    throw new Error("Graph NodeTree story did not mount")
  }
  staging.removeChild(element)
  const refs = graphNodeTreeRefs(element)

  return Object.freeze({
    element,
    componentRoot,
    tree,
    refs,
    get args() { return currentArgs },
    get source() {
      const snapshot = tree.snapshot()
      return graphNodeTreeStorySource({
        element,
        incremented: currentArgs.incremented,
        revision: snapshot.revision,
        topologyRevision: snapshot.topologyRevision,
        frames: snapshot.frames.length,
        nodes: snapshot.nodes.length,
        links: snapshot.links.length,
      })
    },
    snapshot: () => tree.snapshot(),
    dispose() {
      if (disposed) return
      disposed = true
      componentRoot.unmount()
      tree.dispose()
    },
  })
}

function graphNodeTreeRefs(root: HTMLElement): GraphNodeTreeDomRefs {
  const incremented = root.querySelector('[data-control-key="incremented"] input') as HTMLInputElement | null
  const stats = root.querySelector('[data-story-region="stats"]') as HTMLElement | null
  const frames = root.querySelector('[data-story-region="frames"]') as HTMLElement | null
  const links = root.querySelector('[data-story-region="links"]') as HTMLElement | null
  if (incremented === null || stats === null || frames === null || links === null) {
    throw new Error("Graph NodeTree story refs are incomplete")
  }
  return Object.freeze({
    root,
    incremented,
    stats,
    frames,
    links,
    frameElements: indexedElements(root, "data-frame-id"),
    nodeElements: indexedElements(root, "data-node-id"),
    linkElements: indexedElements(root, "data-link-id"),
  })
}

function indexedElements(root: HTMLElement, attribute: string): ReadonlyMap<string, HTMLElement> {
  return new Map([...root.querySelectorAll(`[${attribute}]`)].map((element) => [
    element.getAttribute(attribute)!,
    element as HTMLElement,
  ]))
}

function displayValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function graphFixture(incremented: boolean) {
  const graph = createGraphFixture()
  const root = graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Graph NodeTree fixture root Atom is absent")
  root.values.count = incremented ? 1 : 0
  return graph
}
