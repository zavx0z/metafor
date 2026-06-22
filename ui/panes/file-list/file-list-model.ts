export type FileListItemKind = "file" | "directory"

export type FileListItem = {
  id: string
  name: string
  kind: FileListItemKind
  path?: string
  sizeLabel?: string
  modifiedLabel?: string
  statusLabel?: string
  iconLabel?: string
  muted?: boolean
  disabled?: boolean
  children?: readonly FileListItem[]
}

export type FileListSelectionMode = "single" | "multiple"

export type FileListVisibleRow = {
  item: FileListItem
  id: string
  depth: number
  index: number
  parentIds: readonly string[]
  expandable: boolean
  expanded: boolean
}

export type FileListSelectionGesture = {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

export type FileListSelectionUpdate = {
  selectedIds: readonly string[]
  anchorId: string
}

export function fileListVisibleRows(items: readonly FileListItem[], expandedIds: ReadonlySet<string>): FileListVisibleRow[] {
  const rows: FileListVisibleRow[] = []
  appendVisibleRows(rows, items, expandedIds, 0, [])
  return rows
}

export function fileListAllItemIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  appendAllItemIds(ids, items)
  return ids
}

export function normalizeFileListSelection(
  selectedIds: readonly string[],
  items: readonly FileListItem[],
  mode: FileListSelectionMode,
): string[] {
  const known = new Set(fileListAllItemIds(items))
  const next: string[] = []
  for (const id of selectedIds) {
    if (!known.has(id) || next.includes(id)) continue
    next.push(id)
    if (mode === "single") break
  }
  return next
}

export function fileListSelectionAfterClick(
  rows: readonly FileListVisibleRow[],
  currentSelectedIds: readonly string[],
  clickedId: string,
  mode: FileListSelectionMode,
  anchorId: string | null,
  gesture: FileListSelectionGesture = {},
): FileListSelectionUpdate {
  if (mode === "single") return {selectedIds: [clickedId], anchorId: clickedId}

  const selected = uniqueIds(currentSelectedIds)
  const additive = gesture.metaKey === true || gesture.ctrlKey === true
  if (gesture.shiftKey === true) {
    const rangeIds = visibleRangeIds(rows, anchorId ?? selected[selected.length - 1] ?? clickedId, clickedId)
    if (rangeIds.length === 0) return {selectedIds: [clickedId], anchorId: clickedId}
    if (additive) return {selectedIds: uniqueIds([...selected, ...rangeIds]), anchorId: anchorId ?? clickedId}
    return {selectedIds: rangeIds, anchorId: anchorId ?? clickedId}
  }

  if (additive) {
    const next = selected.includes(clickedId)
      ? selected.filter((id) => id !== clickedId)
      : [...selected, clickedId]
    return {selectedIds: next, anchorId: clickedId}
  }

  return {selectedIds: [clickedId], anchorId: clickedId}
}

export function fileListSelectionAfterKeyboardRange(
  rows: readonly FileListVisibleRow[],
  currentSelectedIds: readonly string[],
  targetId: string,
  mode: FileListSelectionMode,
  anchorId: string | null,
): FileListSelectionUpdate {
  if (mode === "single") return {selectedIds: [targetId], anchorId: targetId}
  const rangeIds = visibleRangeIds(rows, anchorId ?? currentSelectedIds[0] ?? targetId, targetId)
  return {selectedIds: rangeIds.length === 0 ? [targetId] : rangeIds, anchorId: anchorId ?? targetId}
}

function appendVisibleRows(
  rows: FileListVisibleRow[],
  items: readonly FileListItem[],
  expandedIds: ReadonlySet<string>,
  depth: number,
  parentIds: readonly string[],
): void {
  for (const item of items) {
    const expandable = item.kind === "directory" && (item.children?.length ?? 0) > 0
    const expanded = expandable && expandedIds.has(item.id)
    rows.push({
      item,
      id: item.id,
      depth,
      index: rows.length,
      parentIds,
      expandable,
      expanded,
    })
    if (expanded) appendVisibleRows(rows, item.children ?? [], expandedIds, depth + 1, [...parentIds, item.id])
  }
}

function appendAllItemIds(ids: string[], items: readonly FileListItem[]): void {
  for (const item of items) {
    ids.push(item.id)
    if (item.children !== undefined) appendAllItemIds(ids, item.children)
  }
}

function visibleRangeIds(rows: readonly FileListVisibleRow[], anchorId: string, targetId: string): string[] {
  const anchorIndex = rows.findIndex((row) => row.id === anchorId)
  const targetIndex = rows.findIndex((row) => row.id === targetId)
  if (anchorIndex < 0 || targetIndex < 0) return []
  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return rows.slice(start, end + 1).filter((row) => row.item.disabled !== true).map((row) => row.id)
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}
