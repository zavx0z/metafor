import {GLTFLoader, Matrix4, SkinnedMesh, Vector3, type Object3D, type AnimationClip} from "@zavx0z/immersive/engine"
import type {OfficeBounds} from "@metafor/agent/office-layout"
import type {OfficeAvatarPrimitive} from "@metafor/agent/office-instances"

/** Готовые фабрики одного персонажа для Asset и его общего Animation lifecycle. */
export interface Bot {
  readonly object: () => Object3D
  readonly animation: () => AnimationClip
  readonly bounds: OfficeBounds
  readonly primitives: readonly OfficeAvatarPrimitive[]
}

/** Загружает Alpha из исходного bots.glb; координаты и скелет преобразует GLTFLoader. */
export async function loadBot(url: string): Promise<Bot> {
  const model = await new GLTFLoader().load(url)
  const alpha = model.scene.getObjectByName("Armature")
  const beta = model.scene.getObjectByName("Armature.001")
  const clip = model.animations.find(animation => animation.name === "Armature|mixamo.com|Layer0.001")
  if (!alpha || !beta || !clip) throw new Error("Bot asset is missing Alpha or its animation")
  beta.parent?.remove(beta)
  alpha.position.set(0, 0, 0)
  model.scene.updateWorldMatrix(true)
  const primitives: OfficeAvatarPrimitive[] = []
  const min = {x: Infinity, y: Infinity, z: Infinity}
  const max = {x: -Infinity, y: -Infinity, z: -Infinity}
  const point = new Vector3(), weighted = new Vector3(), posed = new Vector3()
  model.scene.traverse(object => {
    if (!(object instanceof SkinnedMesh)) return
    const transform = new Matrix4().copy(object.matrixWorld)
    primitives.push({mesh: object, transform})
    const positions = object.geometry.attributes.position
    const joints = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight
    if (!positions || !joints || !weights) throw new Error("Bot primitive не имеет skinned vertex attributes")
    // Bounds должны описывать ту же позу, которую рисует InstancedSkinnedMesh:
    // mesh-local skinning, затем authored transform. Сырые vertex positions
    // этого GLB находятся в bind space и не имеют габаритов стоящего персонажа.
    const inverse = new Matrix4().copy(object.matrixWorld).invert()
    const palette = object.skeleton.bones.map((bone, index) => new Matrix4()
      .multiplyMatrices(inverse, bone.matrixWorld).multiply(object.skeleton.boneInverses[index]!))
    for (let index = 0; index < positions.count; index++) {
      point.set(positions.array[index * 3]!, positions.array[index * 3 + 1]!, positions.array[index * 3 + 2]!)
      posed.set(0, 0, 0)
      for (let influence = 0; influence < 4; influence++) {
        const offset = index * 4 + influence, weight = weights.array[offset]!
        if (weight === 0) continue
        const matrix = palette[joints.array[offset]!]
        if (!matrix || !Number.isFinite(weight)) throw new Error("Bot primitive имеет недопустимую skin palette")
        posed.add(weighted.copy(point).applyMatrix4(matrix).multiplyScalar(weight))
      }
      posed.applyMatrix4(transform)
      for (const axis of ["x", "y", "z"] as const) {
        min[axis] = Math.min(min[axis], posed[axis])
        max[axis] = Math.max(max[axis], posed[axis])
      }
    }
  })
  if (!primitives.length || Object.values(min).some(value => !Number.isFinite(value)) || max.z <= min.z) throw new Error("Bot asset имеет недопустимые bounds")
  return {object: () => model.scene, animation: () => clip, bounds: {min, max}, primitives}
}
