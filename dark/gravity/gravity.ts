/**
 * `@dark/gravity/gravity` — orchestrator hidden world assembly.
 *
 * Канонический graph пишет в `dark$`, промежуточное gravity-состояние
 * держит `gravity$`, индексы пишет `strong$`.
 *
 * **Dark × Gravity:**
 * - скрытая иерархия и организация схем
 * - `Graviton` как носитель внутренней гравитационной связности
 * - геометрия скрытых версий и их преемственности
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--gravity | ONTOLOGY.md} — онтология Dark × Gravity
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/TOPOLOGY.md | TOPOLOGY.md} — topology как скрытая карта построения
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/gravity.md | proto/gravity.md} — протокол Gravity
 */

import type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GravityStore,
  LocalTopologyFragment,
} from "@dark/gravity"
import type { DarkStore, StrongIndexes } from "@dark/gravity"
import type { LocalTopologyPlacementRelation } from "../../metafor/dsl/topology.t"
import { dark$, gravity$ } from "@dark/gravity"
import { strong$, indexEntanglement, indexObject, indexPlacement, indexReference } from "@dark/strong"
import { cloneStoredValue } from "@dark/gravity"

/**
 * Создаёт глобальный ID объекта из meta и локального ID.
 *
 * @param meta — адрес meta-схемы
 * @param localObjectId — локальный ID объекта внутри схемы
 * @returns глобальный ID в формате `meta#localObjectId`
 */
function makeObjectId(meta: string, localObjectId: string): string {
  return `${meta}#${localObjectId}`
}

/**
 * Генерирует уникальный ID размещения.
 *
 * @param store$ — состояние gravity store
 * @returns ID в формате `gp{n}`
 */
function makePlacementId(store$: GravityStore): string {
  const id = `gp${store$.nextPlacementSeq}`
  store$.nextPlacementSeq += 1
  return id
}

/**
 * Генерирует уникальный ID связи.
 *
 * @param store$ — состояние gravity store
 * @returns ID в формате `gl{n}`
 */
function makeLinkId(store$: GravityStore): string {
  const id = `gl${store$.nextLinkSeq}`
  store$.nextLinkSeq += 1
  return id
}

/**
 * Генерирует уникальный ID ссылки.
 *
 * @param store$ — состояние gravity store
 * @returns ID в формате `gr{n}`
 */
function makeReferenceId(store$: GravityStore): string {
  const id = `gr${store$.nextReferenceSeq}`
  store$.nextReferenceSeq += 1
  return id
}

/**
 * Очищает meta-строку от недопустимых символов.
 *
 * @param meta — исходная meta-строка
 * @returns строка, содержащая только A-Za-z0-9_-
 */
function sanitizeMetaSegment(meta: string): string {
  return meta.replace(/[^A-Za-z0-9_-]+/g, "-")
}

/**
 * Генерирует root prefix для meta и инкрементирует счётчик.
 *
 * @param store$ — состояние gravity store
 * @param meta — адрес meta-схемы
 * @returns префикс в формате `/w:{sanitizedMeta}-{n}`
 */
function ensureRootPrefix(store$: GravityStore, meta: string): string {
  const prefix = `/w:${sanitizeMetaSegment(meta)}-${store$.rootOccurrenceSeq}`
  store$.rootOccurrenceSeq += 1
  return prefix
}

/**
 * Создаёт глобальные объекты из local topology fragment.
 *
 * @param store$ — dark store для записи объектов
 * @param indexes$ — strong indexes для индексации
 * @param meta — адрес meta-схемы
 * @param fragment — local topology fragment
 */
function ensureObjectDefinitions(
  store$: DarkStore,
  indexes$: StrongIndexes,
  meta: string,
  fragment: LocalTopologyFragment,
): void {
  for (const [localObjectId, definition] of Object.entries(fragment.objects as Record<string, any>)) {
    const objectId = makeObjectId(meta, localObjectId)
    if (store$.getObject(objectId)) continue

    const object: GlobalTopologyObject = {
      id: objectId,
      meta,
      localObjectId,
      kind: definition.kind,
      definition: cloneStoredValue(definition),
    }

    store$.setObject(objectId, object)
    indexObject(objectId, meta, indexes$)
  }
}

/**
 * Вставляет local topology fragment в глобальный граф.
 *
 * Создаёт global placements, links, references и entanglements,
 * записывает в `dark$`, обновляет индексы `strong$`.
 *
 * @param meta — адрес meta-схемы
 * @param fragment — local topology fragment для вставки
 * @param options — опции вставки (parent, viaReference)
 * @param store$ — dark store для записи (по умолчанию `dark$`)
 * @param gravityState$ — gravity store для счётчиков (по умолчанию `gravity$`)
 * @param indexes$ — strong indexes для индексации (по умолчанию `strong$`)
 * @returns результат вставки с IDs созданных сущностей
 */
export function ingestFragment(
  meta: string,
  fragment: LocalTopologyFragment,
  options: GlobalTopologyIngestOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): GlobalTopologyIngestResult {
  gravityState$.setFragment(meta, fragment)
  ensureObjectDefinitions(store$, indexes$, meta, fragment)

  const localPlacements = Object.values(fragment.placements).sort(
    (left, right) => left.address.length - right.address.length,
  )
  const localToGlobalPlacement = new Map<string, string>()
  const localToGlobalReference = new Map<string, string>()
  const rootPrefix = options.parentPlacementId ? null : ensureRootPrefix(gravityState$, meta)
  const rootPlacementIds: string[] = []
  const placementIds: string[] = []
  const referenceIds: string[] = []
  const entanglementIds: string[] = []

  for (const localPlacement of localPlacements) {
    const objectId = makeObjectId(meta, localPlacement.objectId)
    const placementId = makePlacementId(gravityState$)

    let address: string
    let parentId: string | undefined
    let relation = localPlacement.relation

    if (localPlacement.parentId) {
      parentId = localToGlobalPlacement.get(localPlacement.parentId)
      if (!parentId) {
        throw new Error(`Не найден global parent placement для ${localPlacement.parentId}.`)
      }
      const parentPlacement = store$.getPlacement(parentId)
      const localParent = fragment.placements[localPlacement.parentId]
      if (!parentPlacement || !localParent) {
        throw new Error(`Не удалось перевести local topology address ${localPlacement.address}.`)
      }
      const suffix = localPlacement.address.slice(localParent.address.length)
      address = `${parentPlacement.address}${suffix}`
    } else if (options.parentPlacementId) {
      const parentPlacement = store$.getPlacement(options.parentPlacementId)
      if (!parentPlacement) {
        throw new Error(`Не найден stitch parent placement ${options.parentPlacementId}.`)
      }
      address = `${parentPlacement.address}${localPlacement.address}`
      parentId = options.parentPlacementId
      relation = "contains"
    } else {
      address = `${rootPrefix}${localPlacement.address}`
    }

    const placement: GlobalTopologyPlacement = {
      id: placementId,
      meta,
      objectId,
      localPlacementId: localPlacement.id,
      localAddress: localPlacement.address,
      address,
      relation,
      ...(parentId ? { parentId } : {}),
      ...(options.viaReferenceId ? { viaReferenceId: options.viaReferenceId } : {}),
    }

    store$.setPlacement(placementId, placement)
    indexPlacement(placement, meta, indexes$)

    localToGlobalPlacement.set(localPlacement.id, placementId)
    placementIds.push(placementId)

    if (!parentId) {
      rootPlacementIds.push(placementId)
    } else {
      const linkId = makeLinkId(gravityState$)
      const link: GlobalTopologyLink = {
        id: linkId,
        from: parentId,
        to: placementId,
        relation: relation as Exclude<LocalTopologyPlacementRelation, "root">,
      }
      store$.setLink(linkId, link)
    }
  }

  for (const localReference of fragment.references) {
    const placementId = localToGlobalPlacement.get(localReference.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для reference ${localReference.id}.`)
    }

    const placement = store$.getPlacement(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для reference ${localReference.id}.`)
    }

    const referenceId = makeReferenceId(gravityState$)
    const reference: GlobalTopologyReference = {
      id: referenceId,
      meta,
      localReferenceId: localReference.id,
      placementId,
      objectId: makeObjectId(meta, localReference.objectId),
      address: `${placement.address}@ref:${localReference.id}`,
      src: localReference.src,
      via: localReference.via,
      ...(localReference.field ? { field: localReference.field } : {}),
      ...(localReference.value !== undefined ? { value: localReference.value } : {}),
    }

    store$.setReference(referenceId, reference)
    localToGlobalReference.set(localReference.id, referenceId)
    referenceIds.push(referenceId)
    indexReference(reference, meta, indexes$)
  }

  for (const seed of fragment.entanglementSeeds) {
    const placementId = localToGlobalPlacement.get(seed.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для entanglement seed ${seed.placementId}.`)
    }

    const placement = store$.getPlacement(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для entanglement seed ${seed.placementId}.`)
    }

    const objectId = makeObjectId(meta, seed.objectId)
    const entanglementAddress = `ent:${objectId}@${placement.address}`
    const entanglement: GlobalTopologyEntanglement = {
      id: entanglementAddress,
      meta,
      placementId,
      objectId,
      topologyAddress: placement.address,
      entanglementAddress,
      dataPaths: [...seed.dataPaths],
      referenceIds: seed.referenceIds
        .map((localReferenceId) => localToGlobalReference.get(localReferenceId))
        .filter(Boolean) as string[],
      seed: cloneStoredValue(seed),
    }

    store$.setEntanglement(entanglement.id, entanglement)
    indexEntanglement(entanglement, meta, indexes$)
    entanglementIds.push(entanglement.id)
  }

  return {
    meta,
    rootPlacementIds,
    placementIds,
    referenceIds,
    entanglementIds,
  }
}
