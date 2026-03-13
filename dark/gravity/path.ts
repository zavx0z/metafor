export function normalizeIndexPath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+/g, "/")
}

export function parseIndexPath(path: string): number[] {
  const normalized = normalizeIndexPath(path)
  if (!normalized) return []
  return normalized.split("/").map((part) => {
    const index = Number(part)
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Некорректный индекс в пути: "${part}"`)
    }
    return index
  })
}

export function splitParentAndIndex(path: string): { parentPath: string | null; index: number } {
  const indices = parseIndexPath(path)
  if (indices.length === 0) throw new Error("Путь не может быть пустым")
  const index = indices[indices.length - 1]!
  const parentIndices = indices.slice(0, -1)
  return {
    parentPath: parentIndices.length > 0 ? parentIndices.join("/") : null,
    index,
  }
}
