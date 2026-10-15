import {useMemo} from "@zavx0z/immersive/XReact"
import {GraphView, type GraphInput, type GraphNodeProps, type GraphLayoutComputer} from "@zavx0z/immersive/nodes/view"
import DiagramNode from "@zavx0z/immersive/nodes/diagram"
import {layoutFixed} from "@zavx0z/immersive/nodes/layout"
import type {DevelopmentCatalog, DevelopmentDependency, DevelopmentDependencyKind, DevelopmentPackage} from "../../../release/shared/development"

export type DevelopmentDependencyGraphProps = Readonly<{
  catalog: DevelopmentCatalog
  selectedPackage: string
  onSelectPackage(name: string): void
}>

type PackageNodeData = Readonly<{name: string; label: string; address: string; resolution: DevelopmentPackage["resolution"] | null; dependencies: readonly DevelopmentDependency[]}>
const colors: Record<DevelopmentDependencyKind, string> = {
  dependencies: "#81c784", devDependencies: "#90caf9", peerDependencies: "#ce93d8", optionalDependencies: "#ffcc80",
}

function PackageNode(props: GraphNodeProps) {
  const data = props.data as PackageNodeData
  const declared = data.dependencies.map(edge => `${edge.kind} ${edge.range}`).join(" · ")
  const description = [data.label === data.name ? data.name : `${data.label} · ${data.name}`,
    data.resolution ?? "Нет в каталоге", declared].filter(Boolean).join(" · ")
  return <DiagramNode
    id={props.id}
    description={description}
    title={data.address || data.name}
    rect={props.rect}
    intrinsic={props.intrinsic}
    elementRef={props.elementRef}
    selected={props.selected}
    hidden={props.hidden}
    onActivate={props.onActivate}
  />
}

/** Производная диаграмма только выбранного package и его прямых manifest-зависимостей. */
export function developmentDependencyGraph(catalog: DevelopmentCatalog, selectedPackage: string): Readonly<{
  input: GraphInput
  layout: GraphLayoutComputer
  known: ReadonlySet<string>
}> {
  const packages = new Map(catalog.packages.map(pkg => [pkg.name, pkg]))
  const declared = catalog.dependencies.filter(edge => edge.from === selectedPackage)
  const names = [...new Set([selectedPackage, ...declared.map(edge => edge.to)])]
  const input: GraphInput = {nodes: names.map(name => {
    const pkg = packages.get(name)
    return {id: name, view: PackageNode, data: {name, label: pkg?.label ?? name, address: pkg?.address ?? "",
      resolution: pkg?.resolution ?? null, dependencies: declared.filter(edge => edge.to === name)} satisfies PackageNodeData}
  })}
  const layout: GraphLayoutComputer = measurements => {
    const sizes = new Map(measurements.map(node => [node.id, node]))
    const result = layoutFixed({viewport: {width: 960, height: 600},
      nodes: names.map(name => {
        const size = sizes.get(name)
        if (!size) throw new Error(`Не измерен пакет ${name}`)
        return {id: name, width: size.width, height: size.height}
      }),
      ports: names.flatMap(name => [
        ...(declared.some(edge => edge.from === name) ? [{id: `${name}/out`, nodeId: name, y: sizes.get(name)!.height / 2}] : []),
        ...(declared.some(edge => edge.to === name) ? [{id: `${name}/in`, nodeId: name, y: sizes.get(name)!.height / 2}] : []),
      ]),
      edges: declared.map((edge, index) => ({id: `dependency:${index}`, sourcePortId: `${edge.from}/out`, targetPortId: `${edge.to}/in`})),
      layoutOptions: {spacing: 48, padding: 32},
    })
    return {bounds: result.bounds, nodes: result.nodes, links: declared.map((edge, index) => {
      const section = result.edges.find(value => value.id === `dependency:${index}`)!.sections[0]!
      return {id: `dependency:${index}`, title: `${edge.from} → ${edge.to} · ${edge.kind} ${edge.range}`,
        route: {kind: "orthogonal" as const, points: [section.startPoint, ...section.bendPoints, section.endPoint]},
        color: colors[edge.kind], endArrow: true}
    })}
  }
  return {input, layout, known: new Set(packages.keys())}
}

/** Общий GraphView остаётся внутри Document принимающего Workbench. */
export function DevelopmentDependencyGraph(props: DevelopmentDependencyGraphProps) {
  const graph = useMemo(() => developmentDependencyGraph(props.catalog, props.selectedPackage), [props.catalog, props.selectedPackage])
  return <div
    data-development-dependency-graph={props.selectedPackage}
    style={css`
      display: flex;
      flex: 1;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    `}
  >
    <GraphView
      key={`${props.catalog.revision}:${props.selectedPackage}`}
      input={graph.input}
      layout={graph.layout}
      selection={{kind: "node", id: props.selectedPackage}}
      navigation="pan-zoom"
      autoSize={true}
      label={`Зависимости ${props.selectedPackage}`}
      title="Зависимости пакета"
      onSelectionChange={selection => {if (selection?.kind === "node" && selection.id !== props.selectedPackage && graph.known.has(selection.id)) props.onSelectPackage(selection.id)}}
      style={css`
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
      `}
    />
  </div>
}
