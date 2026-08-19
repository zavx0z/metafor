import {Color} from "@metafor/engine"
import {
  Field,
  Pane,
  Typography,
  measureFieldHeight,
  type FieldColor,
  type FieldDefinition,
  type FieldReference,
} from "@ui/components"
import {UiSurface, Z, flexColumn, flexRow, palette} from "@ui/elements"
import {
  BLENDER_SOCKET_SHAPES,
  blenderSocketPreset,
  blenderSocketRenderer,
  type BlenderSocket,
} from "../blender-node.ts"
import {SOCKET_CATALOG, createStandaloneFields} from "./fixtures.ts"

export class BlenderReferenceSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
    this.setBackgroundImage({
      src: "/node-system-dev/blender-reference.png",
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

export class FieldCatalogSurface extends UiSurface {
  #fields: readonly FieldDefinition[]
  #lastChange = "Все controls используют @ui/components/Field"

  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderRadiusPx: 12})
    this.#fields = createStandaloneFields(
      (id, value) => this.#updateField(id, value),
      () => this.#toggleReference(),
    )
    this.node.name = "FieldCatalogSurface"
  }

  get fields(): readonly FieldDefinition[] {
    return this.#fields
  }

  protected override render(): void {
    this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER)
    Pane(this, 0, 0, this.rectW, this.rectH, {variant: "outlined", sx: {borderRadius: 12}})
    const columns = 2
    const rows = Math.ceil(this.#fields.length / columns)
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 18,
      paddingTop: 12,
      paddingBottom: 14,
      gap: 8,
      items: [
        {height: 26, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: "Универсальные поля", variant: "title"})},
        {height: 20, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: "Standalone — без Node/Socket imports", variant: "caption", color: "muted"})},
        {height: "grow", draw: (bodyX, bodyY, bodyW, bodyH) => flexRow({
          x: bodyX,
          y: bodyY,
          w: bodyW,
          h: bodyH,
          gap: 18,
          alignItems: "stretch",
          items: Array.from({length: columns}, (_, column) => ({
            width: "1fr" as const,
            height: bodyH,
            draw: (columnX: number, columnY: number, columnW: number, columnH: number) => {
              const fields = this.#fields.slice(column * rows, (column + 1) * rows)
              flexColumn({
                x: columnX,
                y: columnY,
                w: columnW,
                h: columnH,
                gap: 12,
                items: fields.map((field) => ({
                  height: measureFieldHeight(field),
                  draw: (slotX: number, slotY: number, slotW: number) => Field(this, slotX, slotY, slotW, {...field, key: `standalone:${field.id}`}),
                })),
              })
            },
          })),
        })},
        {height: 18, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: this.#lastChange, variant: "caption", color: "muted"})},
      ],
    })
  }

  #updateField(id: string, value: unknown): void {
    this.#fields = this.#fields.map((field) => field.id === id ? withFieldValue(field, value) : field)
    this.#lastChange = `${id}: ${displayValue(value)}`
    this.requestRender()
  }

  #toggleReference(): void {
    const current = this.#fields.find(({id}) => id === "reference")
    const selected = current?.kind === "reference" ? current.value : null
    this.#updateField("reference", selected === null ? {
      id: "material-1",
      label: "Material.001",
      kind: "material",
    } satisfies FieldReference : null)
  }
}

export class SocketCatalogSurface extends UiSurface {
  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderRadiusPx: 12})
    this.node.name = "SocketCatalogSurface"
  }

  protected override render(): void {
    this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER)
    Pane(this, 0, 0, this.rectW, this.rectH, {variant: "outlined", sx: {borderRadius: 12}})
    const columns = 5
    const rows = chunk(SOCKET_CATALOG, columns)
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingX: 18,
      paddingTop: 10,
      paddingBottom: 12,
      gap: 6,
      items: [
        {height: 24, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: "Типы и формы сокетов", variant: "title"})},
        {height: 18, draw: (x, y, w, h) => Typography(this, x, y, w, h, {children: `${SOCKET_CATALOG.length} типов · ${BLENDER_SOCKET_SHAPES.length} форм`, variant: "caption", color: "muted"})},
        {height: "grow", draw: (gridX, gridY, gridW, gridH) => flexColumn({
          x: gridX,
          y: gridY,
          w: gridW,
          h: gridH,
          gap: 4,
          items: rows.map((sockets) => ({
            height: "1fr" as const,
            draw: (rowX: number, rowY: number, rowW: number, rowH: number) => flexRow({
              x: rowX,
              y: rowY,
              w: rowW,
              h: rowH,
              gap: 12,
              alignItems: "center",
              items: Array.from({length: columns}, (_, column) => {
                const socket = sockets[column]
                return socket === undefined ? {width: "1fr" as const, height: rowH, draw: () => {}} : {
                  width: "1fr" as const,
                  height: rowH,
                  draw: (cellX: number, cellY: number, cellW: number, cellH: number) => flexRow({
                    x: cellX,
                    y: cellY,
                    w: cellW,
                    h: cellH,
                    gap: 8,
                    alignItems: "center",
                    items: [
                      {width: 16, height: 16, draw: (slotX, slotY, slotW, slotH) => blenderSocketRenderer.render({host: this, entry: {socket, side: socket.direction === "output" ? "right" : "left", center: {x: slotX + slotW / 2, y: slotY + slotH / 2}}, selected: false, nodeId: "socket-catalog"})},
                      {width: "grow", height: 18, draw: (slotX, slotY, slotW, slotH) => Typography(this, slotX, slotY, slotW, slotH, {children: blenderSocketPreset(socket.socketType).label, variant: "caption"})},
                    ],
                  }),
                }
              }),
            }),
          })),
        })},
        {height: 30, draw: (rowX, rowY, rowW, rowH) => flexRow({
          x: rowX,
          y: rowY,
          w: rowW,
          h: rowH,
          gap: 8,
          alignItems: "center",
          items: BLENDER_SOCKET_SHAPES.map((shape) => ({
            width: "1fr" as const,
            height: rowH,
            draw: (cellX: number, cellY: number, cellW: number, cellH: number) => {
              const socket: BlenderSocket = {id: `shape-${shape}`, label: shape, direction: "bidirectional", socketType: "custom", shape}
              flexRow({
                x: cellX,
                y: cellY,
                w: cellW,
                h: cellH,
                gap: 6,
                alignItems: "center",
                items: [
                  {width: 18, height: 18, draw: (slotX, slotY, slotW, slotH) => blenderSocketRenderer.render({host: this, entry: {socket, side: "right", center: {x: slotX + slotW / 2, y: slotY + slotH / 2}}, selected: false, nodeId: "shape-catalog"})},
                  {width: "grow", height: 18, draw: (slotX, slotY, slotW, slotH) => Typography(this, slotX, slotY, slotW, slotH, {children: shape, variant: "caption", color: "muted"})},
                ],
              })
            },
          })),
        })},
      ],
    })
  }
}

function chunk<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = []
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size))
  return rows
}

function withFieldValue(field: FieldDefinition, value: unknown): FieldDefinition {
  if (field.kind === "text" && typeof value === "string") return {...field, value}
  if (field.kind === "number" && typeof value === "number") return {...field, value}
  if (field.kind === "boolean" && typeof value === "boolean") return {...field, value}
  if (field.kind === "enum" && typeof value === "string") return {...field, value}
  if (field.kind === "color" && isFieldColor(value)) return {...field, value}
  if ((field.kind === "vector" || field.kind === "rotation") && isNumberArray(value)) return {...field, value}
  if (field.kind === "matrix" && isMatrix(value)) return {...field, value}
  if (field.kind === "reference" && (value === null || isFieldReference(value))) return {...field, value}
  return field
}

function isFieldColor(value: unknown): value is FieldColor {
  return typeof value === "object" && value !== null &&
    ["r", "g", "b", "a"].every((key) => Number.isFinite((value as Record<string, unknown>)[key]))
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(Number.isFinite)
}

function isMatrix(value: unknown): value is readonly (readonly number[])[] {
  return Array.isArray(value) && value.every(isNumberArray)
}

function isFieldReference(value: unknown): value is FieldReference {
  return typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).label === "string"
}

function displayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null) return "null"
  if (Array.isArray(value)) return JSON.stringify(value)
  if (isFieldReference(value)) return value.label
  if (isFieldColor(value)) return `rgba(${value.r.toFixed(2)}, ${value.g.toFixed(2)}, ${value.b.toFixed(2)}, ${value.a.toFixed(2)})`
  return "обновлено"
}
