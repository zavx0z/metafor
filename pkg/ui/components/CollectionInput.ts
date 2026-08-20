import {flexColumn, flexRow, palette, uiIcons, type UiSurface} from "@ui/elements"
import {Button, IconButton, type ButtonProps, type IconButtonProps} from "./Button.ts"
import {List, type ListItemProps, type ListProps} from "./List.ts"

export type CollectionInputItem = Readonly<{
  id: string
  label: string
  description?: string
  disabled?: boolean
}>

export type CollectionInputDensity = "regular" | "compact"
export type CollectionInputMoveDirection = "up" | "down"

export type CollectionInputProps = {
  key?: string
  items: readonly CollectionInputItem[]
  selectedId: string | null
  visibleRows?: number
  emptyLabel?: string
  disabled?: boolean
  readOnly?: boolean
  density?: CollectionInputDensity
  onSelect?(id: string): void
  onAdd?(): void
  onRemove?(id: string): void
  onMove?(id: string, direction: CollectionInputMoveDirection): void
}

export const COLLECTION_INPUT_MIN_VISIBLE_ROWS = 1
export const COLLECTION_INPUT_MAX_VISIBLE_ROWS = 8
export const COLLECTION_INPUT_DEFAULT_VISIBLE_ROWS = 3

/** Returns a bounded integer viewport row count owned by CollectionInput. */
export function normalizeCollectionInputVisibleRows(value = COLLECTION_INPUT_DEFAULT_VISIBLE_ROWS): number {
  if (!Number.isFinite(value)) return COLLECTION_INPUT_DEFAULT_VISIBLE_ROWS
  return Math.max(
    COLLECTION_INPUT_MIN_VISIBLE_ROWS,
    Math.min(COLLECTION_INPUT_MAX_VISIBLE_ROWS, Math.trunc(value)),
  )
}

/** Returns the exact immutable item selected by the controlled stable id. */
export function findCollectionInputSelection(
  items: readonly CollectionInputItem[],
  selectedId: string | null,
): CollectionInputItem | undefined {
  if (selectedId === null) return undefined
  return items.find((item) => item.id === selectedId)
}

/** Measures the bounded list viewport using MetaFor production row rhythm. */
export function measureCollectionInputHeight(
  props: Pick<CollectionInputProps, "density" | "visibleRows" | "onMove"> = {},
): number {
  const metrics = collectionInputMetrics(props.density)
  const rowsHeight = metrics.rowHeight * normalizeCollectionInputVisibleRows(props.visibleRows)
  const actionCount = props.onMove === undefined ? 2 : 4
  const dockHeight = metrics.actionSize * actionCount + metrics.actionGap * (actionCount - 1)
  return Math.max(rowsHeight, dockHeight)
}

/** Draws a controlled collection list with adjacent owner-supplied add/remove actions. */
export function CollectionInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: CollectionInputProps,
): void {
  const metrics = collectionInputMetrics(props.density)
  const blocked = props.disabled === true || props.readOnly === true
  const selected = findCollectionInputSelection(props.items, props.selectedId)
  const selectedIndex = selected === undefined ? -1 : props.items.indexOf(selected)
  const canAdd = !blocked && props.onAdd !== undefined
  const canRemove = !blocked && selected !== undefined && selected.disabled !== true && props.onRemove !== undefined
  const canMove = !blocked && selected !== undefined && selected.disabled !== true && props.onMove !== undefined
  const key = props.key ?? `collection-input:${x}:${y}:${width}:${height}`
  const compact = props.density === "compact"
  const listItems = collectionInputListItems(props, key, blocked, compact)

  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.dockGap,
    alignItems: "stretch",
    items: [
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        const listProps: ListProps = {
          key: `${key}:list`,
          dense: compact,
          disablePadding: true,
          itemHeight: metrics.rowHeight,
          items: listItems,
          sx: {
            background: palette.bgInput,
            borderColor: palette.borderDim,
            borderWidth: 1,
            borderRadius: metrics.radius,
          },
        }
        if (selected !== undefined) listProps.selectedKey = `${key}:item:${selected.id}`
        List(host, slotX, slotY, slotW, slotH, listProps)
      }},
      {width: metrics.actionSize, height, draw: (slotX, slotY, slotW, slotH) => {
        drawCollectionInputActions(
          host,
          slotX,
          slotY,
          slotW,
          slotH,
          metrics,
          props,
          selected,
          canAdd,
          canRemove,
          canMove && selectedIndex > 0,
          canMove && selectedIndex < props.items.length - 1,
        )
      }},
    ],
  })
}

type CollectionInputMetrics = Readonly<{
  rowHeight: number
  actionSize: number
  actionGap: number
  dockGap: number
  radius: number
  fontPx: number
}>

function collectionInputMetrics(density: CollectionInputDensity | undefined): CollectionInputMetrics {
  if (density === "compact") {
    return {rowHeight: 24, actionSize: 22, actionGap: 3, dockGap: 3, radius: 3, fontPx: 11}
  }
  return {rowHeight: 36, actionSize: 28, actionGap: 4, dockGap: 7, radius: 6, fontPx: 12}
}

function collectionInputListItems(
  props: CollectionInputProps,
  key: string,
  blocked: boolean,
  compact: boolean,
): readonly ListItemProps[] {
  if (props.items.length === 0) {
    return [{
      key: `${key}:empty`,
      primary: props.emptyLabel ?? "Нет элементов",
      disabled: true,
      dense: compact,
      button: false,
      disableGutters: false,
    }]
  }
  return props.items.map((item) => {
    const disabled = blocked || item.disabled === true
    const row: ListItemProps = {
      key: `${key}:item:${item.id}`,
      primary: item.label,
      disabled,
      dense: compact,
      button: !disabled && props.onSelect !== undefined,
      disableGutters: false,
    }
    if (!compact && item.description !== undefined) row.secondary = item.description
    if (!disabled && props.onSelect !== undefined) row.onClick = () => props.onSelect!(item.id)
    return row
  })
}

function drawCollectionInputActions(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  metrics: CollectionInputMetrics,
  props: CollectionInputProps,
  selected: CollectionInputItem | undefined,
  canAdd: boolean,
  canRemove: boolean,
  canMoveUp: boolean,
  canMoveDown: boolean,
): void {
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.actionGap,
    items: [
      {height: metrics.actionSize, draw: (slotX, slotY, slotW, slotH) => {
        IconButton(host, slotX, slotY, slotW, slotH, collectionActionProps(
          "Добавить элемент",
          uiIcons.plus,
          metrics,
          !canAdd,
          canAdd ? () => props.onAdd!() : undefined,
        ))
      }},
      {height: metrics.actionSize, draw: (slotX, slotY, slotW, slotH) => {
        IconButton(host, slotX, slotY, slotW, slotH, collectionActionProps(
          "Удалить выбранный элемент",
          uiIcons.minus,
          metrics,
          !canRemove,
          canRemove ? () => props.onRemove!(selected!.id) : undefined,
        ))
      }},
      props.onMove !== undefined && {height: metrics.actionSize, draw: (slotX, slotY, slotW, slotH) => {
        Button(host, slotX, slotY, slotW, slotH, collectionMoveActionProps(
          "↑",
          "Переместить выбранный элемент вверх",
          metrics,
          !canMoveUp,
          canMoveUp ? () => props.onMove!(selected!.id, "up") : undefined,
        ))
      }},
      props.onMove !== undefined && {height: metrics.actionSize, draw: (slotX, slotY, slotW, slotH) => {
        Button(host, slotX, slotY, slotW, slotH, collectionMoveActionProps(
          "↓",
          "Переместить выбранный элемент вниз",
          metrics,
          !canMoveDown,
          canMoveDown ? () => props.onMove!(selected!.id, "down") : undefined,
        ))
      }},
    ],
  })
}

function collectionActionProps(
  label: string,
  iconSrc: string,
  metrics: CollectionInputMetrics,
  disabled: boolean,
  action: (() => void) | undefined,
): IconButtonProps {
  const props: IconButtonProps = {
    label,
    iconSrc,
    variant: metrics.actionSize === 22 ? "contained" : "outlined",
    radius: metrics.radius,
    iconSizePx: Math.min(16, metrics.actionSize - 8),
    fontPx: metrics.fontPx,
    disabled,
  }
  if (metrics.actionSize === 22) {
    props.fill = palette.bgInput
    props.border = palette.borderDim
  }
  if (action !== undefined) props.action = action
  return props
}

function collectionMoveActionProps(
  children: "↑" | "↓",
  tooltip: string,
  metrics: CollectionInputMetrics,
  disabled: boolean,
  action: (() => void) | undefined,
): ButtonProps {
  const props: ButtonProps = {
    children,
    tooltip,
    variant: metrics.actionSize === 22 ? "contained" : "outlined",
    radius: metrics.radius,
    fontPx: metrics.fontPx,
    disabled,
  }
  if (metrics.actionSize === 22) {
    props.fill = palette.bgInput
    props.border = palette.borderDim
  }
  if (action !== undefined) props.action = action
  return props
}
