import type { Primitive, Patch } from "./array.t"

/** Экранирование части пути для JSON-Pointer (RFC6901) */
function escapePathPart(part: string | number): string {
  return String(part).replace(/~/g, "~0").replace(/\//g, "~1")
}

/** Собрать pointer из basePointer и индекса */
function indexPointer(basePointer: string, index: number): string {
  const base = basePointer === "" ? "" : basePointer.replace(/\/$/, "")
  return (base === "" ? "" : base) + "/" + escapePathPart(index)
}

/** Парсит последний сегмент указателя и возвращает числовой индекс. */
function parseIndexFromPointer(ptr: string): number {
  const parts = ptr.split("/")
  const last = parts[parts.length - 1]
  return Number(last)
}

/**
 * diff между двумя массивами примитивов (unique values).
 * Возвращает массив патчей RFC6902 (subset: add/remove/move).
 */
export function diffArrays(oldArr: Primitive[], newArr: Primitive[], basePointer: string = ""): Patch[] {
  const ops: Patch[] = []

  // быстрый путь: полностью идентичны
  if (oldArr.length === newArr.length && oldArr.every((v, i) => v === newArr[i])) {
    return ops
  }

  const virtual: Primitive[] = oldArr.slice()
  const idxMap = new Map<Primitive, number>()
  for (let i = 0; i < virtual.length; i++) {
    const val = virtual[i]
    if (val !== undefined) idxMap.set(val, i)
  }

  function updateIndexRange(fromIdx: number) {
    for (let i = fromIdx; i < virtual.length; i++) {
      const val = virtual[i]
      if (val !== undefined) idxMap.set(val, i)
    }
  }

  for (let j = 0; j < newArr.length; j++) {
    const val = newArr[j]
    if (val === undefined) continue

    const curIdx = idxMap.has(val) ? idxMap.get(val)! : undefined

    if (curIdx === undefined) {
      ops.push({ op: "add", path: indexPointer(basePointer, j), value: val })
      virtual.splice(j, 0, val)
      idxMap.set(val, j)
      updateIndexRange(j + 1)
    } else {
      if (curIdx !== j) {
        ops.push({
          op: "move",
          from: indexPointer(basePointer, curIdx),
          path: indexPointer(basePointer, j),
        })
        const [moved] = virtual.splice(curIdx, 1)
        if (moved !== undefined) virtual.splice(j, 0, moved)
        updateIndexRange(Math.min(curIdx, j))
      }
    }
  }

  for (let k = virtual.length - 1; k >= newArr.length; k--) {
    ops.push({ op: "remove", path: indexPointer(basePointer, k) })
    const val = virtual[k]
    if (val !== undefined) idxMap.delete(val)
    virtual.splice(k, 1)
  }

  return ops
}

/**
 * Применяет патчи (add/remove/move) к копии массива и возвращает результат.
 * Патчи применяются последовательно в том порядке, в котором они переданы.
 */
export function applyPatchesToArray(src: Primitive[], patches: Patch[]): Primitive[] {
  const arr = src.slice()

  for (const p of patches) {
    if (p.op === "add") {
      const idx = parseIndexFromPointer(p.path)
      arr.splice(idx, 0, p.value)
    } else if (p.op === "remove") {
      const idx = parseIndexFromPointer(p.path)
      arr.splice(idx, 1)
    } else if (p.op === "move") {
      const fromIdx = parseIndexFromPointer(p.from)
      const toIdx = parseIndexFromPointer(p.path)
      const [val] = arr.splice(fromIdx, 1)
      if (val !== undefined) arr.splice(toIdx, 0, val)
    }
  }

  return arr
}
