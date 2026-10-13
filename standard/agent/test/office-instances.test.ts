import {expect, test} from "bun:test"
import {BoxGeometry, BufferAttribute, BufferGeometry, InstancedMesh, InstancedSkinnedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, Skeleton, SkinnedMesh, Vector3} from "@zavx0z/immersive/engine"
import {createOfficeInstances} from "../office-instances"
import {layoutAgentOffice, type OfficeBounds} from "../office-layout"

const humanoid: OfficeBounds = {min: {x: -240, y: -160, z: -40}, max: {x: 240, y: 160, z: 1760}}
const roomBounds: OfficeBounds = {min: {x: -4500, y: -3500, z: 100}, max: {x: 4500, y: 3500, z: 2700}}
const layout = (count: number) => layoutAgentOffice({roomBounds, humanoid, agents: Array.from({length: count}, (_, index) => ({id: `agent-${index}`, displays: [{id: "screen", width: 900, height: 600, depth: 20}]}))})

function rig() {
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-240, -160, -40, 240, 160, -40, 0, 0, 1760]), 3))
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0]), 3))
  geometry.setAttribute("skinIndex", new BufferAttribute(new Uint16Array(12), 4))
  geometry.setAttribute("skinWeight", new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4))
  const bone = new Object3D()
  const root = new Object3D()
  const material = new MeshLambertMaterial()
  const mesh = new SkinnedMesh(geometry, material, new Skeleton([bone], [new Matrix4()]))
  root.add(bone)
  root.add(mesh)
  root.updateWorldMatrix()
  return {mesh, root, material}
}

function transformedBounds(source: OfficeBounds, matrix: Matrix4) {
  const points: Vector3[] = []
  for (const x of [source.min.x, source.max.x]) for (const y of [source.min.y, source.max.y]) for (const z of [source.min.z, source.max.z]) points.push(new Vector3(x, y, z).applyMatrix4(matrix))
  return {min: {x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), z: Math.min(...points.map(p => p.z))},
    max: {x: Math.max(...points.map(p => p.x)), y: Math.max(...points.map(p => p.y)), z: Math.max(...points.map(p => p.z))}}
}

test("DEFAULT public API создаёт один настоящий skinned batch на primitive и shared device batch без N clones", () => {
  const first = rig(), second = rig()
  const device = new Mesh(new BoxGeometry({width: 2, height: 2, depth: 2}), new MeshLambertMaterial())
  const deviceBounds = {min: {x: -1, y: -1, z: -1}, max: {x: 1, y: 1, z: 1}}
  const initial = layout(20)
  const instances = createOfficeInstances({layout: initial, avatars: [{mesh: first.mesh, transform: new Matrix4()}, {mesh: second.mesh, transform: new Matrix4()}],
    device: {mesh: device, bounds: deviceBounds}, avatarCapacity: 20, deviceCapacity: 20})
  try {
    expect(instances.object().children).toHaveLength(3)
    expect(instances.avatarBatches).toHaveLength(2)
    expect(instances.avatarBatches.every(batch => batch instanceof InstancedSkinnedMesh && batch.count === 20)).toBe(true)
    expect(instances.deviceBatch).toBeInstanceOf(InstancedMesh)
    expect(instances.deviceBatch?.count).toBe(20)
    expect(instances.avatarBatches[0]!.geometry.attributes.position).toBe(first.mesh.geometry.attributes.position)
    expect(first.mesh.geometry.attributes.instanceMatrix).toBeUndefined()
    expect(device.geometry.attributes.instanceMatrix).toBeUndefined()
    const retained = instances.avatarBatches[0]!
    for (const count of [2, 7, 0, 20]) {
      const next = layout(count)
      instances.update(next)
      expect(instances.avatarBatches[0]).toBe(retained)
      expect(instances.object().children).toHaveLength(3)
      expect(retained.count).toBe(count)
      expect(instances.deviceBatch?.count).toBe(count)
      for (let index = 0; index < count; index++) {
        const matrix = new Matrix4()
        retained.getMatrixAt(index, matrix)
        const actual = transformedBounds(humanoid, matrix)
        const expected = next.agents[index]!.bounds
        for (const bound of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const) expect(actual[bound][axis]).toBeCloseTo(expected[bound][axis], 2)
        instances.deviceBatch!.getMatrixAt(index, matrix)
        const screen = transformedBounds(deviceBounds, matrix)
        const expectedScreen = next.agents[index]!.displays[0]!.bounds
        for (const bound of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const) expect(screen[bound][axis]).toBeCloseTo(expectedScreen[bound][axis], 2)
      }
    }
    expect(() => instances.update(layout(21))).toThrow("capacity")
  } finally {instances.dispose()}
  instances.dispose()
  expect(instances.object().children).toEqual([])
  expect(first.mesh.parent).toBe(first.root)
  expect(first.mesh.geometry.attributes.position).toBeDefined()
  expect(first.material.visible).toBe(true)
  expect(() => instances.update(initial)).toThrow("освобождены")
})

test("shared pose по умолчанию и явный независимый pose используют public palette slots", () => {
  const source = rig(), other = rig()
  const instances = createOfficeInstances({layout: layout(2), avatars: [{mesh: source.mesh, transform: new Matrix4()}],
    pose: (id) => id === "agent-1" ? other.mesh : source.mesh})
  try {
    const batch = instances.avatarBatches[0]!
    expect(batch.getPoseAt(0)).toBe(source.mesh)
    expect(batch.getPoseAt(1)).toBe(other.mesh)
    expect(instances.object().children).toHaveLength(1)
  } finally {instances.dispose()}
})
