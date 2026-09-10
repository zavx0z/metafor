import {useEffect, useMemo} from "@zavx0z/component"
import {createNodeTree, createNodeTreeExternalStore} from "@nodes/tree"
import {layoutFixed} from "@nodes/layout/fixed"
import {GraphEditor} from "@webxr/nodes/editor"

export function InfrastructureSurface(props: Readonly<{width: number; height: number}>) {
  const graph = useMemo(() => {
    const tree = createNodeTree({
      frames: [
        {id: "server", metadata: {label: "Сервер"}},
        {id: "browser", metadata: {label: "Браузер"}},
      ],
      nodes: [],
    })
    return {tree, store: createNodeTreeExternalStore(tree)}
  }, [])
  useEffect(() => () => graph.tree.dispose(), [graph])
  const layout = useMemo(() => layoutFixed({
    viewport: {width: props.width, height: props.height},
    nodes: graph.tree.getSnapshot().frames.map(frame => ({
      id: frame.id,
      width: 280,
      height: 220,
    })),
    ports: [],
    edges: [],
    layoutOptions: {spacing: 48, padding: 32},
  }), [graph, props.width, props.height])

  return <GraphEditor
    store={graph.store}
    layout={layout}
    title="Инфраструктура"
    label="Инфраструктура Cosmos"
    width={props.width}
    height={props.height}
    maxScale={1}
    style={css`
      border: none;
      border-radius: 0;
    `}
  />
}
