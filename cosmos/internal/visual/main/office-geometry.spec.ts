import {beforeAll, expect, test} from "bun:test"
import {InstancedMesh, InstancedSkinnedMesh, Matrix4, Vector3} from "@zavx0z/immersive/engine"
import {layoutAgentOffice, type OfficeBounds} from "@metafor/agent/office-layout"
import {createOfficeSceneGeometry, flattenOfficeSceneGeometry, type OfficeSceneRoom} from "./office-geometry"
import {loadBot, type Bot} from "./bot"

let bot: Bot
beforeAll(async () => {
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
})
function rooms(count: number): OfficeSceneRoom[] {
  return Array.from({length: count}, (_, index) => ({id: `office-${index}`,
    position: {x: 1100 * (index % 3), y: -900 * Math.floor(index / 3), z: 600 * index + 50},
    layout: layoutAgentOffice({roomBounds: {min: {x: -300, y: -200, z: 0}, max: {x: 300, y: 200, z: 180}}, humanoid: bot.bounds,
      agents: ["assistant", "reviewer"].map(id => ({id, displays: [{id: "chat", width: 900, height: 600, depth: 20}, {id: "context", width: 900, height: 600, depth: 20}]}))}),
  }))
}
const translate = (value: {x: number; y: number; z: number}, by: {x: number; y: number; z: number}) => ({x: value.x + by.x, y: value.y + by.y, z: value.z + by.z})
function deviceBounds(matrix: Matrix4): OfficeBounds {
  const points: Vector3[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new Vector3(x, y, z).applyMatrix4(matrix))
  return {min: {x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), z: Math.min(...points.map(p => p.z))},
    max: {x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)), z: Math.max(...points.map(p => p.z))}}
}

test("all rooms flatten existing local identities and fit scales without mutating placements", () => {
  const input = rooms(3), before = structuredClone(input), flat = flattenOfficeSceneGeometry(input)
  expect(flat.agents).toHaveLength(6)
  expect(new Set(flat.agents.map(agent => agent.id)).size).toBe(6)
  expect(flat.identities[2]).toEqual({id: '["office-1","assistant"]', officeId: "office-1", agentId: "assistant"})
  for (const [index, room] of input.entries()) for (const [local, agent] of room.layout.agents.entries()) {
    const world = flat.agents[index * 2 + local]!
    expect(world.position).toEqual(translate(agent.position, room.position))
    expect(world.head).toEqual(translate(agent.head, room.position))
    expect(world.scale).toBe(room.layout.scale)
    expect(world.rotationZ).toBe(agent.rotationZ)
    expect(world.displays.map(display => display.scale)).toEqual(agent.displays.map(display => display.scale))
  }
  expect(input).toEqual(before)
  expect(() => flattenOfficeSceneGeometry([input[0]!, input[0]!])).toThrow("unique offices")
  expect(() => flattenOfficeSceneGeometry([{...input[0]!, position: {x: NaN, y: 0, z: 0}}])).toThrow("finite positions")
})

test("N rooms retain one public batch per primitive and one device batch with actual posed world vertices and device bounds", () => {
  const input = rooms(9), poseCalls: string[] = []
  const instances = createOfficeSceneGeometry(input.slice(0, 2), bot, {avatarCapacity: 32, deviceCapacity: 64,
    pose(office, agent, primitive) {poseCalls.push(JSON.stringify([office, agent, primitive])); return bot.primitives[primitive]!.mesh},
  })
  const native = instances.object(), batches = [...native.children]
  try {
    expect(native.children).toHaveLength(bot.primitives.length + 1)
    expect(instances.avatarBatches.every(batch => batch instanceof InstancedSkinnedMesh)).toBeTrue()
    expect(instances.deviceBatch).toBeInstanceOf(InstancedMesh)
    for (const count of [9, 1, 0, 6]) {
      const current = input.slice(0, count).toReversed()
      instances.update(current)
      expect(instances.object()).toBe(native)
      expect(native.children).toEqual(batches)
      expect(instances.avatarBatches.every(batch => batch.count === count * 2)).toBeTrue()
      expect(instances.deviceBatch!.count).toBe(count * 4)
      let slot = 0, deviceSlot = 0
      for (const room of current) for (const agent of room.layout.agents) {
        expect(instances.identities[slot]).toMatchObject({officeId: room.id, agentId: agent.id})
        for (const [primitiveIndex, primitive] of bot.primitives.entries()) {
          const batch = instances.avatarBatches[primitiveIndex]!, pose = batch.getPoseAt(slot)
          expect(pose).toBe(primitive.mesh)
          const inverse = new Matrix4().copy(pose.matrixWorld).invert()
          const palette = pose.skeleton.bones.map((bone, index) => new Matrix4().multiplyMatrices(inverse, bone.matrixWorld).multiply(pose.skeleton.boneInverses[index]!))
          const positions = pose.geometry.attributes.position!, joints = pose.geometry.attributes.skinIndex!, weights = pose.geometry.attributes.skinWeight!
          const matrix = new Matrix4(); batch.getMatrixAt(slot, matrix)
          for (const vertex of [0, Math.floor(positions.count / 2), positions.count - 1]) {
            const point = new Vector3(positions.array[vertex * 3]!, positions.array[vertex * 3 + 1]!, positions.array[vertex * 3 + 2]!), posed = new Vector3()
            for (let influence = 0; influence < 4; influence++) {
              const offset = vertex * 4 + influence, weight = weights.array[offset]!
              if (weight) posed.add(new Vector3().copy(point).applyMatrix4(palette[joints.array[offset]!]!).multiplyScalar(weight))
            }
            const actual = new Vector3().copy(posed).applyMatrix4(matrix), authored = posed.applyMatrix4(primitive.transform)
            const c = Math.cos(agent.rotationZ), s = Math.sin(agent.rotationZ)
            const expected = {x: (authored.x * c - authored.y * s) * agent.scale + agent.position.x + room.position.x,
              y: (authored.x * s + authored.y * c) * agent.scale + agent.position.y + room.position.y,
              z: authored.z * agent.scale + agent.position.z + room.position.z}
            for (const axis of ["x", "y", "z"] as const) expect(actual[axis]).toBeCloseTo(expected[axis], 2)
          }
        }
        for (const display of agent.displays) {
          const matrix = new Matrix4(); instances.deviceBatch!.getMatrixAt(deviceSlot++, matrix)
          const bounds = deviceBounds(matrix)
          for (const bound of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const)
            expect(bounds[bound][axis]).toBeCloseTo(display.bounds[bound][axis] + room.position[axis], 2)
        }
        slot++
      }
    }
    expect(poseCalls).toContain(JSON.stringify(["office-8", "assistant", 0]))
    const retained = instances.identities
    expect(() => instances.update(rooms(17))).toThrow("capacity")
    expect(instances.identities).toBe(retained)
  } finally {instances.dispose()}
  instances.dispose()
  expect(native.children).toEqual([])
  expect(bot.primitives.every(primitive => primitive.mesh.geometry.attributes.position !== undefined)).toBeTrue()
  expect(() => instances.update(input)).toThrow("disposed")
})
