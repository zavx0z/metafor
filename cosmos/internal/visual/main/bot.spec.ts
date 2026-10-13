import {expect, test} from "bun:test"
import {Matrix4, Vector3} from "@zavx0z/immersive/engine"
import {createOfficeInstances} from "@metafor/agent/office-instances"
import {layoutAgentOffice} from "@metafor/agent/office-layout"
import {loadBot} from "./bot"

test("реальный skinned Alpha целиком помещается в офис вместе с устройствами после общего fit", async () => {
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  const bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
  const height = bot.bounds.max.z - bot.bounds.min.z
  expect(height).toBeGreaterThan(1700)
  expect(height).toBeLessThan(1900)
  const room = {min: {x: -195, y: -422, z: 0}, max: {x: 195, y: 422, z: 180}}
  for (const count of [1, 4, 12]) {
    const layout = layoutAgentOffice({roomBounds: room, humanoid: bot.bounds,
      agents: Array.from({length: count}, (_, id) => ({id: `agent-${id}`, displays: [
        {id: "chat", width: 900, height: 600, depth: 20}, {id: "device", width: 900, height: 600, depth: 20},
      ]}))})
    const instances = createOfficeInstances({layout, avatars: bot.primitives})
    try {
      for (const batch of instances.avatarBatches) batch.updatePoseMatrices()
      for (let index = 0; index < count; index++) {
        const min = {x: Infinity, y: Infinity, z: Infinity}, max = {x: -Infinity, y: -Infinity, z: -Infinity}
        for (const batch of instances.avatarBatches) {
          const {position, skinIndex, skinWeight} = batch.geometry.attributes
          const placement = new Matrix4(); batch.getMatrixAt(index, placement)
          const palette = Array.from({length: batch.boneCount}, (_, bone) => {
            const matrix = new Matrix4(), offset = (index * batch.boneCount + bone) * 16
            for (let element = 0; element < 16; element++) matrix.elements[element] = batch.instanceBones[offset + element]!
            return matrix
          })
          const source = new Vector3(), weighted = new Vector3(), vertex = new Vector3()
          for (let point = 0; point < position!.count; point++) {
            source.set(position!.array[point * 3]!, position!.array[point * 3 + 1]!, position!.array[point * 3 + 2]!)
            vertex.set(0, 0, 0)
            for (let influence = 0; influence < 4; influence++) {
              const offset = point * 4 + influence, weight = skinWeight!.array[offset]!
              if (weight) vertex.add(weighted.copy(source).applyMatrix4(palette[skinIndex!.array[offset]!]!).multiplyScalar(weight))
            }
            vertex.applyMatrix4(placement)
            for (const axis of ["x", "y", "z"] as const) {
              min[axis] = Math.min(min[axis], vertex[axis]); max[axis] = Math.max(max[axis], vertex[axis])
            }
          }
        }
        const expected = layout.agents[index]!.bounds
        for (const axis of ["x", "y", "z"] as const) {
          expect(min[axis]).toBeGreaterThanOrEqual(room.min[axis] - .002)
          expect(max[axis]).toBeLessThanOrEqual(room.max[axis] + .002)
          expect(min[axis]).toBeCloseTo(expected.min[axis], 2)
          expect(max[axis]).toBeCloseTo(expected.max[axis], 2)
        }
        for (const device of layout.agents[index]!.displays) {
          expect(device.scale).toBe(layout.scale)
          for (const axis of ["x", "y", "z"] as const) {
            expect(device.bounds.min[axis]).toBeGreaterThanOrEqual(room.min[axis])
            expect(device.bounds.max[axis]).toBeLessThanOrEqual(room.max[axis])
          }
        }
      }
    } finally {instances.dispose()}
  }
})
