import type {
  DarkStore,
  DarkGravityStore,
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  StrongIndexes,
} from "@dark/types"
import type { DarkStrongStore } from "@dark/types/strong"
import type { LocalTopologyFragment, LocalTopologyPlacementRelation } from "@metafor/dsl/types"
import { indexEntanglement, indexObject, indexPlacement, indexReference } from "@dark/strong"

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
 * @param dark$ — состояние gravity store
 * @returns ID в формате `gp{n}`
 */
function makePlacementId(dark$: DarkGravityStore): string {
  const id = `gp${dark$.nextPlacementSeq}`
  dark$.nextPlacementSeq += 1
  return id
}

/**
 * Генерирует уникальный ID связи.
 *
 * @param dark$ — состояние gravity store
 * @returns ID в формате `gl{n}`
 */
function makeLinkId(dark$: DarkGravityStore): string {
  const id = `gl${dark$.nextLinkSeq}`
  dark$.nextLinkSeq += 1
  return id
}

/**
 * Генерирует уникальный ID ссылки.
 *
 * @param dark$ — состояние gravity store
 * @returns ID в формате `gr{n}`
 */
function makeReferenceId(dark$: DarkGravityStore): string {
  const id = `gr${dark$.nextReferenceSeq}`
  dark$.nextReferenceSeq += 1
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
 * @param dark$ — состояние gravity store
 * @param meta — адрес meta-схемы
 * @returns префикс в формате `/w:{sanitizedMeta}-{n}`
 */
function ensureRootPrefix(dark$: DarkGravityStore, meta: string): string {
  const prefix = `/w:${sanitizeMetaSegment(meta)}-${dark$.rootOccurrenceSeq}`
  dark$.rootOccurrenceSeq += 1
  return prefix
}

/**
 * Создаёт глобальные объекты из local topology fragment.
 *
 * @param dark$ — dark store для записи объектов
 * @param strong$ — strong indexes для индексации
 * @param meta — адрес meta-схемы
 * @param fragment — local topology fragment
 */
function ensureObjectDefinitions(
  dark$: DarkStore,
  strong$: StrongIndexes,
  meta: string,
  fragment: LocalTopologyFragment,
): void {
  for (const [localObjectId, definition] of Object.entries(fragment.objects as Record<string, any>)) {
    const objectId = makeObjectId(meta, localObjectId)
    if (dark$.getObject(objectId)) continue

    const object: GlobalTopologyObject = {
      id: objectId,
      meta,
      localObjectId,
      kind: definition.kind,
      definition: structuredClone(definition),
    }

    dark$.setObject(objectId, object)
    indexObject(objectId, meta, strong$)
  }
}

/**
 * Вставляет local topology fragment в глобальный граф.
 *
 * Создаёт global placements, links, references и entanglements,
 * записывает в `dark$`, обновляет индексы `strong$`.
 *
 * @param dark$ — dark store для записи
 * @param gravity$ — gravity store для счётчиков
 * @param strong$ — strong indexes для индексации
 * @param meta — адрес meta-схемы
 * @param fragment — local topology fragment для вставки
 * @param options — опции вставки (parent, viaReference)
 * @returns результат вставки с IDs созданных сущностей
 */
export function ingestFragment(
  dark$: DarkStore,
  gravity$: DarkGravityStore,
  strong$: DarkStrongStore,
  meta: string,
  fragment: LocalTopologyFragment,
  options: GlobalTopologyIngestOptions = {},
): GlobalTopologyIngestResult {
  gravity$.setFragment(meta, fragment)
  ensureObjectDefinitions(dark$, strong$, meta, fragment)

  const localPlacements = Object.values(fragment.placements).sort(
    (left, right) => left.address.length - right.address.length,
  )
  const localToGlobalPlacement = new Map<string, string>()
  const localToGlobalReference = new Map<string, string>()
  const rootPrefix = options.parentPlacementId ? null : ensureRootPrefix(gravity$, meta)
  const rootPlacementIds: string[] = []
  const placementIds: string[] = []
  const referenceIds: string[] = []
  const entanglementIds: string[] = []

  for (const localPlacement of localPlacements) {
    const objectId = makeObjectId(meta, localPlacement.objectId)
    const placementId = makePlacementId(gravity$)

    let address: string
    let parentId: string | undefined
    let relation = localPlacement.relation

    if (localPlacement.parentId) {
      parentId = localToGlobalPlacement.get(localPlacement.parentId)
      if (!parentId) {
        throw new Error(`Не найден global parent placement для ${localPlacement.parentId}.`)
      }
      const parentPlacement = dark$.getPlacement(parentId)
      const localParent = fragment.placements[localPlacement.parentId]
      if (!parentPlacement || !localParent) {
        throw new Error(`Не удалось перевести local topology address ${localPlacement.address}.`)
      }
      const suffix = localPlacement.address.slice(localParent.address.length)
      address = `${parentPlacement.address}${suffix}`
    } else if (options.parentPlacementId) {
      const parentPlacement = dark$.getPlacement(options.parentPlacementId)
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

    dark$.setPlacement(placementId, placement)
    indexPlacement(placement, meta, strong$)

    localToGlobalPlacement.set(localPlacement.id, placementId)
    placementIds.push(placementId)

    if (!parentId) {
      rootPlacementIds.push(placementId)
    } else {
      const linkId = makeLinkId(gravity$)
      const link: GlobalTopologyLink = {
        id: linkId,
        from: parentId,
        to: placementId,
        relation: relation as Exclude<LocalTopologyPlacementRelation, "root">,
      }
      dark$.setLink(linkId, link)
    }
  }

  for (const localReference of fragment.references) {
    const placementId = localToGlobalPlacement.get(localReference.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для reference ${localReference.id}.`)
    }

    const placement = dark$.getPlacement(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для reference ${localReference.id}.`)
    }

    const referenceId = makeReferenceId(gravity$)
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

    dark$.setReference(referenceId, reference)
    localToGlobalReference.set(localReference.id, referenceId)
    referenceIds.push(referenceId)
    indexReference(reference, meta, strong$)
  }

  for (const seed of fragment.entanglementSeeds) {
    const placementId = localToGlobalPlacement.get(seed.placementId)
    if (!placementId) {
      throw new Error(`Не найден global placement для entanglement seed ${seed.placementId}.`)
    }

    const placement = dark$.getPlacement(placementId)
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
      seed: structuredClone(seed),
    }

    dark$.setEntanglement(entanglement.id, entanglement)
    indexEntanglement(entanglement, meta, strong$)
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
