import {BoxGeometry, Mesh, MeshLambertMaterial, type SkinnedMesh} from "@zavx0z/immersive/engine"
import type {SpatialEdge} from "@zavx0z/immersive/space"
import {createOfficeInstances, type OfficeInstancesLayout} from "@metafor/agent/office-instances"
import {layoutAgentOffice, type OfficeBounds, type OfficeLayout} from "@metafor/agent/office-layout"
import type {AgentOfficeSnapshot} from "./agent-workspace"
import type {Bot} from "./bot"

const capacity = (count: number) => 2 ** Math.ceil(Math.log2(Math.max(32, count)))

/** Public asset adapter: один shared batch на primitive, borrowed Alpha и один shared корпус всех экранов. */
export function prepareOfficeGeometry(office: AgentOfficeSnapshot, bot: Bot) {
  return layoutAgentOffice({roomBounds: office.bounds, humanoid: bot.bounds,
    agents: office.agents.map(agent => ({id: agent.id, displays: [
      {id: "chat", width: 900, height: 600, depth: 20},
      ...agent.atom.getSnapshot().configuration.displays.filter(display => display.id !== "chat")
        .map(display => ({id: display.id, width: 900, height: 600, depth: 20})),
    ]}))})
}

/** Root owns rendering; this adapter owns only its batches, and never creates an independent scene or frame loop. */
export function createOfficeGeometry(layout: OfficeLayout, bot: Bot) {
  const material = new MeshLambertMaterial()
  material.color.setHex(0x263847)
  const mesh = new Mesh(new BoxGeometry({width: 2, height: 2, depth: 2}), material)
  return createOfficeInstances({layout, avatars: bot.primitives,
    device: {mesh, bounds: {min: {x: -1, y: -1, z: -1}, max: {x: 1, y: 1, z: 1}}},
    avatarCapacity: capacity(layout.agents.length),
    deviceCapacity: capacity(layout.agents.reduce((sum, agent) => sum + agent.displays.length, 0)),
  })
}

/** Офис уже размещён своим владельцем; position — мировой перенос без новой layout-семантики. */
export type OfficeSceneRoom = Readonly<{id: string; layout: OfficeLayout; position: Readonly<{x: number; y: number; z: number}>}>
/** Derived native instance key остаётся связанным с точными локальными identity. */
export type OfficeSceneIdentity = Readonly<{id: string; officeId: string; agentId: string}>

/** Объединяет готовые локальные placements, сохраняя общий fit каждой комнаты и порядок участников. */
export function flattenOfficeSceneGeometry(rooms: readonly OfficeSceneRoom[]): OfficeInstancesLayout & {identities: readonly OfficeSceneIdentity[]} {
  const ids = new Set<string>(), agents: OfficeLayout["agents"] = [], identities: OfficeSceneIdentity[] = []
  for (const room of rooms) {
    if (!room.id || ids.has(room.id) || !Object.values(room.position).every(Number.isFinite)) throw new Error("Office scene requires unique offices and finite positions")
    ids.add(room.id)
    const local = new Set<string>()
    const point = (value: Readonly<{x: number; y: number; z: number}>) => ({x: value.x + room.position.x, y: value.y + room.position.y, z: value.z + room.position.z})
    const bounds = (value: OfficeBounds) => ({min: point(value.min), max: point(value.max)})
    for (const agent of room.layout.agents) {
      if (!agent.id || local.has(agent.id)) throw new Error("Office scene requires unique local Agent identity")
      local.add(agent.id)
      const id = JSON.stringify([room.id, agent.id])
      identities.push({id, officeId: room.id, agentId: agent.id})
      agents.push({...agent, id, position: point(agent.position), head: point(agent.head), bounds: bounds(agent.bounds), workplaceBounds: bounds(agent.workplaceBounds),
        displays: agent.displays.map(display => ({...display, position: point(display.position), bounds: bounds(display.bounds)}))})
    }
  }
  return {agents, identities}
}

/**
 * Один глобальный asset для всех объявленных офисов в существующем Space.
 * Переводит только готовые world placements в public instance batches: один
 * skinned batch на primitive и один device batch независимо от числа комнат.
 * Asset размещается в Space origin; локальные Room/Display остаются у composition.
 * Update сохраняет batches в заданной capacity, источники и poses заимствуются.
 * @see ../README.md; office-geometry.spec.ts.
 */
export function createOfficeSceneGeometry(rooms: readonly OfficeSceneRoom[], bot: Bot, options: Readonly<{
  avatarCapacity?: number
  deviceCapacity?: number
  pose?(officeId: string, agentId: string, primitive: number): SkinnedMesh
}> = {}) {
  let prepared = flattenOfficeSceneGeometry(rooms)
  let identities = new Map(prepared.identities.map(value => [value.id, value]))
  const avatarCapacity = options.avatarCapacity ?? capacity(prepared.agents.length)
  const deviceCapacity = options.deviceCapacity ?? capacity(prepared.agents.reduce((sum, agent) => sum + agent.displays.length, 0))
  const material = new MeshLambertMaterial()
  material.color.setHex(0x263847)
  const mesh = new Mesh(new BoxGeometry({width: 2, height: 2, depth: 2}), material)
  const instances = createOfficeInstances({layout: prepared, avatars: bot.primitives,
    device: {mesh, bounds: {min: {x: -1, y: -1, z: -1}, max: {x: 1, y: 1, z: 1}}}, avatarCapacity, deviceCapacity,
    ...(options.pose ? {pose: (id: string, primitive: number) => {const identity = identities.get(id)!; return options.pose!(identity.officeId, identity.agentId, primitive)}} : {}),
  })
  let disposed = false
  return {
    object: instances.object,
    avatarBatches: instances.avatarBatches,
    deviceBatch: instances.deviceBatch,
    get identities() {return prepared.identities},
    update(next: readonly OfficeSceneRoom[]) {
      if (disposed) throw new Error("Office scene instances are disposed")
      const value = flattenOfficeSceneGeometry(next)
      if (value.agents.length > avatarCapacity || value.agents.reduce((sum, agent) => sum + agent.displays.length, 0) > deviceCapacity) throw new RangeError("Office scene instances exceed assigned capacity")
      identities = new Map(value.identities.map(identity => [identity.id, identity]))
      instances.update(value)
      prepared = value
    },
    dispose() {if (disposed) return; disposed = true; instances.dispose(); identities.clear()},
  }
}

/** Prism outline and ownership edges are local to the fixed owning Atom office. */
export function officeEdges(layout: OfficeLayout): readonly SpatialEdge[] {
  const {min, max} = layout.bounds
  const points = [
    {x: min.x, y: min.y, z: min.z}, {x: max.x, y: min.y, z: min.z},
    {x: max.x, y: max.y, z: min.z}, {x: min.x, y: max.y, z: min.z},
    {x: min.x, y: min.y, z: max.z}, {x: max.x, y: min.y, z: max.z},
    {x: max.x, y: max.y, z: max.z}, {x: min.x, y: max.y, z: max.z},
  ]
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const
  return [...pairs.map(([a, b], index) => ({id: `room-edge-${index}`, color: 0x6c8fa8,
    route: {kind: "polyline" as const, points: [points[a]!, points[b]!]}})), ...layout.edges]
}
