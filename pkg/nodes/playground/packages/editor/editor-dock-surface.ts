import {
  Button,
  CollectionInput,
  EnumInput,
  Field,
  Pane,
  Typography,
  type CollectionInputItem,
  type EnumInputOption,
  type FieldDefinition,
} from "@ui/components"
import {
  UiSurface,
  flexColumn,
  flexRow,
  uiShapeMetrics,
} from "@ui/elements"

export type NodeTreeEditorDockMode = "nodes" | "parameters" | "links"

export type NodeTreeEditorDockItem = CollectionInputItem & Readonly<{
  removable?: boolean
}>

export type NodeTreeEditorDockOptions = Readonly<{
  nodes: readonly NodeTreeEditorDockItem[]
  selectedNodeId: string | null
  parameters: readonly NodeTreeEditorDockItem[]
  selectedParameterId: string | null
  parameterField: FieldDefinition | null
  links: readonly NodeTreeEditorDockItem[]
  selectedLinkId: string | null
  fromEndpointId: string
  fromEndpoints: readonly EnumInputOption[]
  toEndpointId: string
  toEndpoints: readonly EnumInputOption[]
  canConnect: boolean
  layoutDirty: boolean
  onSelectNode(id: string): void
  onAddNode(): void
  onRemoveNode(id: string): void
  onSelectParameter(id: string): void
  onAddParameter(): void
  onRemoveParameter(id: string): void
  onSelectLink(id: string): void
  onConnect(): void
  onDisconnect(id: string): void
  onFromEndpointChange(id: string): void
  onToEndpointChange(id: string): void
  onRebuildLayout(): void
}>

export type NodeTreeEditorDockPlan = Readonly<{
  header: Readonly<{x: number; y: number; w: number; h: number}>
  body: Readonly<{x: number; y: number; w: number; h: number}>
}>

const INSET = 10
const HEADER_HEIGHT = 30
const MODE_LABELS: Readonly<Record<NodeTreeEditorDockMode, string>> = Object.freeze({
  nodes: "Ноды",
  parameters: "Параметры",
  links: "Связи",
})

export function planNodeTreeEditorDock(width: number, height: number): NodeTreeEditorDockPlan {
  const innerWidth = Math.max(0, width - INSET * 2)
  const innerHeight = Math.max(0, height - INSET * 2)
  const headerHeight = Math.min(HEADER_HEIGHT, innerHeight)
  return Object.freeze({
    header: Object.freeze({x: INSET, y: INSET, w: innerWidth, h: headerHeight}),
    body: Object.freeze({
      x: INSET,
      y: INSET + headerHeight + uiShapeMetrics.tightGap,
      w: innerWidth,
      h: Math.max(0, innerHeight - headerHeight - uiShapeMetrics.tightGap),
    }),
  })
}

/** Dev-only retained authoring dock composed from production UI controls. */
export class NodeTreeEditorDockSurface extends UiSurface {
  readonly #content = this.createRetainedParent()
  #options: NodeTreeEditorDockOptions
  #mode: NodeTreeEditorDockMode = "parameters"
  #version = 0
  #materialized: Readonly<{
    width: number
    height: number
    pixelScale: number
    font: unknown
    version: number
    mode: NodeTreeEditorDockMode
  }> | null = null

  constructor(options: NodeTreeEditorDockOptions) {
    super({bgColor: null, borderColor: null})
    this.#options = options
    this.node.name = "NodeTreeEditorDockSurface"
    this.#content.name = "NodeTreeEditorDockSurface.content"
  }

  get mode(): NodeTreeEditorDockMode {
    return this.#mode
  }

  setMode(mode: NodeTreeEditorDockMode): boolean {
    if (mode === this.#mode) return false
    this.#mode = mode
    this.#version += 1
    this.requestRender()
    return true
  }

  setOptions(options: NodeTreeEditorDockOptions): void {
    this.#options = options
    this.#version += 1
    this.requestRender()
  }

  protected override render(): void {
    const previous = this.#materialized
    if (previous !== null && previous.width === this.rectW && previous.height === this.rectH &&
      previous.pixelScale === this.pixelScale && previous.font === this.font &&
      previous.version === this.#version && previous.mode === this.#mode) return

    this.materializeRetainedParent(this.#content, () => this.#draw())
    this.#materialized = Object.freeze({
      width: this.rectW,
      height: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
      version: this.#version,
      mode: this.#mode,
    })
  }

  #draw(): void {
    const plan = planNodeTreeEditorDock(this.rectW, this.rectH)
    Pane(this, 0, 0, this.rectW, this.rectH, {
      appearance: "panel",
      key: "node-tree-editor-dock",
      sx: {padding: 0},
      children: () => {
        this.#drawHeader(plan.header)
        if (this.#mode === "nodes") this.#drawNodes(plan.body)
        else if (this.#mode === "parameters") this.#drawParameters(plan.body)
        else this.#drawLinks(plan.body)
      },
    })
  }

  #drawHeader(frame: NodeTreeEditorDockPlan["header"]): void {
    const options = this.#options
    const compact = frame.w < 560
    flexRow({
      ...frame,
      gap: uiShapeMetrics.tightGap,
      alignItems: "stretch",
      items: [
        ...(["nodes", "parameters", "links"] as const).map((mode) => ({
          width: compact ? 78 : 108,
          height: frame.h,
          draw: (x: number, y: number, w: number, h: number) => Button(this, x, y, w, h, {
            children: MODE_LABELS[mode],
            appearance: "tab",
            variant: this.#mode === mode ? "contained" : "glass",
            color: "neutral",
            selected: this.#mode === mode,
            onClick: () => { this.setMode(mode) },
          }),
        })),
        {width: "grow" as const, height: frame.h, draw: (x: number, y: number, w: number, h: number) => {
          Typography(this, x, y, w, h, {
            children: options.layoutDirty ? "LAYOUT УСТАРЕЛ" : "LAYOUT АКТУАЛЕН",
            variant: "caption",
            color: options.layoutDirty ? "orange" : "muted",
          })
        }},
        {width: compact ? 170 : 190, height: frame.h, draw: (x: number, y: number, w: number, h: number) => Button(this, x, y, w, h, {
          children: "Перестроить layout",
          variant: options.layoutDirty ? "contained" : "glass",
          color: options.layoutDirty ? "warning" : "neutral",
          disabled: !options.layoutDirty,
          onClick: options.onRebuildLayout,
        })},
      ],
    })
  }

  #drawNodes(frame: NodeTreeEditorDockPlan["body"]): void {
    const options = this.#options
    CollectionInput(this, frame.x, frame.y, frame.w, frame.h, {
      key: "node-tree-editor:nodes",
      items: options.nodes,
      selectedId: options.selectedNodeId,
      visibleRows: 4,
      emptyLabel: "Нет нод",
      onSelect: options.onSelectNode,
      onAdd: options.onAddNode,
      ...(selectedRemovable(options.nodes, options.selectedNodeId)
        ? {onRemove: options.onRemoveNode}
        : {}),
    })
  }

  #drawParameters(frame: NodeTreeEditorDockPlan["body"]): void {
    const options = this.#options
    flexRow({
      ...frame,
      gap: uiShapeMetrics.panelSectionGap,
      alignItems: "start",
      items: [
        {width: "3fr", height: frame.h, draw: (x, y, w, h) => CollectionInput(this, x, y, w, h, {
          key: `node-tree-editor:parameters:${options.selectedNodeId ?? "none"}`,
          items: options.parameters,
          selectedId: options.selectedParameterId,
          visibleRows: 4,
          emptyLabel: options.selectedNodeId === null ? "Выберите ноду" : "Нет параметров",
          onSelect: options.onSelectParameter,
          ...(options.selectedNodeId === null ? {} : {onAdd: options.onAddParameter}),
          ...(selectedRemovable(options.parameters, options.selectedParameterId)
            ? {onRemove: options.onRemoveParameter}
            : {}),
        })},
        {width: "2fr", height: frame.h, draw: (x, y, w) => {
          const field = options.parameterField
          if (field === null) {
            Typography(this, x, y, w, uiShapeMetrics.rowHeight, {
              children: "Выберите изменяемый Parameter",
              variant: "caption",
              color: "muted",
            })
            return
          }
          Field(this, x, y, w, field, {density: "compact"})
        }},
      ],
    })
  }

  #drawLinks(frame: NodeTreeEditorDockPlan["body"]): void {
    const options = this.#options
    flexRow({
      ...frame,
      gap: uiShapeMetrics.panelSectionGap,
      alignItems: "start",
      items: [
        {width: "3fr", height: frame.h, draw: (x, y, w, h) => CollectionInput(this, x, y, w, h, {
          key: "node-tree-editor:links",
          items: options.links,
          selectedId: options.selectedLinkId,
          visibleRows: 4,
          emptyLabel: "Нет связей",
          onSelect: options.onSelectLink,
          ...(selectedRemovable(options.links, options.selectedLinkId)
            ? {onRemove: options.onDisconnect}
            : {}),
        })},
        {width: "2fr", height: frame.h, draw: (x, y, w, h) => flexColumn({
          x,
          y,
          w,
          h,
          gap: uiShapeMetrics.tightGap,
          items: [
            {height: uiShapeMetrics.rowHeight, draw: (rowX, rowY, rowW, rowH) => EnumInput(this, rowX, rowY, rowW, rowH, {
              value: options.fromEndpointId,
              options: options.fromEndpoints,
              onChange: options.onFromEndpointChange,
              disabled: options.fromEndpoints.length === 0,
            })},
            {height: uiShapeMetrics.rowHeight, draw: (rowX, rowY, rowW, rowH) => EnumInput(this, rowX, rowY, rowW, rowH, {
              value: options.toEndpointId,
              options: options.toEndpoints,
              onChange: options.onToEndpointChange,
              disabled: options.toEndpoints.length === 0,
            })},
            {height: uiShapeMetrics.rowHeight, draw: (rowX, rowY, rowW, rowH) => Button(this, rowX, rowY, rowW, rowH, {
              children: "Соединить",
              variant: "contained",
              color: "primary",
              disabled: !options.canConnect,
              onClick: options.onConnect,
            })},
          ],
        })},
      ],
    })
  }
}

function selectedRemovable(items: readonly NodeTreeEditorDockItem[], selectedId: string | null): boolean {
  if (selectedId === null) return false
  return items.find(({id}) => id === selectedId)?.removable !== false
}
