import {Field, type FieldDefinition} from "@ui/components/field"
import {Typography} from "@ui/components/typography"
import type {UiSurface} from "@ui/elements/surface"
import type {NodeRect, SocketSide} from "./node-editor.ts"

/** Public visual Parameter identity and its single universal Field. */
export type Parameter = Readonly<{
  id: string
  label: string
  field: FieldDefinition
  description?: string
}>

/** Exact local geometry prepared by the owning Node planner for one Parameter. */
export type ParameterPlan<TParameter extends Parameter = Parameter> = Readonly<{
  parameter: TParameter
  rect: NodeRect
  labelRect: NodeRect
  editorRect: NodeRect
  editorVisible: boolean
  separateLabel: boolean
  side?: SocketSide
}>

export type ParameterRendererContext<
  TParameter extends Parameter = Parameter,
  TPlan extends ParameterPlan<TParameter> = ParameterPlan<TParameter>,
> = Readonly<{
  host: UiSurface
  nodeId: string
  entry: TPlan
  /** Selection of the owning Node; Parameter selection is a separate capability. */
  selected: boolean
}>

export type ParameterRenderer<
  TParameter extends Parameter = Parameter,
  TPlan extends ParameterPlan<TParameter> = ParameterPlan<TParameter>,
> = Readonly<{
  render(context: ParameterRendererContext<TParameter, TPlan>): void
}>

/** Blender presentation of one public Parameter using the shared Field component. */
export const blenderParameterRenderer: ParameterRenderer = Object.freeze({
  render({host, nodeId, entry}) {
    const {parameter, rect, labelRect, editorRect, editorVisible, separateLabel, side} = entry
    if (editorVisible) {
      const slot = separateLabel ? editorRect : rect
      Field(host, slot.x, slot.y, slot.w, {
        ...parameter.field,
        key: `${nodeId}:${parameter.id}`,
        ...(separateLabel ? {compactLabel: "hidden" as const} : {}),
      }, {density: "compact"})
    }
    if (editorVisible && !separateLabel) return
    Typography(host, labelRect.x, labelRect.y, labelRect.w, labelRect.h, {
      children: parameterLabel(parameter.label, side),
      fontPx: 11,
      sx: {textAlign: side ?? "center"},
    })
  },
})

function parameterLabel(label: string, side: SocketSide | undefined): string {
  if (side === undefined) return label
  const value = label.trimEnd()
  if (side === "right") return value.endsWith(":") ? value.slice(0, -1).trimEnd() : value
  return value.endsWith(":") ? value : `${value}:`
}
