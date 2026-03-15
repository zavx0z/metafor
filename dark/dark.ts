import type { MetaAST } from "@metafor/ast"
import type { DarkStoreSnapshot } from "@dark/types"
import type { Address } from "@dark/types/dark"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "@metafor/dsl/types"
import { gravity$, ingestFragment } from "@dark/gravity"
import { strong$, rebuildStrongIndexes } from "@dark/strong"
import { compileLocalTopologyFragment } from "@metafor/dsl/topology"
import { loadMetaAST, resolveMetaTsPath } from "./load"
import { dark$ } from "./store"

/**
 * Находит следующее доступное число в последовательности ID.
 *
 * @param ids — коллекция существующих ID
 * @param prefix — префикс ID (например, "gp", "gl", "gr")
 * @returns следующее число в последовательности
 */
function getNextSequence(ids: Iterable<string>, prefix: string): number {
  let max = -1

  for (const id of ids) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) {
      max = value
    }
  }

  return max + 1
}

/**
 * Находит следующее доступное число для root occurrence.
 *
 * Анализирует адреса placements в формате `/w:{meta}-{n}/...`
 * и возвращает следующее свободное число.
 *
 * @returns следующее число для root occurrence
 */
function getNextRootOccurrence(): number {
  let max = -1

  for (const placement of dark$.placements.values()) {
    const match = /^\/w:[^/]+-(\d+)(?:\/|$)/.exec(placement.address)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) {
      max = value
    }
  }

  return max + 1
}

/**
 * Перестраивает производное состояние dark state.
 *
 * Сбрасывает и пересобирает индексы `gravity$` и `strong$`
 * на основе текущего состояния `dark$`.
 */
function rebuildDerivedDarkState(): void {
  gravity$.reset()
  strong$.reset()
  rebuildStrongIndexes(dark$)

  gravity$.nextPlacementSeq = getNextSequence(dark$.placements.keys(), "gp")
  gravity$.nextLinkSeq = getNextSequence(dark$.links.keys(), "gl")
  gravity$.nextReferenceSeq = getNextSequence(dark$.references.keys(), "gr")
  gravity$.rootOccurrenceSeq = getNextRootOccurrence()
}

/**
 * Сбрасывает всё состояние dark, gravity и strong.
 *
 * Используется для полной очистки графа перед загрузкой нового.
 */
export function resetDark(): void {
  dark$.reset()
  gravity$.reset()
  strong$.reset()
}

/**
 * Восстанавливает состояние dark из снимка и перестраивает индексы.
 *
 * @param snapshot — снимок состояния для восстановления
 */
export function restoreDark(snapshot: DarkStoreSnapshot): void {
  dark$.restore(snapshot)
  rebuildDerivedDarkState()
}

/**
 * Создаёт снимок текущего состояния dark.
 *
 * @returns глубокую копию состояния
 */
export function snapshotDark(): DarkStoreSnapshot {
  return dark$.snapshot()
}

/**
 * Сохраняет meta-схему по адресу в dark store.
 *
 * @param address — канонический адрес хаба
 * @param meta — meta-схема AST
 * @returns сохранённая meta-схема
 */
export function setMeta(address: Address, meta: MetaAST): MetaAST {
  return dark$.setMeta(address, meta)
}

/**
 * Получает meta-схему по адресу из dark store.
 *
 * @param address — канонический адрес хаба
 * @returns meta-схема или undefined
 */
export function getMeta(address: Address): MetaAST | undefined {
  return dark$.getMeta(address)
}

/**
 * Загружает meta-схему по адресу и собирает скрытую топологию.
 *
 * Рекурсивно загружает все зависимые meta-схемы через references
 * и собирает полный граф placements, references и entanglements.
 *
 * @param address — канонический адрес хаба для загрузки
 */
export async function matter(address: Address): Promise<void> {
  /**
   * Гарантирует загрузку meta-схемы.
   *
   * @param metaAddress — адрес meta-схемы
   * @returns загруженная или существующая meta-схема
   */
  const ensureMetaLoaded = async (metaAddress: Address) => {
    const existing = getMeta(metaAddress)
    if (existing) return existing

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    setMeta(metaAddress, ast)
    return ast
  }

  /**
   * Гарантирует наличие local topology fragment.
   *
   * @param metaAddress — адрес meta-схемы
   * @returns скомпилированный фрагмент топологии
   */
  const ensureLocalFragment = async (metaAddress: Address): Promise<LocalTopologyFragment> => {
    const existing = gravity$.getFragment(metaAddress)
    if (existing) return existing

    const ast = await ensureMetaLoaded(metaAddress)
    const sourcePath = resolveMetaTsPath(metaAddress)
    try {
      return gravity$.setFragment(metaAddress, compileLocalTopologyFragment(ast as LocalTopologyMetaLike))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Ошибка компиляции topology для "${sourcePath}": ${message}`)
    }
  }

  /**
   * Собирает скрытую топологию из root адреса.
   *
   * Рекурсивно обходит все references и загружает зависимые meta-схемы.
   *
   * @param rootAddress — адрес корневой meta-схемы
   */
  const assembleHiddenTopology = async (rootAddress: Address): Promise<void> => {
    const pending: Array<{ metaAddress: Address; parentPlacementId?: string; viaReferenceId?: string }> = [
      { metaAddress: rootAddress },
    ]

    while (pending.length > 0) {
      const next = pending.shift()!
      const fragment = await ensureLocalFragment(next.metaAddress)
      const ingested = ingestFragment(
        dark$,
        gravity$,
        strong$,
        next.metaAddress,
        fragment,
        {
          ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
          ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
        },
      )

      for (const referenceId of ingested.referenceIds) {
        const reference = dark$.getReference(referenceId)
        if (!reference) continue
        await ensureMetaLoaded(reference.src as Address)
        pending.push({
          metaAddress: reference.src as Address,
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }
    }
  }

  await ensureMetaLoaded(address)
  await assembleHiddenTopology(address)
}
