import type {
  ChildRelation,
  IntrinsicNode,
  IntrinsicPort,
  LocalPlacement,
  PackingPolicy,
  PlacementInput,
  PlacementResult,
  RankResult,
  Size,
} from "../types/placement.ts"
import type {
  FixedRect,
  RouteDirection,
  RouteEdge,
  RouteGraphInput,
  RouteNode,
  RoutePort,
} from "../types/routing.ts"

const compareIds = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

export function placeGraph(input: PlacementInput): PlacementResult {
  validatePlacementInput(input)
  return placeGraphWithAlignedContainers(input, new Set(relationContainers(input)), {
    kind: "LAYERED",
    reserveCorridors: false,
  })
}

export function placementCandidates(input: PlacementInput): readonly PlacementResult[] {
  validatePlacementInput(input)
  const containers = relationContainers(input)
  const policies: Array<ReadonlySet<string | null>> = []
  if (containers.length <= 8) {
    for (let mask = 0; mask < 2 ** containers.length; mask += 1) {
      policies.push(new Set(containers.filter((_, index) => (mask & (1 << index)) !== 0)))
    }
  } else {
    policies.push(new Set(), new Set(containers))
    for (const container of containers) policies.push(new Set([container]))
  }
  const unique = new Map<string, PlacementResult>()
  for (const policy of policies) {
    for (const reserveCorridors of [false, true]) {
      const result = placeGraphWithAlignedContainers(input, policy, {
        kind: "LAYERED",
        reserveCorridors,
      })
      const key = JSON.stringify({nodes: result.nodes, ports: result.ports, bounds: result.bounds})
      if (!unique.has(key)) unique.set(key, result)
    }
  }
  if (input.viewport.height > input.viewport.width) {
    const widthPermilles = [
      600, 800, 1_000, 1_250, 1_600,
      ...(needsWidePortraitFallback(input) ? [2_000] : []),
    ]
    for (const rootWidthPermille of widthPermilles) {
      for (const nestedWidthPermille of widthPermilles) {
        for (const compactSources of [false, true]) {
          const result = placeGraphWithAlignedContainers(input, new Set(), {
            kind: "PORTRAIT_FLOW",
            rootWidthPermille,
            nestedWidthPermille,
            compactSources,
          })
          const key = JSON.stringify({nodes: result.nodes, ports: result.ports, bounds: result.bounds})
          if (!unique.has(key)) unique.set(key, result)
        }
      }
    }
  }
  return [...unique.entries()].sort(([left], [right]) => compareIds(left, right)).map(([, result]) => result)
}

function needsWidePortraitFallback(input: PlacementInput): boolean {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]))
  const portById = new Map(input.ports.map((port) => [port.id, port]))
  const siblingRelations = new Map<string, number>()
  for (const edge of input.edges) {
    const source = portById.get(edge.sourcePortId)
    const target = portById.get(edge.targetPortId)
    if (source === undefined || target === undefined) continue
    const sourceParent = nodeById.get(source.nodeId)?.parentId
    const targetParent = nodeById.get(target.nodeId)?.parentId
    if (sourceParent === undefined || sourceParent !== targetParent) continue
    const count = (siblingRelations.get(sourceParent) ?? 0) + 1
    if (count > 2) return true
    siblingRelations.set(sourceParent, count)
  }
  return false
}

function placeGraphWithAlignedContainers(input: PlacementInput, alignedContainers: ReadonlySet<string | null>, packing: PackingPolicy): PlacementResult {
  validatePlacementInput(input)
  const direction: RouteDirection = input.viewport.width >= input.viewport.height ? "RIGHT" : "DOWN"
  const nodeById = new Map([...input.nodes].sort((a, b) => compareIds(a.id, b.id)).map((node) => [node.id, node]))
  const portById = new Map([...input.ports].sort((a, b) => compareIds(a.id, b.id)).map((port) => [port.id, port]))
  const children = new Map<string | null, string[]>()
  for (const node of nodeById.values()) {
    const parent = node.parentId ?? null
    const list = children.get(parent) ?? []
    list.push(node.id)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort(compareIds)

  const measured = new Map<string, LocalPlacement>()
  const measure = (nodeId: string): LocalPlacement => {
    const cached = measured.get(nodeId)
    if (cached !== undefined) return cached
    const node = nodeById.get(nodeId)!
    const childIds = children.get(nodeId) ?? []
    if (childIds.length === 0) {
      const leaf = {size: node.size, childOffsets: new Map<string, Readonly<{x: number; y: number}>>()}
      measured.set(nodeId, leaf)
      return leaf
    }
    for (const childId of childIds) measure(childId)
    const arranged = arrangeChildren(input, direction, nodeId, childIds, measured, nodeById, portById, alignedContainers, packing)
    const result: LocalPlacement = {
      size: {
        w: Math.max(node.size.w, arranged.size.w + input.padding * 2),
        h: Math.max(node.size.h, node.contentHeight + arranged.size.h + input.padding * 2),
      },
      childOffsets: new Map([...arranged.childOffsets].map(([id, point]) => [id, {
        x: point.x + input.padding,
        y: point.y + node.contentHeight + input.padding,
      }])),
    }
    measured.set(nodeId, result)
    return result
  }

  const topIds = children.get(null) ?? []
  for (const id of topIds) measure(id)
  const rootArrangement = arrangeChildren(input, direction, null, topIds, measured, nodeById, portById, alignedContainers, packing)
  const topChild = (nodeId: string): string => {
    let current = nodeId
    while (nodeById.get(current)?.parentId !== undefined) current = nodeById.get(current)!.parentId!
    return current
  }
  const relativePortX = (topId: string, port: IntrinsicPort): number => {
    let x = 0
    let current = port.nodeId
    while (current !== topId) {
      const parentId = nodeById.get(current)?.parentId
      if (parentId === undefined) throw new Error(`port ${port.id} is not inside top-level child ${topId}`)
      const offset = measured.get(parentId)?.childOffsets.get(current)
      if (offset === undefined) throw new Error(`missing measured offset ${parentId}/${current}`)
      x += offset.x
      current = parentId
    }
    return x + (port.side === "EAST" ? measured.get(port.nodeId)!.size.w : 0)
  }
  const backwardRootEdges = input.edges.filter((edge) => {
    const source = portById.get(edge.sourcePortId)
    const target = portById.get(edge.targetPortId)
    if (source === undefined || target === undefined) return false
    const sourceTop = topChild(source.nodeId)
    const targetTop = topChild(target.nodeId)
    if (sourceTop === targetTop) return false
    const sourceX = rootArrangement.childOffsets.get(sourceTop)!.x + relativePortX(sourceTop, source)
    const targetX = rootArrangement.childOffsets.get(targetTop)!.x + relativePortX(targetTop, target)
    return sourceX + input.clearance * 2 > targetX
  }).length
  // The declared outer padding is the minimum obstacle clearance. Keep one
  // additional clearance band for the first outside track, then one track for
  // every reverse-flow semantic edge that must leave a right-hand top-level
  // subtree before reaching a WEST target. This is occupied routing capacity,
  // not global empty compound padding.
  const rootCorridor = input.outerPadding + Math.max(input.clearance, backwardRootEdges * input.clearance)
  const bounds: FixedRect = {x: 0, y: 0, w: rootArrangement.size.w + rootCorridor * 2, h: rootArrangement.size.h + rootCorridor * 2}
  const rects = new Map<string, FixedRect>()
  const place = (nodeId: string, x: number, y: number): void => {
    const layout = measured.get(nodeId)!
    rects.set(nodeId, {x, y, w: layout.size.w, h: layout.size.h})
    for (const [childId, offset] of layout.childOffsets) place(childId, x + offset.x, y + offset.y)
  }
  for (const [id, offset] of rootArrangement.childOffsets) place(id, rootCorridor + offset.x, rootCorridor + offset.y)

  const routeNodes: RouteNode[] = [...nodeById.values()].map((node) => {
    const rect = rects.get(node.id)!
    return {
      id: node.id,
      ...(node.parentId === undefined ? {} : {parentId: node.parentId}),
      rect,
      contentRect: {x: rect.x, y: rect.y, w: rect.w, h: node.contentHeight},
    }
  })
  const routePorts: RoutePort[] = [...portById.values()].map((port) => {
    const rect = rects.get(port.nodeId)!
    return {id: port.id, nodeId: port.nodeId, center: {x: port.side === "WEST" ? rect.x : rect.x + rect.w, y: rect.y + port.offsetY}, side: port.side, direction: port.direction}
  })
  const routeInput: RouteGraphInput = {direction, unitsPerPixel: input.unitsPerPixel, clearance: input.clearance, bounds, viewport: input.viewport, nodes: routeNodes, ports: routePorts, edges: [...input.edges].sort((a, b) => compareIds(a.id, b.id))}
  const hardViolations = validatePlacement(input, {direction, nodes: routeNodes, ports: routePorts, bounds})
  if (hardViolations.length > 0) throw new Error(`placeGraph produced invalid geometry:\n${hardViolations.join("\n")}`)
  const compounds = routeNodes.filter((node) => (children.get(node.id)?.length ?? 0) > 0)
  const compoundArea = compounds.reduce((sum, node) => sum + node.rect.w * node.rect.h, 0)
  const compoundEmptyRatios = compounds.map((node) => {
    const ownContentArea = node.rect.w * nodeById.get(node.id)!.contentHeight
    const childArea = (children.get(node.id) ?? []).reduce(
      (childSum, id) => childSum + rects.get(id)!.w * rects.get(id)!.h,
      0,
    )
    return 1 - (ownContentArea + childArea) / (node.rect.w * node.rect.h)
  })
  const occupiedArea = compounds.reduce((sum, node, index) =>
    sum + node.rect.w * node.rect.h * (1 - compoundEmptyRatios[index]!), 0)
  const fitScale = Math.min(input.viewport.width * input.unitsPerPixel / bounds.w, input.viewport.height * input.unitsPerPixel / bounds.h, 1)
  const visibleContentArea = routeNodes.reduce((sum, node) => {
    const intrinsicHeight = nodeById.get(node.id)!.contentHeight
    return sum + node.rect.w * intrinsicHeight
  }, 0)
  const viewportArea = input.viewport.width * input.unitsPerPixel * input.viewport.height * input.unitsPerPixel
  const displayEmptyRatio = Math.max(0, 1 - visibleContentArea * fitScale ** 2 / viewportArea)
  const routeNodeById = new Map(routeNodes.map((node) => [node.id, node]))
  const routePortById = new Map(routePorts.map((port) => [port.id, port]))
  const forwardBySource = new Map<string, Array<Readonly<{source: RoutePort; target: RoutePort}>>>()
  for (const edge of input.edges) {
    const source = routePortById.get(edge.sourcePortId)
    const target = routePortById.get(edge.targetPortId)
    if (source === undefined || target === undefined) continue
    const sourceRect = routeNodeById.get(source.nodeId)!.rect
    const targetRect = routeNodeById.get(target.nodeId)!.rect
    if (targetRect.y <= sourceRect.y) continue
    const entries = forwardBySource.get(source.nodeId) ?? []
    entries.push({source, target})
    forwardBySource.set(source.nodeId, entries)
  }
  const sourceCorridorDeficit = [...forwardBySource.values()].reduce((total, entries) => {
    const requiredRunway = (entries.length + 1) * input.clearance
    return total + entries.reduce(
      (sum, {source, target}) => sum + Math.max(0, source.center.x + requiredRunway - target.center.x),
      0,
    )
  }, 0)
  return {direction, nodes: routeNodes, ports: routePorts, bounds, metrics: {direction, width: bounds.w, height: bounds.h, fitScale, displayEmptyRatio, compoundEmptyRatio: compoundArea === 0 ? 0 : 1 - occupiedArea / compoundArea, maxCompoundEmptyRatio: Math.max(0, ...compoundEmptyRatios), sourceCorridorDeficit, hardViolations}, routeInput}
}

function relationContainers(input: PlacementInput): readonly (string | null)[] {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]))
  const portById = new Map(input.ports.map((port) => [port.id, port]))
  const chain = (nodeId: string): readonly (string | null)[] => {
    const result: Array<string | null> = []
    let current: string | null = nodeId
    while (current !== null) {
      result.push(current)
      current = nodeById.get(current)?.parentId ?? null
    }
    result.push(null)
    return result
  }
  const containers = new Set<string | null>()
  for (const edge of input.edges) {
    const sourceNodeId = portById.get(edge.sourcePortId)?.nodeId
    const targetNodeId = portById.get(edge.targetPortId)?.nodeId
    if (sourceNodeId === undefined || targetNodeId === undefined || sourceNodeId === targetNodeId) continue
    const targetChain = new Set(chain(targetNodeId))
    const container = chain(sourceNodeId).find((candidate) => targetChain.has(candidate))
    if (container === undefined || container === sourceNodeId || container === targetNodeId) continue
    containers.add(container)
  }
  return [...containers].sort((left, right) => compareIds(left ?? "", right ?? ""))
}

function arrangeChildren(
  input: PlacementInput,
  direction: RouteDirection,
  containerId: string | null,
  childIds: readonly string[],
  measured: ReadonlyMap<string, LocalPlacement>,
  nodeById: ReadonlyMap<string, IntrinsicNode>,
  portById: ReadonlyMap<string, IntrinsicPort>,
  alignedContainers: ReadonlySet<string | null>,
  packing: PackingPolicy,
): LocalPlacement {
  if (childIds.length === 0) return {size: {w: 0, h: 0}, childOffsets: new Map()}
  const ranked = rankChildren(containerId, childIds, input.edges, nodeById, portById)
  const relativePortPoint = (childId: string, port: IntrinsicPort): Readonly<{x: number; y: number}> => {
    let x = 0
    let y = 0
    let current = port.nodeId
    while (current !== childId) {
      const parentId = nodeById.get(current)?.parentId
      if (parentId === undefined) throw new Error(`port ${port.id} is not inside direct child ${childId}`)
      const childOffset = measured.get(parentId)?.childOffsets.get(current)
      if (childOffset === undefined) throw new Error(`missing measured offset ${parentId}/${current}`)
      x += childOffset.x
      y += childOffset.y
      current = parentId
    }
    const nodeSize = measured.get(port.nodeId)!.size
    return {x: x + (port.side === "WEST" ? 0 : nodeSize.w), y: y + port.offsetY}
  }
  if (direction === "DOWN" && packing.kind === "PORTRAIT_FLOW") {
    const baseHorizontalGap = input.nodeSpacing
    const eastFanout = new Map(childIds.map((id) => [id, 0]))
    const westFanin = new Map(childIds.map((id) => [id, 0]))
    for (const relation of ranked.relations) {
      eastFanout.set(relation.sourceChild, eastFanout.get(relation.sourceChild)! + 1)
      westFanin.set(relation.targetChild, westFanin.get(relation.targetChild)! + 1)
    }
    const gapBetween = (leftId: string, rightId: string): number => Math.max(
      baseHorizontalGap,
      (Math.max(eastFanout.get(leftId)!, westFanin.get(rightId)!) + 1) * input.clearance,
    )
    const edgeReserve = (edgeCount: number): number => Math.max(
      0,
      (edgeCount + 1) * input.clearance - input.padding,
    )
    const rowWidth = (ids: readonly string[]): number => {
      if (ids.length === 0) return 0
      let width = edgeReserve(westFanin.get(ids[0]!)!)
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index]!
        width += measured.get(id)!.size.w
        const nextId = ids[index + 1]
        if (nextId !== undefined) width += gapBetween(id, nextId)
      }
      return width + edgeReserve(eastFanout.get(ids.at(-1)!)!)
    }
    const footprintArea = childIds.reduce((sum, id) => {
      const size = measured.get(id)!.size
      return sum + (size.w + baseHorizontalGap) * (size.h + input.layerSpacing)
    }, 0)
    const widest = Math.max(...childIds.map((id) => measured.get(id)!.size.w))
    const idealWidth = Math.round(Math.sqrt(footprintArea * input.viewport.width / input.viewport.height))
    const widthPermille = containerId === null
      ? packing.rootWidthPermille
      : packing.nestedWidthPermille
    const targetWidth = Math.max(widest, Math.round(idealWidth * widthPermille / 1_000))
    const rows: Array<{ids: string[]; width: number; height: number}> = []
    let row: {ids: string[]; width: number; height: number} = {ids: [], width: 0, height: 0}
    for (const id of ranked.order) {
      const size = measured.get(id)!.size
      const nextIds = [...row.ids, id]
      const nextWidth = rowWidth(nextIds)
      if (row.ids.length > 0 && nextWidth > targetWidth) {
        rows.push(row)
        row = {ids: [], width: 0, height: 0}
      }
      row.ids.push(id)
      row.width = rowWidth(row.ids)
      row.height = Math.max(row.height, size.h)
    }
    rows.push(row)
    const rowIndexById = new Map<string, number>()
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      for (const id of rows[rowIndex]!.ids) rowIndexById.set(id, rowIndex)
    }
    const occupiedCorridorAfter = (rowIndex: number): number => {
      const crossingRelations = ranked.relations.filter((relation) => {
        const sourceRow = rowIndexById.get(relation.sourceChild)!
        const targetRow = rowIndexById.get(relation.targetChild)!
        return Math.min(sourceRow, targetRow) <= rowIndex && Math.max(sourceRow, targetRow) > rowIndex
      })
      if (crossingRelations.length === 0) return input.layerSpacing
      const countByEndpoint = new Map<string, number>()
      for (const relation of crossingRelations) {
        for (const id of [relation.sourceChild, relation.targetChild]) {
          countByEndpoint.set(id, (countByEndpoint.get(id) ?? 0) + 1)
        }
      }
      return (Math.max(...countByEndpoint.values()) + 1) * input.clearance
    }
    const verticalOffsetById = new Map<string, number>()
    const componentsByRow: string[][][] = []
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const entry = rows[rowIndex]!
      const rowComponents: string[][] = []
      const ids = new Set(entry.ids)
      const adjacency = new Map(entry.ids.map((id) => [id, [] as Array<Readonly<{
        id: string
        delta: number
        edgeId: string
      }>>]))
      const rowRelations = ranked.relations.filter((relation) =>
        ids.has(relation.sourceChild) && ids.has(relation.targetChild))
      const relationDegree = new Map(entry.ids.map((id) => [
        id,
        rowRelations.filter((relation) =>
          relation.sourceChild === id || relation.targetChild === id).length,
      ]))
      for (const relation of rowRelations) {
        if (relationDegree.get(relation.sourceChild) !== 1 || relationDegree.get(relation.targetChild) !== 1) continue
        const source = relativePortPoint(relation.sourceChild, relation.sourcePort)
        const target = relativePortPoint(relation.targetChild, relation.targetPort)
        const targetDelta = source.y - target.y
        adjacency.get(relation.sourceChild)!.push({id: relation.targetChild, delta: targetDelta, edgeId: relation.edgeId})
        adjacency.get(relation.targetChild)!.push({id: relation.sourceChild, delta: -targetDelta, edgeId: relation.edgeId})
      }
      for (const neighbours of adjacency.values()) {
        neighbours.sort((left, right) => compareIds(left.edgeId, right.edgeId) || compareIds(left.id, right.id))
      }
      const visited = new Set<string>()
      for (const root of [...entry.ids].sort(compareIds)) {
        if (visited.has(root)) continue
        const component = new Map<string, number>([[root, 0]])
        const queue = [root]
        visited.add(root)
        while (queue.length > 0) {
          const current = queue.shift()!
          for (const neighbour of adjacency.get(current)!) {
            if (visited.has(neighbour.id)) continue
            component.set(neighbour.id, component.get(current)! + neighbour.delta)
            visited.add(neighbour.id)
            queue.push(neighbour.id)
          }
        }
        const minimum = Math.min(...component.values())
        for (const [id, value] of component) verticalOffsetById.set(id, value - minimum)
        rowComponents.push([...component.keys()].sort(compareIds))
      }
      componentsByRow.push(rowComponents)
      entry.height = Math.max(...entry.ids.map((id) =>
        verticalOffsetById.get(id)! + measured.get(id)!.size.h))
    }
    const width = Math.max(...rows.map((entry) => entry.width))
    const offsets = new Map<string, Readonly<{x: number; y: number}>>()
    let y = 0
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const entry = rows[rowIndex]!
      const leadingReserve = edgeReserve(westFanin.get(entry.ids[0]!)!)
      const minimumX = leadingReserve
      const relativeXs = new Map<string, number>()
      let relativeX = 0
      for (let index = 0; index < entry.ids.length; index += 1) {
        const id = entry.ids[index]!
        relativeXs.set(id, relativeX)
        const nextId = entry.ids[index + 1]
        if (nextId !== undefined) relativeX += measured.get(id)!.size.w + gapBetween(id, nextId)
      }
      const incoming = ranked.relations.filter((relation) =>
        relativeXs.has(relation.targetChild) && offsets.has(relation.sourceChild))
      const alignmentRelations = incoming.map((relation) => {
        const sourceOffset = offsets.get(relation.sourceChild)!
        const sourcePort = relativePortPoint(relation.sourceChild, relation.sourcePort)
        const targetPort = relativePortPoint(relation.targetChild, relation.targetPort)
        return {
          sourceEast: sourceOffset.x + sourcePort.x,
          targetWestOffset: relativeXs.get(relation.targetChild)! + targetPort.x,
        }
      })
      const maximumX = width - entry.width + leadingReserve
      const centeredX = Math.floor((width - entry.width) / 2) + leadingReserve
      let x = choosePortraitRowX({
        minimumX,
        centeredX,
        maximumX,
        clearance: input.clearance,
        relations: alignmentRelations,
      })
      const positions = new Map<string, number>()
      for (let index = 0; index < entry.ids.length; index += 1) {
        const id = entry.ids[index]!
        const size = measured.get(id)!.size
        positions.set(id, x)
        const nextId = entry.ids[index + 1]
        if (nextId !== undefined) x += size.w + gapBetween(id, nextId)
      }
      for (const id of entry.ids) {
        offsets.set(id, {x: positions.get(id)!, y: y + verticalOffsetById.get(id)!})
      }
      const nextRow = rows[rowIndex + 1]
      if (nextRow === undefined) {
        y += entry.height
      } else {
        y += entry.height + Math.max(input.layerSpacing, occupiedCorridorAfter(rowIndex))
      }
    }
    if (packing.compactSources) {
      for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const entry = rows[rowIndex]!
        for (let index = 0; index < entry.ids.length; index += 1) {
          const id = entry.ids[index]!
          const outgoing = ranked.relations.filter((relation) =>
            relation.sourceChild === id &&
            (rowIndexById.get(relation.targetChild) ?? -1) > rowIndex)
          if (outgoing.length === 0) continue
          const sourceOffset = offsets.get(id)!
          const requiredRunway = (outgoing.length + 1) * input.clearance
          const requiredShift = Math.max(0, ...outgoing.map((relation) => {
            const targetOffset = offsets.get(relation.targetChild)!
            const sourcePort = relativePortPoint(id, relation.sourcePort)
            const targetPort = relativePortPoint(relation.targetChild, relation.targetPort)
            return sourceOffset.x + sourcePort.x + requiredRunway - targetOffset.x - targetPort.x
          }))
          const previousId = entry.ids[index - 1]
          const leftLimit = previousId === undefined
            ? edgeReserve(westFanin.get(id)!)
            : offsets.get(previousId)!.x + measured.get(previousId)!.size.w + gapBetween(previousId, id)
          const shift = Math.min(requiredShift, Math.max(0, sourceOffset.x - leftLimit))
          if (shift > 0) offsets.set(id, {x: sourceOffset.x - shift, y: sourceOffset.y})
        }
      }
    }
    const rightSideTracks = containerId === null ? 0 : ranked.relations.filter((relation) => {
      const sourceOffset = offsets.get(relation.sourceChild)!
      const targetOffset = offsets.get(relation.targetChild)!
      const source = relativePortPoint(relation.sourceChild, relation.sourcePort)
      const target = relativePortPoint(relation.targetChild, relation.targetPort)
      return sourceOffset.x + source.x + input.clearance * 2 > targetOffset.x + target.x
    }).length
    const sideReserve = rightSideTracks * input.clearance
    let reservedWidth = width
    if (sideReserve > 0) {
      const rowBounds = rows.map((entry) => {
        const left = Math.min(...entry.ids.map((id) => offsets.get(id)!.x))
        const right = Math.max(...entry.ids.map((id) => offsets.get(id)!.x + measured.get(id)!.size.w))
        return {entry, left, right}
      })
      reservedWidth = Math.max(
        width,
        ...rowBounds.map(({left, right}) => right - left + sideReserve * 2),
      )
      for (const {entry, left, right} of rowBounds) {
        const minimumShift = sideReserve - left
        const maximumShift = reservedWidth - sideReserve - right
        const shift = Math.max(minimumShift, Math.min(0, maximumShift))
        if (shift === 0) continue
        for (const id of entry.ids) {
          const point = offsets.get(id)!
          offsets.set(id, {x: point.x + shift, y: point.y})
        }
      }
    }
    const horizontalGap = (leftId: string, rightId: string): number => {
      const left = offsets.get(leftId)!
      const right = offsets.get(rightId)!
      const leftWidth = measured.get(leftId)!.size.w
      const rightWidth = measured.get(rightId)!.size.w
      return Math.max(right.x - left.x - leftWidth, left.x - right.x - rightWidth)
    }
    const downwardTracks = (beforeRow: number): readonly Readonly<{left: number; right: number; y: number}>[] => {
      const tracks: Array<Readonly<{left: number; right: number; y: number}>> = []
      for (const relation of ranked.relations) {
        const sourceRow = rowIndexById.get(relation.sourceChild)
        const targetRow = rowIndexById.get(relation.targetChild)
        if (sourceRow === undefined || sourceRow !== targetRow || sourceRow >= beforeRow) continue
        const sourceOffset = offsets.get(relation.sourceChild)!
        const targetOffset = offsets.get(relation.targetChild)!
        const sourcePort = relativePortPoint(relation.sourceChild, relation.sourcePort)
        const targetPort = relativePortPoint(relation.targetChild, relation.targetPort)
        const source = {x: sourceOffset.x + sourcePort.x, y: sourceOffset.y + sourcePort.y}
        const target = {x: targetOffset.x + targetPort.x, y: targetOffset.y + targetPort.y}
        const left = Math.min(source.x, target.x)
        const right = Math.max(source.x, target.x)
        const blockers = rows[sourceRow]!.ids.filter((id) => {
          if (id === relation.sourceChild || id === relation.targetChild) return false
          const point = offsets.get(id)!
          const size = measured.get(id)!.size
          const blocksEndpointLane = (laneY: number): boolean =>
            laneY > point.y - input.clearance && laneY < point.y + size.h + input.clearance
          return (blocksEndpointLane(source.y) || blocksEndpointLane(target.y)) &&
            Math.max(left, point.x - input.clearance) < Math.min(right, point.x + size.w + input.clearance)
        })
        if (blockers.length === 0) continue
        const above = Math.min(...blockers.map((id) => offsets.get(id)!.y)) - input.clearance
        const below = Math.max(...blockers.map((id) => offsets.get(id)!.y + measured.get(id)!.size.h)) + input.clearance
        const aboveCost = Math.abs(source.y - above) + Math.abs(target.y - above)
        const belowCost = Math.abs(source.y - below) + Math.abs(target.y - below)
        if (belowCost >= aboveCost) continue
        tracks.push({left, right, y: below})
      }
      return tracks
    }
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const earlierIds = rows.slice(0, rowIndex).flatMap((entry) => entry.ids)
      const tracks = downwardTracks(rowIndex)
      for (const component of componentsByRow[rowIndex]!) {
        let translation = 0
        for (const id of component) {
          const relativeY = verticalOffsetById.get(id)!
          const point = offsets.get(id)!
          const size = measured.get(id)!.size
          for (const earlierId of earlierIds) {
            if (horizontalGap(id, earlierId) >= input.nodeSpacing) continue
            const earlier = offsets.get(earlierId)!
            const earlierRow = rowIndexById.get(earlierId)!
            const requiredGap = earlierRow === rowIndex - 1
              ? Math.max(input.layerSpacing, occupiedCorridorAfter(earlierRow))
              : input.nodeSpacing
            translation = Math.max(
              translation,
              earlier.y + measured.get(earlierId)!.size.h + requiredGap - relativeY,
            )
          }
          for (const track of tracks) {
            if (Math.max(point.x, track.left) >= Math.min(point.x + size.w, track.right)) continue
            translation = Math.max(translation, track.y + input.clearance - relativeY)
          }
        }
        for (const id of component) {
          const point = offsets.get(id)!
          offsets.set(id, {x: point.x, y: translation + verticalOffsetById.get(id)!})
        }
      }
    }
    const compactedHeight = Math.max(...childIds.map((id) =>
      offsets.get(id)!.y + measured.get(id)!.size.h))
    return {
      size: {w: reservedWidth, h: compactedHeight + sideReserve},
      childOffsets: offsets,
    }
  }
  const ranks = ranked.ranks
  const layerNumbers = [...new Set(childIds.map((id) => ranks.get(id)!))].sort((a, b) => a - b)
  const layers = layerNumbers.map((rank) => childIds.filter((id) => ranks.get(id) === rank).sort(compareIds))
  const offsets = new Map<string, Readonly<{x: number; y: number}>>()
  const placedLayers: Array<Readonly<{rank: number; ids: readonly string[]; crossExtent: number}>> = []
  let primary = 0
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!
    const primaryExtent = Math.max(...layer.map((id) => direction === "RIGHT" ? measured.get(id)!.size.w : measured.get(id)!.size.h))
    let cross = 0
    for (const id of layer) {
      const size = measured.get(id)!.size
      offsets.set(id, direction === "RIGHT" ? {x: primary, y: cross} : {x: cross, y: primary})
      cross += (direction === "RIGHT" ? size.h : size.w) + input.nodeSpacing
    }
    cross = Math.max(0, cross - input.nodeSpacing)
    placedLayers.push({rank: layerNumbers[layerIndex]!, ids: layer, crossExtent: cross})
    const rank = layerNumbers[layerIndex]!
    const corridorRelations = packing.kind === "LAYERED" && packing.reserveCorridors
      ? ranked.relations.filter((relation) =>
        ranks.get(relation.sourceChild)! <= rank && ranks.get(relation.targetChild)! > rank)
      : []
    const countByEndpoint = new Map<string, number>()
    for (const relation of corridorRelations) {
      for (const id of [relation.sourceChild, relation.targetChild]) {
        countByEndpoint.set(id, (countByEndpoint.get(id) ?? 0) + 1)
      }
    }
    const corridorSpacing = corridorRelations.length === 0
      ? input.layerSpacing
      : (Math.max(...countByEndpoint.values()) + 1) * input.clearance
    primary += primaryExtent + Math.max(input.layerSpacing, corridorSpacing)
  }
  primary = Math.max(0, primary - input.layerSpacing)

  if (alignedContainers.has(containerId)) {
    const basePortCross = (childId: string, port: IntrinsicPort): number => {
      const point = offsets.get(childId)!
      const relative = relativePortPoint(childId, port)
      return direction === "RIGHT" ? point.y + relative.y : point.x + relative.x
    }
    const shiftByRank = new Map<number, number>()
    for (const layer of placedLayers) {
      const incoming = ranked.relations.filter((relation) => ranks.get(relation.targetChild) === layer.rank && ranks.get(relation.sourceChild)! < layer.rank)
      if (direction === "RIGHT") {
        const desired = incoming.map((relation) =>
          (shiftByRank.get(ranks.get(relation.sourceChild)!) ?? 0) + basePortCross(relation.sourceChild, relation.sourcePort) - basePortCross(relation.targetChild, relation.targetPort),
        ).sort((left, right) => left - right)
        shiftByRank.set(layer.rank, desired.length === 0 ? 0 : desired[Math.floor((desired.length - 1) / 2)]!)
      } else {
        const required = incoming.map((relation) =>
          (shiftByRank.get(ranks.get(relation.sourceChild)!) ?? 0) + offsets.get(relation.sourceChild)!.x + measured.get(relation.sourceChild)!.size.w - offsets.get(relation.targetChild)!.x + input.clearance * 2,
        )
        shiftByRank.set(layer.rank, Math.max(0, ...required))
      }
    }
    for (const layer of placedLayers) {
      const shift = shiftByRank.get(layer.rank) ?? 0
      for (const id of layer.ids) {
        const point = offsets.get(id)!
        offsets.set(id, direction === "RIGHT" ? {x: point.x, y: point.y + shift} : {x: point.x + shift, y: point.y})
      }
    }
  } else if (direction === "DOWN") {
    const compactCrossExtent = Math.max(...placedLayers.map((layer) => layer.crossExtent))
    for (const layer of placedLayers) {
      if (!layer.ids.some((id) => ranked.backwardSources.has(id))) continue
      const shift = compactCrossExtent - layer.crossExtent
      for (const id of layer.ids) {
        const point = offsets.get(id)!
        offsets.set(id, {x: point.x + shift, y: point.y})
      }
    }
  }
  const crossStarts = childIds.map((id) => direction === "RIGHT" ? offsets.get(id)!.y : offsets.get(id)!.x)
  const crossEnds = childIds.map((id) => (direction === "RIGHT" ? offsets.get(id)!.y + measured.get(id)!.size.h : offsets.get(id)!.x + measured.get(id)!.size.w))
  const crossStart = Math.min(...crossStarts)
  const crossExtent = Math.max(...crossEnds) - crossStart
  if (crossStart !== 0) {
    for (const id of childIds) {
      const point = offsets.get(id)!
      offsets.set(id, direction === "RIGHT" ? {x: point.x, y: point.y - crossStart} : {x: point.x - crossStart, y: point.y})
    }
  }
  const rightSideTracks = containerId === null ? 0 : ranked.relations.filter((relation) => {
    const sourceOffset = offsets.get(relation.sourceChild)!
    const targetOffset = offsets.get(relation.targetChild)!
    const source = relativePortPoint(relation.sourceChild, relation.sourcePort)
    const target = relativePortPoint(relation.targetChild, relation.targetPort)
    return sourceOffset.x + source.x >= targetOffset.x + target.x
  }).length
  const sideReserve = rightSideTracks * input.clearance
  const reservedOffsets = sideReserve === 0
    ? offsets
    : new Map([...offsets].map(([id, point]) => [id, {x: point.x + sideReserve, y: point.y}]))
  return {
    size: direction === "RIGHT"
      ? {w: primary + sideReserve * 2, h: crossExtent + sideReserve}
      : {w: crossExtent + sideReserve * 2, h: primary + sideReserve},
    childOffsets: reservedOffsets,
  }
}

export function choosePortraitRowX(input: Readonly<{
  minimumX: number
  centeredX: number
  maximumX: number
  clearance: number
  relations: readonly Readonly<{sourceEast: number; targetWestOffset: number}>[]
}>): number {
  const candidates = new Set([input.minimumX, input.centeredX, input.maximumX])
  for (const relation of input.relations) {
    const desired = relation.sourceEast + input.clearance * 2 - relation.targetWestOffset
    candidates.add(Math.max(input.minimumX, Math.min(input.maximumX, desired)))
  }
  const score = (candidateX: number): readonly number[] => {
    let backward = 0
    let clearanceDeficit = 0
    let horizontal = 0
    for (const relation of input.relations) {
      const targetWest = candidateX + relation.targetWestOffset
      if (targetWest < relation.sourceEast) backward += 1
      clearanceDeficit += Math.max(0, relation.sourceEast + input.clearance * 2 - targetWest)
      horizontal += Math.abs(targetWest - relation.sourceEast)
    }
    return [
      backward,
      clearanceDeficit,
      horizontal,
      Math.abs(candidateX - input.centeredX),
      candidateX,
    ]
  }
  return [...candidates].sort((left, right) => compareNumberTuples(score(left), score(right)))[0]!
}

function compareNumberTuples(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function rankChildren(
  containerId: string | null,
  childIds: readonly string[],
  edges: readonly RouteEdge[],
  nodeById: ReadonlyMap<string, IntrinsicNode>,
  portById: ReadonlyMap<string, IntrinsicPort>,
): RankResult {
  const childSet = new Set(childIds)
  const directChild = (nodeId: string): string | null => {
    let current = nodeById.get(nodeId)
    while (current !== undefined) {
      const parent = current.parentId ?? null
      if (parent === containerId) return childSet.has(current.id) ? current.id : null
      current = parent === null ? undefined : nodeById.get(parent)
    }
    return null
  }
  const outgoing = new Map(childIds.map((id) => [id, new Set<string>()]))
  const indegree = new Map(childIds.map((id) => [id, 0]))
  const relations: ChildRelation[] = []
  for (const edge of [...edges].sort((a, b) => compareIds(a.id, b.id))) {
    const sourcePort = portById.get(edge.sourcePortId)
    const targetPort = portById.get(edge.targetPortId)
    if (sourcePort === undefined || targetPort === undefined) continue
    const source = directChild(sourcePort.nodeId)
    const target = directChild(targetPort.nodeId)
    if (source === null || target === null || source === target) continue
    relations.push({edgeId: edge.id, sourceChild: source, targetChild: target, sourcePort, targetPort})
    if (outgoing.get(source)!.has(target)) continue
    outgoing.get(source)!.add(target)
    indegree.set(target, indegree.get(target)! + 1)
  }
  const remaining = new Set(childIds)
  const order: string[] = []
  const degree = new Map(childIds.map((id) => [
    id,
    relations.filter((relation) => relation.sourceChild === id || relation.targetChild === id).length,
  ]))
  const compareReady = (left: string, right: string): number =>
    degree.get(right)! - degree.get(left)! || compareIds(left, right)
  const ready = childIds.filter((id) => indegree.get(id) === 0).sort(compareReady)
  while (remaining.size > 0) {
    const id = ready.shift() ?? [...remaining].sort(compareIds)[0]!
    if (!remaining.delete(id)) continue
    order.push(id)
    for (const target of [...outgoing.get(id)!].sort(compareIds)) {
      if (!remaining.has(target)) continue
      indegree.set(target, indegree.get(target)! - 1)
      if (indegree.get(target) === 0) ready.push(target)
    }
    ready.sort(compareReady)
  }
  const position = new Map(order.map((id, index) => [id, index]))
  const rank = new Map(childIds.map((id) => [id, 0]))
  for (const source of order) {
    for (const target of outgoing.get(source)!) {
      if (position.get(source)! >= position.get(target)!) continue
      rank.set(target, Math.max(rank.get(target)!, rank.get(source)! + 1))
    }
  }
  const backwardSources = new Set<string>()
  for (const source of childIds) {
    for (const target of outgoing.get(source)!) {
      if (rank.get(source)! >= rank.get(target)!) backwardSources.add(source)
    }
  }
  return {ranks: rank, order, backwardSources, relations}
}

function validatePlacementInput(input: PlacementInput): void {
  for (const [name, value] of Object.entries({unitsPerPixel: input.unitsPerPixel, clearance: input.clearance, padding: input.padding, nodeSpacing: input.nodeSpacing, layerSpacing: input.layerSpacing, outerPadding: input.outerPadding})) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`)
  }
  if (input.viewport.width <= 0 || input.viewport.height <= 0) throw new Error("viewport must be positive")
  const ids = new Set<string>()
  for (const node of input.nodes) {
    if (ids.has(node.id)) throw new Error(`duplicate node: ${node.id}`)
    if (!Number.isSafeInteger(node.size.w) || !Number.isSafeInteger(node.size.h) || node.size.w <= 0 || node.size.h <= 0) throw new Error(`invalid intrinsic size: ${node.id}`)
    if (!Number.isSafeInteger(node.contentHeight) || node.contentHeight <= 0 || node.contentHeight > node.size.h) throw new Error(`invalid content height: ${node.id}`)
    ids.add(node.id)
  }
  for (const node of input.nodes) if (node.parentId !== undefined && !ids.has(node.parentId)) throw new Error(`unknown parent: ${node.id}/${node.parentId}`)
  for (const port of input.ports) if (!ids.has(port.nodeId) || !Number.isSafeInteger(port.offsetY)) throw new Error(`invalid port: ${port.id}`)
}

export function validatePlacement(
  input: PlacementInput,
  result: Pick<PlacementResult, "direction" | "nodes" | "ports" | "bounds">,
): readonly string[] {
  const violations: string[] = []
  const expectedDirection: RouteDirection = input.viewport.width >= input.viewport.height ? "RIGHT" : "DOWN"
  if (result.direction !== expectedDirection) violations.push(`direction must be ${expectedDirection}`)
  const rects = new Map(result.nodes.map((node) => [node.id, node.rect]))
  const intrinsic = new Map(input.nodes.map((node) => [node.id, node]))
  const parent = new Map(result.nodes.flatMap((node) => node.parentId === undefined ? [] : [[node.id, node.parentId] as const]))
  const isAncestor = (ancestor: string, descendant: string): boolean => {
    let current = parent.get(descendant)
    while (current !== undefined) { if (current === ancestor) return true; current = parent.get(current) }
    return false
  }
  const right = (rect: FixedRect): number => rect.x + rect.w
  const bottom = (rect: FixedRect): number => rect.y + rect.h
  for (const node of result.nodes) {
    if (node.parentId === undefined) {
      if (node.rect.x < result.bounds.x + input.outerPadding || node.rect.y < result.bounds.y + input.outerPadding || right(node.rect) > right(result.bounds) - input.outerPadding || bottom(node.rect) > bottom(result.bounds) - input.outerPadding) violations.push(`top node escapes outer padding: ${node.id}`)
      continue
    }
    const owner = rects.get(node.parentId)
    const ownerIntrinsicHeight = intrinsic.get(node.parentId)?.contentHeight
    if (owner === undefined || ownerIntrinsicHeight === undefined || node.rect.x < owner.x + input.padding || node.rect.y < owner.y + ownerIntrinsicHeight + input.padding || right(node.rect) > right(owner) - input.padding || bottom(node.rect) > bottom(owner) - input.padding) violations.push(`child escapes compound content/padding: ${node.id}`)
  }
  for (let leftIndex = 0; leftIndex < result.nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < result.nodes.length; rightIndex += 1) {
      const leftNode = result.nodes[leftIndex]!
      const rightNode = result.nodes[rightIndex]!
      if (isAncestor(leftNode.id, rightNode.id) || isAncestor(rightNode.id, leftNode.id)) continue
      const horizontalGap = Math.max(rightNode.rect.x - right(leftNode.rect), leftNode.rect.x - right(rightNode.rect))
      const verticalGap = Math.max(rightNode.rect.y - bottom(leftNode.rect), leftNode.rect.y - bottom(rightNode.rect))
      if (horizontalGap < input.nodeSpacing && verticalGap < input.nodeSpacing) violations.push(`unrelated spacing: ${leftNode.id}/${rightNode.id}`)
    }
  }
  for (const port of result.ports) {
    const rect = rects.get(port.nodeId)
    if (rect === undefined) { violations.push(`unknown port node: ${port.id}`); continue }
    const expectedX = port.side === "WEST" ? rect.x : right(rect)
    if (port.center.x !== expectedX || port.center.y < rect.y || port.center.y > bottom(rect)) violations.push(`port attachment: ${port.id}`)
  }
  return violations.sort(compareIds)
}
