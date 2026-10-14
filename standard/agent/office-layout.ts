import type {SpatialEdge} from "@zavx0z/immersive/space"

/** Физические размеры в мм локального пространства owning Atom. */
export type OfficeSize = Readonly<{width: number; depth: number; height: number}>
/** Заданный Atom/Display bounding box; layout сохраняет его буквально. */
export type OfficeBounds = Readonly<{min: Readonly<{x: number; y: number; z: number}>; max: Readonly<{x: number; y: number; z: number}>}>
/** Собственные физические размеры устройства до общего fit scale. */
export type OfficeDisplay = Readonly<{id: string; width: number; height: number; depth?: number}>
/** Один declared Agent и его устройства; humanoid уточняет bounds подготовленного варианта персонажа. */
export type OfficeAgent = Readonly<{id: string; displays: readonly OfficeDisplay[]; humanoid?: OfficeBounds}>
export type OfficeWall = "north" | "south" | "east" | "west"

/**
Офис всегда получает explicit roomBounds. Размер не вычисляется из N участников.
Humanoid bounds принадлежат общему исходному asset; placements выражены локально
относительно офиса, поворот вокруг +Z задан в радианах.
`humanoid` может быть общим envelope вариантов; `agents[].humanoid` выбирает точные
bounds экземпляра. Подготовленный персонаж смотрит вдоль локальной +Y.
*/
export type OfficeLayoutInput = Readonly<{
  roomBounds: OfficeBounds
  agents: readonly OfficeAgent[]
  humanoid: OfficeBounds
  /** Выбранный Display над головой; его полный поворот к камере резервируется сферическим envelope.
  Без опции сохраняется размещение всех устройств у стены. Avatar в этом режиме смотрит из своего места в центр комнаты. */
  overheadDisplayId?: string
  wallInset?: number
  verticalClearance?: number
  workplaceGap?: number
  displayGap?: number
  aisle?: number
}>

const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} должен быть конечным положительным размером`)
  return value
}
const sizeOf = (bounds: OfficeBounds, label: string): OfficeSize => {
  for (const point of [bounds.min, bounds.max]) for (const value of Object.values(point)) {
    if (!Number.isFinite(value)) throw new RangeError(`${label} bounds должны быть конечными`)
  }
  return {width: positive(bounds.max.x - bounds.min.x, `${label} width`),
    depth: positive(bounds.max.y - bounds.min.y, `${label} depth`), height: positive(bounds.max.z - bounds.min.z, `${label} height`)}
}

/**
Располагает [рабочие места Agent](./README.md) вдоль стен неизменного prism.
Собственные ширины рабочих мест участвуют в flex distribution; свободная длина
распределяется space-evenly поверх общего gap. North/south используют полную
длину, боковые стены уступают фактическую scaled глубину занятых north/south.
Общий shrink появляется только при overflow линейных width/depth/height constraints.
Prefix assignment сохраняет невозрастание scale при добавлении одинаковых мест. Один scale
применяется к каждому avatar и всем его devices. Bounding boxes рабочих мест
не пересекаются внутренностями, исходные размеры и roomBounds не изменяются.
Edges показывают принадлежность экранов, не transport и не Force.
В режиме overheadDisplayId общий fit включает полный объём поворота надголовного
Display. Результат billboard сообщает намерение представлению; layout не вращает
экран вслед за камерой и не управляет её lifecycle.
Инварианты — [office tests](./test/office-layout.test.ts).
*/
export function layoutAgentOffice(input: OfficeLayoutInput) {
  const room = input.roomBounds
  const size = sizeOf(room, "Office")
  sizeOf(input.humanoid, "Humanoid")
  const overheadMode = input.overheadDisplayId !== undefined
  if (overheadMode && !input.overheadDisplayId!.trim()) throw new TypeError("Overhead display требует непустую identity")
  const shortest = Math.min(size.width, size.depth)
  const inset = positive(input.wallInset ?? Math.min(40, shortest / 100), "Wall inset")
  const vertical = positive(input.verticalClearance ?? Math.min(80, size.height / 30), "Vertical clearance")
  const gap = positive(input.workplaceGap ?? 120, "Workplace gap")
  const displayGap = positive(input.displayGap ?? 120, "Display gap")
  const aisle = positive(input.aisle ?? 700, "Workplace aisle")
  if (inset * 2 >= shortest || vertical * 2 >= size.height) throw new RangeError("Office clearances не оставляют места для участников")
  const ids = new Set<string>()
  const agents = input.agents.map(agent => {
    if (!agent.id.trim() || ids.has(agent.id)) throw new TypeError("Office Agent требует уникальную identity")
    ids.add(agent.id)
    const humanoid = agent.humanoid ?? input.humanoid
    const body = sizeOf(humanoid, "Humanoid")
    const overhead = agent.displays.find(display => display.id === input.overheadDisplayId)
    const overheadRadius = overhead ? Math.hypot(positive(overhead.width, "Display width"), positive(overhead.height, "Display height"),
      positive(overhead.depth ?? 10, "Display depth")) / 2 : 0
    const bodyRadius = overheadMode ? Math.hypot(body.width, body.depth) / 2 : body.depth / 2
    const displays = new Set<string>()
    let wallWidth = 0, tallest = 0, thickest = 0
    for (const display of agent.displays) {
      if (!display.id.trim() || displays.has(display.id)) throw new TypeError("Office display требует уникальную identity в своём Agent")
      displays.add(display.id)
      if (display === overhead) continue
      wallWidth += positive(display.width, "Display width")
      tallest = Math.max(tallest, positive(display.height, "Display height"))
      thickest = Math.max(thickest, positive(display.depth ?? 10, "Display depth"))
    }
    const wallCount = agent.displays.length - (overhead ? 1 : 0)
    wallWidth += Math.max(0, wallCount - 1) * displayGap
    const screenZ = Math.max(body.height, tallest / 2 + gap)
    const bodyY = Math.max(thickest + aisle + bodyRadius, overheadRadius)
    const overheadZ = body.height + displayGap + overheadRadius
    return {agent, humanoid, body, bodyY, overhead, overheadRadius, overheadZ, wallWidth, thickest, screenZ,
      width: positive(Math.max(overheadMode ? bodyRadius * 2 : body.width, wallWidth, overheadRadius * 2), "Workplace width"),
      depth: positive(Math.max(thickest + aisle + bodyRadius * 2, bodyY + overheadRadius), "Workplace depth"),
      height: positive(Math.max(body.height, wallCount ? screenZ + Math.max(tallest / 2, 40) : 0,
        overhead ? overheadZ + Math.max(overheadRadius, 40) : 0), "Workplace height")}
  }).sort((a, b) => a.agent.id < b.agent.id ? -1 : a.agent.id > b.agent.id ? 1 : 0)
  const walls: readonly OfficeWall[] = ["north", "south", "east", "west"]
  const lengths: Record<OfficeWall, number> = {north: size.width - 2 * inset, south: size.width - 2 * inset,
    east: size.depth - 2 * inset, west: size.depth - 2 * inset}
  type WallStats = {count: number; width: number; depth: number; height: number}
  type Statistics = Record<OfficeWall, WallStats>
  let statistics: Statistics = {north: {count: 0, width: 0, depth: 0, height: 0}, south: {count: 0, width: 0, depth: 0, height: 0},
    east: {count: 0, width: 0, depth: 0, height: 0}, west: {count: 0, width: 0, depth: 0, height: 0}}
  const usedWidth = (stats: WallStats) => stats.width + Math.max(0, stats.count - 1) * gap
  const guards = (stats: Statistics) => ({start: stats.south.count ? stats.south.depth + gap : 0,
    end: stats.north.count ? stats.north.depth + gap : 0})
  const fit = (stats: Statistics) => {
    let result = 1
    const reserve = guards(stats)
    for (const wall of walls) if (stats[wall].count > 0) {
      const required = usedWidth(stats[wall]) + (wall === "east" || wall === "west" ? reserve.start + reserve.end : 0)
      positive(required, "Wall flex width")
      result = Math.min(result, lengths[wall] / required, (size.height - 2 * vertical) / stats[wall].height)
    }
    const opposing = (a: OfficeWall, b: OfficeWall, length: number) => {
      const required = stats[a].depth + stats[b].depth + (stats[a].count && stats[b].count ? gap : 0)
      return required ? length / required : 1
    }
    return Math.min(result, opposing("north", "south", lengths.east), opposing("east", "west", lengths.north))
  }
  const assignment = agents.map(agent => {
    let selected = walls[0]!
    let best: Statistics | undefined
    let bestFit = -1, bestRatio = Infinity
    for (const wall of walls) {
      const old = statistics[wall]
      const candidate: Statistics = {...statistics, [wall]: {count: old.count + 1, width: positive(old.width + agent.width, "Wall widths"),
        depth: Math.max(old.depth, agent.depth), height: Math.max(old.height, agent.height)}}
      const candidateFit = fit(candidate)
      const reserve = guards(candidate)
      const ratio = (usedWidth(candidate[wall]) + (wall === "east" || wall === "west" ? reserve.start + reserve.end : 0)) / lengths[wall]
      if (candidateFit > bestFit || candidateFit === bestFit && ratio < bestRatio) {
        selected = wall
        best = candidate
        bestFit = candidateFit
        bestRatio = ratio
      }
    }
    statistics = best!
    return selected
  })
  const scale = fit(statistics)
  positive(scale, "Office scale")
  const reserved = guards(statistics)
  const distribution = Object.fromEntries(walls.map(wall => {
    const side = wall === "east" || wall === "west"
    const guardStart = side ? reserved.start * scale : 0
    const guardEnd = side ? reserved.end * scale : 0
    const available = Math.max(0, lengths[wall] - guardStart - guardEnd)
    const free = Math.max(0, available - usedWidth(statistics[wall]) * scale)
    const outerGap = free / (statistics[wall].count + 1)
    return [wall, {wall, count: statistics[wall].count, available, guardStart, guardEnd,
      outerGap, betweenGap: gap * scale + outerGap, occupiedWidth: statistics[wall].width * scale}]
  })) as Record<OfficeWall, {wall: OfficeWall; count: number; available: number; guardStart: number; guardEnd: number; outerGap: number; betweenGap: number; occupiedWidth: number}>
  const cursors = Object.fromEntries(walls.map(wall => [wall, inset + distribution[wall].guardStart + distribution[wall].outerGap])) as Record<OfficeWall, number>
  const slots: Record<OfficeWall, number> = {north: 0, south: 0, east: 0, west: 0}
  const placed = agents.map((value, index) => {
    const wall = assignment[index]!
    const slot = slots[wall]++
    const along = cursors[wall] + value.width * scale / 2
    cursors[wall] += value.width * scale + distribution[wall].betweenGap
    const anchor = wall === "north" ? {x: room.min.x + along, y: room.max.y - inset}
      : wall === "south" ? {x: room.min.x + along, y: room.min.y + inset}
      : wall === "east" ? {x: room.max.x - inset, y: room.min.y + along}
      : {x: room.min.x + inset, y: room.min.y + along}
    const wallRotationZ = wall === "north" ? Math.PI : wall === "south" ? 0 : wall === "east" ? Math.PI / 2 : -Math.PI / 2
    const point = ({x, y, z}: Readonly<{x: number; y: number; z: number}>) => ({
      x: anchor.x + scale * (wall === "north" ? -x : wall === "south" ? x : wall === "east" ? -y : y),
      y: anchor.y + scale * (wall === "north" ? -y : wall === "south" ? y : wall === "east" ? x : -x),
      z: room.min.z + vertical + z * scale,
    })
    const bounds = (min: Readonly<{x: number; y: number; z: number}>, max: Readonly<{x: number; y: number; z: number}>): OfficeBounds => {
      const a = point(min), b = point(max)
      return {min: {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z)},
        max: {x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z)}}
    }
    const {body, bodyY, humanoid} = value
    const bodyCenter = point({x: 0, y: bodyY, z: 0})
    const rotationZ = overheadMode ? Math.atan2((room.min.y + room.max.y) / 2 - bodyCenter.y,
      (room.min.x + room.max.x) / 2 - bodyCenter.x) - Math.PI / 2 : wallRotationZ
    let cursor = -value.wallWidth / 2
    const displays = value.agent.displays.map(display => {
      const depth = display.depth ?? 10
      if (display === value.overhead) {
        const radius = value.overheadRadius
        return {id: display.id, scale, rotationZ: wallRotationZ, billboard: true,
          sourceSize: {width: display.width, height: display.height, depth},
          width: display.width * scale, height: display.height * scale, depth: depth * scale,
          position: point({x: 0, y: bodyY, z: value.overheadZ}),
          bounds: bounds({x: -radius, y: bodyY - radius, z: value.overheadZ - radius},
            {x: radius, y: bodyY + radius, z: value.overheadZ + radius})}
      }
      const x = cursor + display.width / 2
      cursor += display.width + displayGap
      return {id: display.id, scale, rotationZ: wallRotationZ, ...(overheadMode ? {billboard: false} : {}), sourceSize: {width: display.width, height: display.height, depth},
        width: display.width * scale, height: display.height * scale, depth: depth * scale,
        position: point({x, y: depth / 2, z: value.screenZ}),
        bounds: bounds({x: x - display.width / 2, y: 0, z: value.screenZ - display.height / 2},
          {x: x + display.width / 2, y: depth, z: value.screenZ + display.height / 2})}
    })
    const cosine = Math.cos(rotationZ), sine = Math.sin(rotationZ)
    const halfWidth = scale * (Math.abs(cosine) * body.width + Math.abs(sine) * body.depth) / 2
    const halfDepth = scale * (Math.abs(sine) * body.width + Math.abs(cosine) * body.depth) / 2
    const localCenter = {x: humanoid.min.x + body.width / 2, y: humanoid.min.y + body.depth / 2}
    return {id: value.agent.id, wall, slot, scale, rotationZ,
      position: overheadMode ? {x: bodyCenter.x - scale * (localCenter.x * cosine - localCenter.y * sine),
        y: bodyCenter.y - scale * (localCenter.x * sine + localCenter.y * cosine), z: bodyCenter.z - humanoid.min.z * scale}
        : point({x: -localCenter.x, y: bodyY - localCenter.y, z: -humanoid.min.z}),
      bounds: overheadMode ? {min: {x: bodyCenter.x - halfWidth, y: bodyCenter.y - halfDepth, z: bodyCenter.z},
        max: {x: bodyCenter.x + halfWidth, y: bodyCenter.y + halfDepth, z: bodyCenter.z + body.height * scale}}
        : bounds({x: -body.width / 2, y: bodyY - body.depth / 2, z: 0}, {x: body.width / 2, y: bodyY + body.depth / 2, z: body.height}),
      workplaceBounds: bounds({x: -value.width / 2, y: 0, z: 0}, {x: value.width / 2, y: value.depth, z: value.height}),
      head: point({x: 0, y: bodyY, z: body.height}), displays}
  })
  const edges: SpatialEdge[] = placed.flatMap(agent => agent.displays.map(display => {
    const from = agent.head, to = display.position
    const lift = Math.max(from.z, to.z) + 40 * scale
    return {id: `office:${encodeURIComponent(agent.id)}:display:${encodeURIComponent(display.id)}`, route: {kind: "cubic" as const, segments: 32,
      points: [from, {x: from.x, y: (from.y + to.y) / 2, z: lift}, {x: to.x, y: (from.y + to.y) / 2, z: lift}, to] as const}}
  }))
  return {kind: "prism" as const, size, scale, sharedGap: gap * scale, wallInset: inset, walls: distribution, agents: placed, edges,
    bounds: {min: {...room.min}, max: {...room.max}}}
}

/** Результат placement для shared-asset instancing adapter без второго layout pass. */
export type OfficeLayout = ReturnType<typeof layoutAgentOffice>
