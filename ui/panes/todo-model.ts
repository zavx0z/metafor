export type ToDoPaneItemKind = "heading" | "task" | "note"
export type ToDoPaneTaskMarker = string

export const TODO_MARKDOWN_TASK_MARKERS = [
  " ", "x", "/", "~", "-", ">", "<", "?", "!", "*", '"',
  "l", "b", "i", "I", "S", "p", "c", "f", "k", "w", "u", "d",
] as const

export type ToDoPaneItem = {
  id: string
  kind: ToDoPaneItemKind
  line: number
  column: number
  depth: number
  text: string
  raw: string
  section: string[]
  checked: boolean | null
  marker: ToDoPaneTaskMarker | null
  progress: number | null
  paused: boolean
}

export type ToDoPaneContextItem = Pick<ToDoPaneItem, "id" | "kind" | "line" | "column" | "depth" | "text" | "section" | "checked" | "marker" | "progress" | "paused">

export type ToDoPaneContextSnapshot = {
  path: string
  highlightedIds: string[]
  highlightedItems: ToDoPaneContextItem[]
  highlightedText: string
}

export type ToDoPaneCompletedSection = {
  id: string
  line: number
  depth: number
  text: string
  endIndex: number
  descendantIds: string[]
  taskCount: number
}

export type TodoMarkdownInsert = {
  kind?: ToDoPaneItemKind
  text: string
  checked?: boolean
  marker?: ToDoPaneTaskMarker
  depth?: number
  afterId?: string
}

export type TodoMarkdownPatch = {
  text?: string
  checked?: boolean
  marker?: ToDoPaneTaskMarker
}

export type TodoMarkdownEditResult = {
  markdown: string
  item: ToDoPaneItem
  items: ToDoPaneItem[]
}

export type TodoMarkdownDeleteResult = {
  markdown: string
  removed: ToDoPaneItem
  items: ToDoPaneItem[]
}

export function parseMarkdownTodo(markdown: string): ToDoPaneItem[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const items: ToDoPaneItem[] = []
  const headings: string[] = []
  const idCounts = new Map<string, number>()

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ""
    const line = index + 1
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(raw)
    if (heading !== null) {
      const level = heading[1]!.length
      const text = heading[2]!.trim()
      headings.splice(level - 1)
      headings[level - 1] = text
      items.push(todoItemWithStableId({
        kind: "heading",
        line,
        column: raw.indexOf(text),
        depth: level - 1,
        text,
        raw,
        section: headings.slice(0, level - 1),
        checked: null,
        marker: null,
        progress: null,
        paused: false,
      }, idCounts))
      continue
    }

    const task = /^(\s*)[-*]\s+\[([^\]]+)\]\s+(.+?)\s*$/.exec(raw)
    if (task !== null) {
      const indent = visualIndent(task[1]!)
      const marker = todoTaskMarkerOrNull(task[2]!)
      if (marker !== null) {
        const progress = todoProgressFromMarker(marker)
        const text = task[3]!.trim()
        items.push(todoItemWithStableId({
          kind: "task",
          line,
          column: raw.indexOf(text),
          depth: Math.floor(indent / 2),
          text,
          raw,
          section: activeHeadings(headings),
          checked: marker === "x" || progress === 100,
          marker,
          progress,
          paused: marker.startsWith("."),
        }, idCounts))
        continue
      }
    }

    const note = /^(\s*)[-*]\s+(.+?)\s*$/.exec(raw)
    if (note !== null) {
      const indent = visualIndent(note[1]!)
      const text = note[2]!.trim()
      items.push(todoItemWithStableId({
        kind: "note",
        line,
        column: raw.indexOf(text),
        depth: Math.floor(indent / 2),
        text,
        raw,
        section: activeHeadings(headings),
        checked: null,
        marker: null,
        progress: null,
        paused: false,
      }, idCounts))
    }
  }

  return items
}

export function todoContextSnapshot(markdown: string, path: string, highlightedIds: readonly string[]): ToDoPaneContextSnapshot {
  return todoContextSnapshotForItems(parseMarkdownTodo(markdown), path, highlightedIds)
}

export function todoContextSnapshotForItems(items: readonly ToDoPaneItem[], path: string, highlightedIds: readonly string[]): ToDoPaneContextSnapshot {
  const highlighted = new Set(highlightedIds)
  const highlightedItems = items
    .filter((item) => highlighted.has(item.id))
    .map(todoContextItem)
  return {
    path,
    highlightedIds: highlightedItems.map((item) => item.id),
    highlightedItems,
    highlightedText: highlightedItems.map(todoContextLine).join("\n"),
  }
}

export function todoCompletedSectionStates(items: readonly ToDoPaneItem[]): Map<string, ToDoPaneCompletedSection> {
  const sections = new Map<string, ToDoPaneCompletedSection>()
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item === undefined || item.kind !== "heading") continue
    const endIndex = todoHeadingSectionEndIndex(items, index)
    if (endIndex <= index + 1) continue
    const descendants = items.slice(index + 1, endIndex)
    const tasks = descendants.filter((candidate) => candidate.kind === "task")
    if (tasks.length === 0 || tasks.some((task) => task.checked !== true)) continue
    sections.set(item.id, {
      id: item.id,
      line: item.line,
      depth: item.depth,
      text: item.text,
      endIndex,
      descendantIds: descendants.map((candidate) => candidate.id),
      taskCount: tasks.length,
    })
  }
  return sections
}

export function todoVisibleItems(items: readonly ToDoPaneItem[], expandedCompletedIds: readonly string[]): ToDoPaneItem[] {
  const expanded = new Set(expandedCompletedIds)
  const completedSections = todoCompletedSectionStates(items)
  const visible: ToDoPaneItem[] = []
  const collapsedEndIndexes: number[] = []
  for (let index = 0; index < items.length; index += 1) {
    for (let collapsedIndex = collapsedEndIndexes.length - 1; collapsedIndex >= 0; collapsedIndex -= 1) {
      if (collapsedEndIndexes[collapsedIndex]! <= index) collapsedEndIndexes.splice(collapsedIndex, 1)
    }
    const hidden = collapsedEndIndexes.length > 0
    const item = items[index]
    if (item === undefined) continue
    if (!hidden) visible.push(item)
    const completedSection = completedSections.get(item.id)
    if (!hidden && completedSection !== undefined && !expanded.has(item.id)) {
      collapsedEndIndexes.push(completedSection.endIndex)
    }
  }
  return visible
}

export function insertTodoMarkdownItem(markdown: string, input: TodoMarkdownInsert): TodoMarkdownEditResult {
  const text = normalizedTodoText(input.text)
  const kind = input.kind ?? "task"
  const depth = normalizedTodoDepth(input.depth)
  const marker = input.checked === true ? "x" : input.marker ?? " "
  const nextLine = todoLineFromParts(kind, text, depth, marker)
  const state = markdownLineState(markdown)
  const items = parseMarkdownTodo(markdown)
  const afterId = input.afterId
  const after = afterId === undefined ? undefined : items.find((item) => item.id === afterId)
  const insertIndex = after === undefined ? state.lines.length : after.line
  state.lines.splice(insertIndex, 0, nextLine)
  const nextMarkdown = joinMarkdownLines(state.lines, true)
  const nextItems = parseMarkdownTodo(nextMarkdown)
  const item = nextItems.find((candidate) => candidate.line === insertIndex + 1)
  if (item === undefined) throw new Error("created TODO item was not parsed")
  return {markdown: nextMarkdown, item, items: nextItems}
}

export function updateTodoMarkdownItem(markdown: string, id: string, patch: TodoMarkdownPatch): TodoMarkdownEditResult {
  const state = markdownLineState(markdown)
  const items = parseMarkdownTodo(markdown)
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) throw new Error(`TODO item not found: ${id}`)
  if (patch.checked !== undefined && item.kind !== "task") throw new Error("checked can be changed only for task items")
  if (patch.marker !== undefined && item.kind !== "task") throw new Error("marker can be changed only for task items")
  const text = patch.text === undefined ? item.text : normalizedTodoText(patch.text)
  const marker = patch.checked !== undefined
    ? patch.checked ? "x" : " "
    : patch.marker ?? item.marker ?? " "
  state.lines[item.line - 1] = updatedTodoLine(item, state.lines[item.line - 1] ?? item.raw, text, marker)
  const nextMarkdown = joinMarkdownLines(state.lines, state.trailingNewline)
  const nextItems = parseMarkdownTodo(nextMarkdown)
  const nextItem = nextItems.find((candidate) => candidate.line === item.line)
  if (nextItem === undefined) throw new Error("updated TODO item was not parsed")
  return {markdown: nextMarkdown, item: nextItem, items: nextItems}
}

export function deleteTodoMarkdownItem(markdown: string, id: string): TodoMarkdownDeleteResult {
  const state = markdownLineState(markdown)
  const items = parseMarkdownTodo(markdown)
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) throw new Error(`TODO item not found: ${id}`)
  state.lines.splice(item.line - 1, 1)
  const nextMarkdown = joinMarkdownLines(state.lines, state.trailingNewline)
  return {markdown: nextMarkdown, removed: item, items: parseMarkdownTodo(nextMarkdown)}
}

export function todoContextItem(item: ToDoPaneItem): ToDoPaneContextItem {
  return {
    id: item.id,
    kind: item.kind,
    line: item.line,
    column: item.column,
    depth: item.depth,
    text: item.text,
    section: [...item.section],
    checked: item.checked,
    marker: item.marker,
    progress: item.progress,
    paused: item.paused,
  }
}

export function todoContextLine(item: ToDoPaneContextItem): string {
  const prefix = item.kind === "heading"
    ? "#".repeat(Math.max(1, item.depth + 1))
    : item.checked === null
      ? "-"
      : `- [${item.marker ?? (item.checked ? "x" : " ")}]`
  return `${prefix} ${item.text}`
}

function todoItemWithStableId(item: Omit<ToDoPaneItem, "id">, counts: Map<string, number>): ToDoPaneItem {
  const base = `todo:${stableStringHash(`${item.kind}\n${item.section.join("/")}\n${item.text}`)}`
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return {
    id: count === 0 ? base : `${base}:${count + 1}`,
    ...item,
  }
}

function updatedTodoLine(item: ToDoPaneItem, raw: string, text: string, marker: ToDoPaneTaskMarker): string {
  if (item.kind === "heading") {
    const level = Math.max(1, Math.min(6, item.depth + 1))
    return `${"#".repeat(level)} ${text}`
  }
  if (item.kind === "task") {
    const match = /^(\s*[-*]\s+\[)[^\]]+(\]\s+).*$/.exec(raw)
    if (match !== null) return `${match[1]}${marker}${match[2]}${text}`
    return `${" ".repeat(Math.max(0, item.depth) * 2)}- [${marker}] ${text}`
  }
  const note = /^(\s*[-*]\s+).*$/.exec(raw)
  if (note !== null) return `${note[1]}${text}`
  return `${" ".repeat(Math.max(0, item.depth) * 2)}- ${text}`
}

function todoLineFromParts(kind: ToDoPaneItemKind, text: string, depth: number, marker: ToDoPaneTaskMarker): string {
  if (kind === "heading") return `${"#".repeat(Math.max(1, Math.min(6, depth + 1)))} ${text}`
  const indent = " ".repeat(depth * 2)
  if (kind === "note") return `${indent}- ${text}`
  return `${indent}- [${marker}] ${text}`
}

export function isTodoTaskMarker(value: string): value is ToDoPaneTaskMarker {
  return (TODO_MARKDOWN_TASK_MARKERS as readonly string[]).includes(value) || todoProgressFromMarker(value) !== null
}

function todoTaskMarkerOrNull(value: string): ToDoPaneTaskMarker | null {
  const marker = value === "X" ? "x" : value
  return isTodoTaskMarker(marker) ? marker : null
}

function todoProgressFromMarker(marker: string): number | null {
  const value = marker.startsWith(".") ? marker.slice(1) : marker
  if (!/^(?:100|[1-9]?\d)$/.test(value)) return null
  return Number(value)
}

function todoHeadingSectionEndIndex(items: readonly ToDoPaneItem[], index: number): number {
  const item = items[index]
  if (item === undefined || item.kind !== "heading") return index + 1
  for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
    const next = items[nextIndex]
    if (next !== undefined && next.kind === "heading" && next.depth <= item.depth) return nextIndex
  }
  return items.length
}

function markdownLineState(markdown: string): {lines: string[]; trailingNewline: boolean} {
  const normalized = markdown.replace(/\r\n?/g, "\n")
  const trailingNewline = normalized.endsWith("\n")
  const lines = normalized.split("\n")
  if (trailingNewline) lines.pop()
  return {lines, trailingNewline}
}

function joinMarkdownLines(lines: readonly string[], trailingNewline: boolean): string {
  if (lines.length === 0) return trailingNewline ? "\n" : ""
  return `${lines.join("\n")}${trailingNewline ? "\n" : ""}`
}

function normalizedTodoText(value: string): string {
  const text = value.trim()
  if (text.length === 0) throw new Error("TODO item text must be non-empty")
  return text.replace(/\s+/g, " ")
}

function normalizedTodoDepth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(12, Math.floor(value)))
}

function activeHeadings(headings: readonly string[]): string[] {
  return headings.filter((heading) => heading !== undefined && heading.length > 0)
}

function visualIndent(value: string): number {
  let indent = 0
  for (const ch of value) indent += ch === "\t" ? 2 : 1
  return indent
}

function stableStringHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
