import {flexColumn, flexRow, type UiSurface} from "@ui/elements"
import {
  NumberInput,
  normalizeNumberInputValue,
  type NumberInputDensity,
  type NumberInputProps,
} from "./NumberInput.ts"

export type MatrixInputSize = 2 | 3 | 4
export type MatrixInputDensity = "regular" | "compact"

export type MatrixInputProps = {
  key?: string
  value: readonly (readonly number[])[]
  disabled?: boolean
  readOnly?: boolean
  density?: MatrixInputDensity
  onChange?(value: readonly (readonly number[])[]): void
}

const REGULAR_ROW_HEIGHT = 28
const REGULAR_GAP = 4
const COMPACT_ROW_HEIGHT = 22
const COMPACT_GAP = 3

/** Draws one controlled square 2×2–4×4 numeric editor without owning consumer state. */
export function MatrixInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: MatrixInputProps,
): void {
  const matrix = normalizeMatrixInputValue(props.value)
  const compact = props.density === "compact"
  const gap = compact ? COMPACT_GAP : REGULAR_GAP
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap,
    items: matrix.map((values, row) => ({
      height: compact ? COMPACT_ROW_HEIGHT : "1fr" as const,
      draw: (rowX: number, rowY: number, rowW: number, rowH: number) => flexRow({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        gap,
        alignItems: "stretch",
        items: values.map((value, column) => ({
          width: "1fr" as const,
          height: rowH,
          draw: (cellX: number, cellY: number, cellW: number, cellH: number) => {
            NumberInput(host, cellX, cellY, cellW, cellH, matrixCellProps(props, matrix, row, column))
          },
        })),
      }),
    })),
  })
}

/** Returns the current regular grid height or intrinsic compact row stack height. */
export function measureMatrixInputHeight(
  props: Pick<MatrixInputProps, "value" | "density">,
): number {
  const size = matrixInputSize(props.value)
  if (props.density !== "compact") return size * REGULAR_ROW_HEIGHT
  return size * COMPACT_ROW_HEIGHT + (size - 1) * COMPACT_GAP
}

/** Normalizes a square value with a 2×2 identity fallback and finite scalar entries. */
export function normalizeMatrixInputValue(
  value: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  const size = matrixInputSize(value)
  return Array.from({length: size}, (_, row) => Array.from({length: size}, (_, column) => {
    const entry = value[row]?.[column]
    return Number.isFinite(entry) ? normalizeNumberInputValue(entry!) : row === column ? 1 : 0
  }))
}

function matrixCellProps(
  props: MatrixInputProps,
  matrix: readonly (readonly number[])[],
  row: number,
  column: number,
): NumberInputProps {
  const numberProps: NumberInputProps = {
    value: matrix[row]![column]!,
    density: (props.density ?? "regular") as NumberInputDensity,
  }
  if (props.key !== undefined) numberProps.key = `${props.key}:${row}:${column}`
  if (props.disabled !== undefined) numberProps.disabled = props.disabled
  if (props.readOnly !== undefined) numberProps.readOnly = props.readOnly
  if (props.onChange !== undefined) numberProps.onChange = (value) => {
    const next = matrix.map((entries) => [...entries])
    next[row]![column] = value
    props.onChange!(normalizeMatrixInputValue(next))
  }
  return numberProps
}

function matrixInputSize(value: readonly (readonly number[])[]): MatrixInputSize {
  return Math.min(4, Math.max(2, value.length || 2)) as MatrixInputSize
}
