export type SourceLineChange = {oldStart: number; oldLines: number; newStart: number; newLines: number}

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
