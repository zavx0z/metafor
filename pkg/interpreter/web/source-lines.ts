export type SourceLineChange = {oldStart: number; oldLines: number; newStart: number; newLines: number}
export type SourceEditorLineChange = {line: number; kind: "added" | "modified" | "deleted"}

export function sourceTextLineChanges(before: string, after: string): SourceLineChange[] {
  if (before === after) return []
  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldChanged = oldLines.length - prefix - suffix
  const newChanged = newLines.length - prefix - suffix
  if (oldChanged === newChanged) return []
  return [{
    oldStart: prefix + 1,
    oldLines: oldChanged,
    newStart: prefix + 1,
    newLines: newChanged,
  }]
}

export function sourceTextEditorLineChanges(before: string, after: string): SourceEditorLineChange[] {
  if (before === after) return []
  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  const spans = sourceLineDiffSpans(oldLines, newLines)

  const changes: SourceEditorLineChange[] = []
  for (const span of spans) {
    const replaced = Math.min(span.oldLines, span.newLines)
    for (let offset = 0; offset < replaced; offset += 1) {
      changes.push({line: span.newStart + offset, kind: "modified"})
    }
    for (let offset = replaced; offset < span.newLines; offset += 1) {
      changes.push({line: span.newStart + offset, kind: "added"})
    }
    if (span.oldLines > span.newLines) {
      changes.push({line: span.newStart + span.newLines, kind: "deleted"})
    }
  }
  return changes
}

function sourceLineDiffSpans(oldLines: readonly string[], newLines: readonly string[]): SourceLineChange[] {
  const cellCount = (oldLines.length + 1) * (newLines.length + 1)
  if (cellCount > 1_000_000) {
    const span = sourceChangedLineSpan(oldLines, newLines)
    return span === null ? [] : [span]
  }

  const width = newLines.length + 1
  const table = new Uint32Array(cellCount)
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const index = oldIndex * width + newIndex
      if (oldLines[oldIndex] === newLines[newIndex]) {
        table[index] = table[(oldIndex + 1) * width + newIndex + 1]! + 1
      } else {
        table[index] = Math.max(table[(oldIndex + 1) * width + newIndex]!, table[oldIndex * width + newIndex + 1]!)
      }
    }
  }

  const spans: SourceLineChange[] = []
  let oldIndex = 0
  let newIndex = 0
  let current: SourceLineChange | null = null

  const beginChange = (): SourceLineChange => {
    if (current !== null) return current
    current = {oldStart: oldIndex + 1, oldLines: 0, newStart: newIndex + 1, newLines: 0}
    return current
  }
  const flushChange = (): void => {
    if (current === null) return
    if (current.oldLines > 0 || current.newLines > 0) spans.push(current)
    current = null
  }

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      flushChange()
      oldIndex += 1
      newIndex += 1
      continue
    }

    const deleteScore = oldIndex < oldLines.length ? table[(oldIndex + 1) * width + newIndex]! : -1
    const insertScore = newIndex < newLines.length ? table[oldIndex * width + newIndex + 1]! : -1
    const change = beginChange()
    if (insertScore > deleteScore) {
      change.newLines += 1
      newIndex += 1
    } else {
      change.oldLines += 1
      oldIndex += 1
    }
  }

  flushChange()
  return spans
}

function sourceChangedLineSpan(oldLines: readonly string[], newLines: readonly string[]): SourceLineChange | null {
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldChanged = oldLines.length - prefix - suffix
  const newChanged = newLines.length - prefix - suffix
  if (oldChanged === 0 && newChanged === 0) return null
  return {
    oldStart: prefix + 1,
    oldLines: oldChanged,
    newStart: prefix + 1,
    newLines: newChanged,
  }
}

export function remapSourceLine(line: number, changes: readonly SourceLineChange[]): number {
  let current = Math.max(1, Math.floor(line))
  for (const change of changes) {
    const oldStart = Math.max(1, Math.floor(change.oldStart))
    const oldLines = Math.max(0, Math.floor(change.oldLines))
    const newStart = Math.max(1, Math.floor(change.newStart))
    const newLines = Math.max(0, Math.floor(change.newLines))
    const delta = newLines - oldLines

    if (oldLines === 0) {
      if (current >= oldStart) current += newLines
      continue
    }

    const oldEnd = oldStart + oldLines - 1
    if (current < oldStart) continue
    if (current > oldEnd) {
      current += delta
      continue
    }

    if (newLines <= 0) {
      current = oldStart
    } else {
      current = newStart + Math.min(current - oldStart, newLines - 1)
    }
  }
  return Math.max(1, current)
}
