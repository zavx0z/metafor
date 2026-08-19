import {Color} from "@metafor/engine"
import {Pane, Typography} from "@ui/components"
import {UiSurface, Z, flexColumn, flexRow, palette} from "@ui/elements"
import {
  BLENDER_SOCKET_SHAPES,
  blenderSocketPreset,
  blenderSocketRenderer,
  type BlenderSocket,
} from "../blender-node.ts"
import {SOCKET_CATALOG} from "./fixtures.ts"

export type SocketCatalogMode = "types" | "shapes" | "states"
export const BLENDER_REFERENCE_SRC = "/ui-dev/blender-4.5.5-reference.png"

export class BlenderReferenceSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
    this.setBackgroundImage({
      src: BLENDER_REFERENCE_SRC,
      fit: "cover",
      opacity: 1,
      scale: 0.98,
      viewBox: {x: 0, y: 0.42, w: 0.65, h: 0.38},
    })
    this.node.name = "BlenderReferenceSurface"
  }

  protected override render(): void {
    this.drawRoundedRect(0, 0, this.rectW, this.rectH, {
      radius: 10,
      fill: new Color(0, 0, 0, 0),
      border: palette.border,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.drawRoundedRect(0, 0, this.rectW, 30, {
      radius: 10,
      fill: new Color(0.035, 0.04, 0.05, 0.88),
      border: null,
      z: Z.ELEMENT,
    })
    flexRow({
      x: 0,
      y: 0,
      w: this.rectW,
      h: 30,
      paddingX: 12,
      alignItems: "center",
      items: [{
        width: "grow",
        height: 24,
        draw: (x, y, w, h) => Typography(this, x, y, w, h, {
          children: "BLENDER 4.5.5 · РЕФЕРЕНС",
          variant: "caption",
          color: "muted",
        }),
      }],
    })
  }
}

export class SocketCatalogSurface extends UiSurface {
  #mode: SocketCatalogMode

  constructor(mode: SocketCatalogMode = "types") {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderRadiusPx: 12})
    this.#mode = mode
    this.node.name = "SocketCatalogSurface"
  }

  setMode(mode: SocketCatalogMode): void {
    if (mode === this.#mode) return
    this.#mode = mode
    this.requestRender()
  }

  protected override render(): void {
    this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER)
    Pane(this, 0, 0, this.rectW, this.rectH, {variant: "outlined", sx: {borderRadius: 12}})
    const title = this.#mode === "types" ? "Типы сокетов" : this.#mode === "shapes" ? "Формы сокетов" : "Состояния сокетов"
    const description = this.#mode === "types"
      ? `${SOCKET_CATALOG.length} типов без Fields и Parameters`
      : this.#mode === "shapes"
        ? `${BLENDER_SOCKET_SHAPES.length} source-compatible форм`
        : "input / output / bidirectional · selected / ordinary"
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 24,
      paddingTop: 20,
      paddingBottom: 20,
      gap: 10,
      items: [
        {height: 28, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: title, variant: "title"})},
        {height: 20, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: description, variant: "caption", color: "muted"})},
        {height: "grow", draw: (x, y, w, h) => {
          if (this.#mode === "types") this.#drawTypes(x, y, w, h)
          else if (this.#mode === "shapes") this.#drawShapes(x, y, w, h)
          else this.#drawStates(x, y, w, h)
        }},
      ],
    })
  }

  #drawTypes(x: number, y: number, w: number, h: number): void {
    const columns = this.rectW < 620 ? 2 : this.rectW < 980 ? 3 : 5
    const rows = chunk(SOCKET_CATALOG, columns)
    flexColumn({
      x,
      y,
      w,
      h,
      gap: 8,
      items: rows.map((row) => ({
        height: "1fr" as const,
        draw: (rowX: number, rowY: number, rowW: number, rowH: number) => this.#drawSocketRow(row, columns, rowX, rowY, rowW, rowH),
      })),
    })
  }

  #drawShapes(x: number, y: number, w: number, h: number): void {
    const columns = this.rectW < 620 ? 2 : 4
    const rows = chunk(BLENDER_SOCKET_SHAPES, columns)
    flexColumn({
      x,
      y,
      w,
      h,
      gap: 12,
      items: rows.map((row) => ({
        height: "1fr" as const,
        draw: (rowX: number, rowY: number, rowW: number, rowH: number) => flexRow({
          x: rowX,
          y: rowY,
          w: rowW,
          h: rowH,
          gap: 12,
          items: Array.from({length: columns}, (_, column) => {
            const shape = row[column]
            if (shape === undefined) return {width: "1fr" as const, height: rowH, draw: () => {}}
            const socket: BlenderSocket = {id: `shape-${shape}`, label: shape, direction: "bidirectional", socketType: "custom", shape}
            return {width: "1fr" as const, height: rowH, draw: (cellX: number, cellY: number, cellW: number, cellH: number) => this.#drawSocketCell(socket, shape, false, cellX, cellY, cellW, cellH)}
          }),
        }),
      })),
    })
  }

  #drawStates(x: number, y: number, w: number, h: number): void {
    const states: readonly Readonly<{socket: BlenderSocket; label: string; selected: boolean}>[] = [
      {socket: {id: "state-input", label: "Input", direction: "input", socketType: "float"}, label: "Input · ordinary", selected: false},
      {socket: {id: "state-output", label: "Output", direction: "output", socketType: "color"}, label: "Output · selected", selected: true},
      {socket: {id: "state-bidirectional", label: "Bidirectional", direction: "bidirectional", socketType: "vector", shape: "diamond-dot"}, label: "Bidirectional", selected: false},
    ]
    flexColumn({
      x,
      y,
      w,
      h,
      gap: 14,
      justifyContent: "center",
      items: states.map(({socket, label, selected}) => ({height: 74, draw: (cellX: number, cellY: number, cellW: number, cellH: number) => this.#drawSocketCell(socket, label, selected, cellX, cellY, cellW, cellH)})),
    })
  }

  #drawSocketRow(row: readonly BlenderSocket[], columns: number, x: number, y: number, w: number, h: number): void {
    flexRow({
      x,
      y,
      w,
      h,
      gap: 12,
      items: Array.from({length: columns}, (_, column) => {
        const socket = row[column]
        return socket === undefined
          ? {width: "1fr" as const, height: h, draw: () => {}}
          : {width: "1fr" as const, height: h, draw: (cellX: number, cellY: number, cellW: number, cellH: number) => this.#drawSocketCell(socket, blenderSocketPreset(socket.socketType).label, false, cellX, cellY, cellW, cellH)}
      }),
    })
  }

  #drawSocketCell(socket: BlenderSocket, label: string, selected: boolean, x: number, y: number, w: number, h: number): void {
    this.drawRoundedRect(x, y, w, h, {radius: 10, fill: new Color(0.055, 0.08, 0.12, 0.9), border: palette.borderDim, borderWidth: 1, z: Z.ELEMENT})
    flexRow({
      x,
      y,
      w,
      h,
      paddingX: 14,
      gap: 10,
      alignItems: "center",
      items: [
        {width: 22, height: 22, draw: (slotX, slotY, slotW, slotH) => blenderSocketRenderer.render({host: this, entry: {socket, side: socket.direction === "output" ? "right" : "left", center: {x: slotX + slotW / 2, y: slotY + slotH / 2}}, selected, nodeId: "socket-catalog"})},
        {width: "grow", height: 20, draw: (slotX, slotY, slotW, slotH) => Typography(this, slotX, slotY, slotW, slotH, {children: label, variant: "caption", color: selected ? "cyan" : "text"})},
      ],
    })
  }
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = []
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size))
  return rows
}
