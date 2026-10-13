import {BufferGeometry, InstancedMesh, InstancedSkinnedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Object3D, Quaternion, Vector3, type Mesh, type SkinnedMesh} from "@zavx0z/immersive/engine"
import type {OfficeBounds, OfficeLayout} from "./office-layout"

/** Один общий skinned primitive. Transform — явная authored asset-local матрица primitive, не world position офиса. */
export type OfficeAvatarPrimitive = Readonly<{mesh: SkinnedMesh; transform: Matrix4}>
/** Общая геометрия тела экрана; bounds заданы в её vertex-local координатах. DOM Display монтируется отдельно в том же Document. */
export type OfficeDevicePrimitive = Readonly<{mesh: Mesh; bounds: OfficeBounds}>
/** Готовые placements одного либо нескольких офисов; повторная layout-операция не требуется. */
export type OfficeInstancesLayout = Pick<OfficeLayout, "agents">
/** Fixed capacity позволяет менять count без N clones и без скрытой пересборки buffers. */
export type OfficeInstancesInput = Readonly<{
  layout: OfficeInstancesLayout
  avatars: readonly OfficeAvatarPrimitive[]
  device?: OfficeDevicePrimitive
  avatarCapacity?: number
  deviceCapacity?: number
  /** Необязательные live poses; rigs и AnimationMixers остаются у владельца asset/frame lifecycle. */
  pose?(agentId: string, primitive: number): SkinnedMesh
}>

const capacity = (value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new RangeError("Office instance capacity должна быть целым неотрицательным числом")
  return value
}
const material = (mesh: Mesh) => {
  if (Array.isArray(mesh.material) || !(mesh.material instanceof MeshBasicMaterial || mesh.material instanceof MeshLambertMaterial)) {
    throw new TypeError("Office instance batch требует один публичный Basic/Lambert material")
  }
  return mesh.material
}

/**
Связывает [локальную office placement](./README.md) с настоящими public Engine
instance batches. Один InstancedSkinnedMesh на shared avatar primitive, один
InstancedMesh на shared device body; число native objects не зависит от N.
Geometry vertex/index attributes и materials источников заимствуются, собственные
instance attributes принадлежат adapter. Один общий fit scale включён в каждую
матрицу, authored размеры разных devices применяются до fit.

`object()` является public factory для `<xr-asset>` принимающего Document/Space.
Adapter не создаёт Canvas, Renderer или frame loop. Update сохраняет batches до
fixed capacity, превышение явно отклоняет. После update host invalidates свой
существующий Root либо использует его существующий frame lifecycle. Dispose выключает и отсоединяет только
свои batches, не освобождая shared sources/poses; GPU resources принадлежат Root
renderer и его asset lifecycle. Сценарии — [instance tests](./test/office-instances.test.ts).
*/
export function createOfficeInstances(input: OfficeInstancesInput) {
  const avatarCapacity = capacity(input.avatarCapacity ?? input.layout.agents.length)
  const deviceCount = (layout: OfficeInstancesLayout) => layout.agents.reduce((sum, agent) => sum + agent.displays.length, 0)
  const deviceCapacity = capacity(input.deviceCapacity ?? deviceCount(input.layout))
  if (input.layout.agents.length > avatarCapacity || input.device !== undefined && deviceCount(input.layout) > deviceCapacity) throw new RangeError("Office instances превышают выданную capacity")
  if (input.avatars.length === 0) throw new TypeError("Office avatar требует хотя бы один shared primitive")
  const sourceTransforms = input.avatars.map(primitive => new Matrix4().copy(primitive.transform))
  const avatarBatches = input.avatars.map(primitive => {
    material(primitive.mesh)
    return new InstancedSkinnedMesh(primitive.mesh, avatarCapacity)
  })
  let deviceBatch: InstancedMesh | undefined
  let deviceSize: {width: number; depth: number; height: number} | undefined
  if (input.device !== undefined) {
    const source = input.device
    const dimensions = {width: source.bounds.max.x - source.bounds.min.x, depth: source.bounds.max.y - source.bounds.min.y, height: source.bounds.max.z - source.bounds.min.z}
    if (Object.values(dimensions).some(value => !Number.isFinite(value) || value <= 0)) throw new RangeError("Shared device geometry требует конечный bounding box")
    const geometry = new BufferGeometry()
    geometry.attributes = {...source.mesh.geometry.attributes}
    geometry.index = source.mesh.geometry.index
    deviceBatch = new InstancedMesh(geometry, material(source.mesh), deviceCapacity)
    deviceBatch.frustumCulled = false
    deviceSize = dimensions
  }
  const object = new Object3D()
  object.name = "Office instance batches"
  for (const batch of avatarBatches) object.add(batch)
  if (deviceBatch !== undefined) object.add(deviceBatch)
  const matrix = new Matrix4(), quaternion = new Quaternion(), position = new Vector3(), factor = new Vector3()
  let disposed = false
  const update = (layout: OfficeInstancesLayout) => {
    if (disposed) throw new Error("Office instances освобождены")
    if (layout.agents.length > avatarCapacity || deviceBatch !== undefined && deviceCount(layout) > deviceCapacity) throw new RangeError("Office instances превышают выданную capacity")
    for (const batch of avatarBatches) batch.count = layout.agents.length
    if (deviceBatch !== undefined) deviceBatch.count = deviceCount(layout)
    let deviceSlot = 0
    for (const [index, agent] of layout.agents.entries()) {
      position.set(agent.position.x, agent.position.y, agent.position.z)
      quaternion.setFromAxisAngle(new Vector3(0, 0, 1), agent.rotationZ)
      factor.set(agent.scale, agent.scale, agent.scale)
      for (const [primitive, batch] of avatarBatches.entries()) {
        batch.setPoseAt(index, input.pose?.(agent.id, primitive) ?? input.avatars[primitive]!.mesh)
        matrix.compose(position, quaternion, factor).multiply(sourceTransforms[primitive]!)
        batch.setMatrixAt(index, matrix)
      }
      if (deviceBatch !== undefined && input.device !== undefined && deviceSize !== undefined) for (const display of agent.displays) {
        const source = input.device.bounds
        position.set(display.position.x, display.position.y, display.position.z)
        quaternion.setFromAxisAngle(new Vector3(0, 0, 1), display.rotationZ)
        factor.set(display.width / deviceSize.width, display.depth / deviceSize.depth, display.height / deviceSize.height)
        matrix.compose(position, quaternion, factor).multiply(new Matrix4().makeTranslation(
          -(source.min.x + deviceSize.width / 2), -(source.min.y + deviceSize.depth / 2), -(source.min.z + deviceSize.height / 2),
        ))
        deviceBatch.setMatrixAt(deviceSlot++, matrix)
      }
    }
  }
  update(input.layout)
  return {
    object: () => object,
    avatarBatches: avatarBatches as readonly InstancedSkinnedMesh[],
    deviceBatch,
    update,
    dispose() {
      if (disposed) return
      disposed = true
      for (const batch of avatarBatches) {batch.count = 0; object.remove(batch)}
      if (deviceBatch !== undefined) {deviceBatch.count = 0; object.remove(deviceBatch)}
    },
  }
}

/** Asset adapter lifecycle; semantic displays и их content остаются в принимающем Document. */
export type OfficeInstances = ReturnType<typeof createOfficeInstances>
