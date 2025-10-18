import type { HistoryEntry } from "../field.t"
import type { ActorSnapshot } from "../gravity.t"
import type { JsonPatch } from "../electromagnetic.t"
import type { Primitive } from "./array.t"

const snapshots = new WeakMap<any, ActorSnapshot>()
const histories = new WeakMap<any, HistoryEntry[]>()

export function setActorSnapshot(instance: any, snapshot: ActorSnapshot) {
  snapshots.set(instance, JSON.parse(JSON.stringify(snapshot)))
  histories.set(instance, [])
}

export function getActorSnapshot(instance: any): ActorSnapshot | undefined {
  return snapshots.get(instance)
}

export function getHistory(instance: any): HistoryEntry[] | undefined {
  return histories.get(instance)
}

// ---------------------- Вспомогательные функции ----------------------

/** Получает значение по JSON-Pointer */
function getByPointer(snapshot: any, path: string): any {
  if (path === "" || path === "/") return snapshot
  const parts = path.slice(1).split("/")
  let cur = snapshot
  for (const p of parts) cur = Array.isArray(cur) ? cur[Number(p)] : cur[p]
  return cur
}

/** Создаёт инверсный патч для rollback */
function invertPatch(patch: JsonPatch, snapshot: ActorSnapshot): JsonPatch {
  switch (patch.op) {
    case "add":
      return { op: "remove", path: patch.path }
    case "remove":
      const oldVal = getByPointer(snapshot, patch.path)
      return { op: "add", path: patch.path, value: oldVal as Primitive }
    case "replace":
      const oldVal2 = getByPointer(snapshot, patch.path)
      return { op: "replace", path: patch.path, value: oldVal2 as Primitive }
    case "test":
      // test операция изменяет значение как replace, поэтому инверсная операция тоже test с предыдущим значением
      const oldVal3 = getByPointer(snapshot, patch.path)
      return { op: "test", path: patch.path, value: oldVal3 as any }
    case "move":
      return { op: "move", from: patch.path, path: patch.from! }
  }
}

/** Применяет один патч к snapshot */
function applyPatch(snapshot: ActorSnapshot, patch: JsonPatch) {
  // Обработка корневого пути
  if (patch.path === "/") {
    if (patch.op === "move") {
      throw new Error("move operation not supported for root path")
    }

    if (patch.op === "remove") {
      // Для remove на корневом пути - очищаем все свойства
      const keys = Object.keys(snapshot)
      for (const key of keys) {
        delete (snapshot as any)[key]
      }
    } else if (patch.value !== undefined) {
      // Для остальных операций - заменяем весь объект
      const keys = Object.keys(snapshot)
      for (const key of keys) {
        delete (snapshot as any)[key]
      }
      Object.assign(snapshot, patch.value)
    }

    return
  }

  const pathParts = patch.path.slice(1).split("/")
  let target: any = snapshot
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i]
    if (!key) throw new Error("Invalid path")
    target = Array.isArray(target) ? target[Number(key)] : target[key]
  }
  const lastKey = pathParts[pathParts.length - 1]

  if (!lastKey) throw new Error("Invalid path")

  // Если целевой объект массив
  if (Array.isArray(target)) {
    const idx = Number(lastKey)
    switch (patch.op) {
      case "add":
        target.splice(idx, 0, patch.value!)
        break
      case "remove":
        target.splice(idx, 1)
        break
      case "replace":
        target[idx] = patch.value!
        break
      case "test":
        // test операция изменяет значение как replace
        target[idx] = patch.value!
        break
      case "move":
        if (!patch.from) throw new Error("move missing from")
        const fromParts = patch.from.slice(1).split("/")
        let fromTarget: any = snapshot
        for (let i = 0; i < fromParts.length - 1; i++) {
          const k = fromParts[i]
          if (!k) throw new Error("Invalid from path")
          fromTarget = Array.isArray(fromTarget) ? fromTarget[Number(k)] : fromTarget[k]
        }
        const fromIdx = Number(fromParts[fromParts.length - 1])
        const [val] = fromTarget.splice(fromIdx, 1)
        target.splice(idx, 0, val)
        break
    }
    return
  }

  // Обычные объекты
  switch (patch.op) {
    case "add":
    case "replace":
      target[lastKey] = patch.value
      break
    case "remove":
      delete target[lastKey]
      break
    case "test":
      // test операция изменяет значение как replace
      target[lastKey] = patch.value
      break
    case "move":
      if (!patch.from) throw new Error("move missing from")
      const fromParts = patch.from.slice(1).split("/")
      let fromTarget: any = snapshot
      for (let i = 0; i < fromParts.length - 1; i++) {
        const k = fromParts[i]
        if (!k) throw new Error("Invalid from path")
        fromTarget = Array.isArray(fromTarget) ? fromTarget[Number(k)] : fromTarget[k]
      }
      const fromLast = Number(fromParts[fromParts.length - 1])
      const lastFromPart = fromParts[fromParts.length - 1]
      if (!lastFromPart) throw new Error("Invalid from path")
      const val = Array.isArray(fromTarget) ? fromTarget.splice(fromLast, 1)[0] : fromTarget[lastFromPart]
      target[lastKey] = val
      break
  }
}

// ---------------------- Public API ----------------------

/** Применяет патчи и сохраняет инверсные патчи в истории */
export function applyPatchesAndSave(instance: any, patches: JsonPatch[]): JsonPatch[] {
  const snap = snapshots.get(instance)
  if (!snap) throw new Error("No snapshot set")

  const inverse: JsonPatch[] = []

  // Применяем патчи по одному и создаем инверсные патчи для каждого
  for (const patch of patches) {
    // Создаем инверсный патч до применения прямого патча
    const inversePatch = invertPatch(patch, snap)
    inverse.unshift(inversePatch)

    // Применяем прямой патч
    applyPatch(snap, patch)
  }

  const hist = histories.get(instance)!
  hist.push({ forward: patches, inverse })
  return inverse
}

/** Откат последней группы патчей */
export function rollbackLast(instance: any): boolean {
  const hist = histories.get(instance)
  if (!hist || hist.length === 0) return false
  const last = hist.pop()!
  const snap = snapshots.get(instance)!
  for (const p of last.inverse) applyPatch(snap, p)
  return true
}

/** Применяет патчи к снапшоту (чистая функция) */
export function applyPatchesToSnapshot(snapshot: ActorSnapshot, patches: JsonPatch[]): ActorSnapshot {
  // Создаем копию снапшота для модификации
  const result = JSON.parse(JSON.stringify(snapshot))

  for (const patch of patches) {
    applyPatch(result, patch)
  }

  return result
}
