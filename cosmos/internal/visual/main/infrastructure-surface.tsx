import {useEffect, useMemo} from "@zavx0z/immersive/XReact"
import {GraphEditor} from "@zavx0z/immersive/nodes/editor"
import {createInfrastructureModel, type InfrastructureModel} from "./infrastructure-model.ts"
import {createInfrastructureLayout} from "./infrastructure-layout.ts"

export function InfrastructureSurface(props: Readonly<{width: number; height: number; model?: InfrastructureModel | undefined}>) {
  const graph = useMemo(() => props.model ?? createInfrastructureModel(), [props.model])
  useEffect(() => props.model === undefined ? () => graph.dispose() : undefined, [graph, props.model])
  const measureLayout = useMemo(() => createInfrastructureLayout(props.width, props.height), [props.width, props.height])

  return <GraphEditor
    store={graph.store}
    measureLayout={measureLayout}
    title="Инфраструктура"
    label="Инфраструктура Cosmos"
    width={props.width}
    height={props.height}
    autoSize={true}
    maxScale={1}
    style={css`
      width: ${props.width}px;
      height: ${props.height}px;
      border: none;
      border-radius: 0;
    `}
  />
}
