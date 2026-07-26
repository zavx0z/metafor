import {Color} from "@metafor/engine"
import {Z, palette, type UiSurface} from "@ui/elements"

/** Closed, renderer-only model. A future Bulk adapter is its only intended producer. */
export type HudNodeViewDocument = {
  atoms: readonly HudNodeViewAtom[]
  transitions: readonly HudNodeViewTransition[]
  wires: readonly HudNodeViewWire[]
}

export type HudNodeViewAtom = {
  id: string
  title: string
  /** ELK-provided local panel coordinates; the HUD never computes topology. */
  x: number
  y: number
  width?: number
  parentId?: string
  fields: readonly HudNodeViewField[]
  states: readonly HudNodeViewState[]
  process?: string
}

export type HudNodeViewField = {id: string; label: string; parameter?: string; mass?: HudNodeViewMassStats}
export type HudNodeViewMassStats = {key: string; format: string; byteLength: number; digest?: string; available: boolean}
export type HudNodeViewState = {id: string; label: string; active?: boolean}
export type HudNodeViewEndpoint = {atomId: string; itemId: string}
export type HudNodeViewTransition = {
  id: string
  from: HudNodeViewEndpoint
  to: HudNodeViewEndpoint
  /** Optional because sanitized projections may intentionally omit guard details. */
  label?: string
  condition?: string
}
export type HudNodeViewWire = {id: string; from: HudNodeViewEndpoint; to: HudNodeViewEndpoint; kind?: "field-state" | "relation"}
export type HudNodeViewRect = {x: number; y: number; w: number; h: number}
export type HudNodeViewPlan = {atoms: readonly HudNodeViewAtomLayout[]; transitions: readonly HudNodeViewTransitionLayout[]; wires: readonly HudNodeViewWireLayout[]}
export type HudNodeViewAtomLayout = {atom: HudNodeViewAtom; rect: HudNodeViewRect; fields: ReadonlyMap<string, HudNodeViewRect>; states: ReadonlyMap<string, HudNodeViewRect>}
export type HudNodeViewTransitionLayout = {transition: HudNodeViewTransition; rect: HudNodeViewRect}
export type HudNodeViewWireLayout = {id: string; kind: "field-state" | "relation" | "transition-in" | "transition-out"; from: HudNodeViewPoint; to: HudNodeViewPoint; color: Color}
export type HudNodeViewPoint = {x: number; y: number}

const NODE_WIDTH = 290
const HEADER_H = 28
const ROW_H = 24
const SECTION_H = 18
const NODE_PAD = 8
const TRANSITION_W = 80
const TRANSITION_H = 26

/** Validates references and returns exact panel geometry without touching runtime state. */
export function planHudNodeView(document: HudNodeViewDocument, bounds: HudNodeViewRect): HudNodeViewPlan {
  const atomIds = new Set<string>()
  const itemOwners = new Map<string, {atom: HudNodeViewAtom; type: "field" | "state"}>()
  for (const atom of document.atoms) {
    if (atomIds.has(atom.id)) throw new Error(`Duplicate atom id: ${atom.id}`)
    atomIds.add(atom.id)
    for (const item of [...atom.fields, ...atom.states]) {
      if (itemOwners.has(item.id)) throw new Error(`Duplicate node-view item id: ${item.id}`)
      itemOwners.set(item.id, {atom, type: atom.fields.includes(item as HudNodeViewField) ? "field" : "state"})
    }
  }
  const atoms = document.atoms.map((atom) => layoutAtom(atom, bounds))
  const byAtom = new Map(atoms.map((layout) => [layout.atom.id, layout]))
  const endpoint = (ref: HudNodeViewEndpoint, direction: "in" | "out"): HudNodeViewPoint => {
    const owner = itemOwners.get(ref.itemId)
    if (owner === undefined || owner.atom.id !== ref.atomId) throw new Error(`Unknown endpoint: ${ref.atomId}/${ref.itemId}`)
    const layout = byAtom.get(ref.atomId)!
    const row = owner.type === "field" ? layout.fields.get(ref.itemId) : layout.states.get(ref.itemId)
    if (row === undefined) throw new Error(`Missing planned endpoint: ${ref.atomId}/${ref.itemId}`)
    return {x: direction === "out" ? row.x + row.w : row.x, y: row.y + row.h / 2}
  }
  const transitions = document.transitions.map((transition, index) => {
    const from = endpoint(transition.from, "out")
    const to = endpoint(transition.to, "in")
    const owner = byAtom.get(transition.from.atomId)!
    // A compact small node sits beside its source atom. Multiple transitions stack deterministically.
    const slot = index % 7
    const lane = Math.floor(index / 7)
    const rect = {x: owner.rect.x + owner.rect.w + 18 + lane * (TRANSITION_W + 12), y: owner.rect.y + HEADER_H + 8 + slot * 32, w: TRANSITION_W, h: TRANSITION_H}
    return {transition, rect, from, to}
  })
  const wires: HudNodeViewWireLayout[] = document.wires.map((wire) => ({id: wire.id, kind: wire.kind ?? "relation", from: endpoint(wire.from, "out"), to: endpoint(wire.to, "in"), color: wire.kind === "field-state" ? palette.blue : palette.violet}))
  for (const layout of transitions) {
    wires.push({id: `${layout.transition.id}:in`, kind: "transition-in", from: layout.from, to: {x: layout.rect.x, y: layout.rect.y + layout.rect.h / 2}, color: palette.orange})
    wires.push({id: `${layout.transition.id}:out`, kind: "transition-out", from: {x: layout.rect.x + layout.rect.w, y: layout.rect.y + layout.rect.h / 2}, to: layout.to, color: palette.orange})
  }
  return {atoms, transitions: transitions.map(({transition, rect}) => ({transition, rect})), wires}
}

/** Draws Blender-like atom cards. Wires are sampled cubic Beziers so UiSurface stays the single renderer. */
export function HudNodeViewPanel(host: UiSurface, document: HudNodeViewDocument, bounds: HudNodeViewRect, z = Z.ELEMENT): HudNodeViewPlan {
  const plan = planHudNodeView(document, bounds)
  for (const wire of plan.wires) drawBezier(host, wire.from, wire.to, wire.color, wire.kind.startsWith("transition") ? 2.2 : 1.3, z)
  for (const layout of plan.atoms) drawAtom(host, layout, z + 0.08)
  for (const layout of plan.transitions) drawTransition(host, layout, z + 0.16)
  return plan
}

function layoutAtom(atom: HudNodeViewAtom, bounds: HudNodeViewRect): HudNodeViewAtomLayout {
  const x = bounds.x + atom.x
  const y = bounds.y + atom.y
  const w = atom.width ?? NODE_WIDTH
  const fields = new Map<string, HudNodeViewRect>()
  const states = new Map<string, HudNodeViewRect>()
  let cursor = y + HEADER_H + SECTION_H + NODE_PAD
  for (const field of atom.fields) { fields.set(field.id, {x: x + NODE_PAD, y: cursor, w: w - NODE_PAD * 2, h: ROW_H}); cursor += ROW_H + 3 }
  cursor += SECTION_H
  for (const state of atom.states) { states.set(state.id, {x: x + NODE_PAD, y: cursor, w: w - NODE_PAD * 2, h: ROW_H}); cursor += ROW_H + 3 }
  if (atom.process !== undefined) cursor += ROW_H + 5
  return {atom, rect: {x, y, w, h: Math.max(HEADER_H + SECTION_H * 2 + NODE_PAD * 2, cursor - y + NODE_PAD)}, fields, states}
}

function drawAtom(host: UiSurface, layout: HudNodeViewAtomLayout, z: number): void {
  const {atom, rect} = layout
  host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {radius: 11, fill: palette.bgElevated, border: palette.border, borderWidth: 1, z})
  host.drawRoundedRect(rect.x, rect.y, rect.w, HEADER_H, {radius: 10, fill: palette.bgHot, border: palette.windowActiveBorder, borderWidth: 1, z: z + 0.01})
  host.drawText(atom.title, rect.x + 10, rect.y + 9, {fontPx: 12, material: host.materials.text, maxWidthPx: rect.w - 20, z: z + 0.04})
  let sectionY = rect.y + HEADER_H + 5
  host.drawText("ПОЛЯ", rect.x + 10, sectionY, {fontPx: 9, material: host.materials.muted, z: z + 0.04})
  for (const field of atom.fields) {
    const row = layout.fields.get(field.id)!
    host.drawRoundedRect(row.x, row.y, row.w, row.h, {radius: 5, fill: palette.bgInput, border: palette.borderDim, borderWidth: 1, z: z + 0.02})
    drawPort(host, row.x - 4, row.y + row.h / 2, palette.blue, z + 0.05)
    drawPort(host, row.x + row.w - 4, row.y + row.h / 2, palette.blue, z + 0.05)
    host.drawText(field.label, row.x + 9, row.y + 7, {fontPx: 10, material: host.materials.text, maxWidthPx: row.w - 18, z: z + 0.06})
  }
  sectionY = (atom.fields.length === 0 ? rect.y + HEADER_H + 5 : [...layout.fields.values()].at(-1)!.y + ROW_H + 9)
  host.drawText("СОСТОЯНИЯ", rect.x + 10, sectionY, {fontPx: 9, material: host.materials.muted, z: z + 0.04})
  for (const state of atom.states) {
    const row = layout.states.get(state.id)!
    host.drawRoundedRect(row.x, row.y, row.w, row.h, {radius: 5, fill: state.active === true ? palette.liveFill : palette.bgPanel, border: state.active === true ? palette.green : palette.borderDim, borderWidth: 1, z: z + 0.02})
    drawPort(host, row.x - 4, row.y + row.h / 2, palette.orange, z + 0.05)
    drawPort(host, row.x + row.w - 4, row.y + row.h / 2, palette.orange, z + 0.05)
    host.drawText(`${state.active === true ? "●" : "○"} ${state.label}`, row.x + 9, row.y + 7, {fontPx: 10, material: state.active === true ? host.materials.green : host.materials.muted, maxWidthPx: row.w - 18, z: z + 0.06})
  }
  if (atom.process !== undefined) host.drawText(`Процесс: ${atom.process}`, rect.x + 10, rect.y + rect.h - 18, {fontPx: 9, material: host.materials.violet, maxWidthPx: rect.w - 20, z: z + 0.06})
}

function drawTransition(host: UiSurface, layout: HudNodeViewTransitionLayout, z: number): void {
  const {rect, transition} = layout
  host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {radius: rect.h / 2, fill: palette.warnFill, border: palette.orange, borderWidth: 1, z})
  drawPort(host, rect.x - 4, rect.y + rect.h / 2, palette.orange, z + 0.04)
  drawPort(host, rect.x + rect.w - 4, rect.y + rect.h / 2, palette.orange, z + 0.04)
  host.drawText(transition.condition ?? transition.label ?? "переход", rect.x + 8, rect.y + 8, {fontPx: 9, material: host.materials.text, maxWidthPx: rect.w - 16, z: z + 0.05})
}

function drawPort(host: UiSurface, x: number, y: number, color: Color, z: number): void {
  host.drawRoundedRect(x - 4, y - 4, 8, 8, {radius: 4, fill: color, border: palette.bg, borderWidth: 1, z})
}

function drawBezier(host: UiSurface, from: HudNodeViewPoint, to: HudNodeViewPoint, color: Color, thickness: number, z: number): void {
  const handle = Math.max(24, Math.abs(to.x - from.x) * 0.45)
  let previous = from
  for (let i = 1; i <= 8; i++) {
    const t = i / 8
    const point = cubic(from, {x: from.x + handle, y: from.y}, {x: to.x - handle, y: to.y}, to, t)
    host.drawLine(previous.x, previous.y, point.x, point.y, color, thickness, z)
    previous = point
  }
}

function cubic(a: HudNodeViewPoint, b: HudNodeViewPoint, c: HudNodeViewPoint, d: HudNodeViewPoint, t: number): HudNodeViewPoint {
  const u = 1 - t
  return {x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y}
}
