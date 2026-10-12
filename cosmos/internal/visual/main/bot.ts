import {GLTFLoader, type Object3D, type AnimationClip} from "@zavx0z/immersive/engine"

/** Готовые фабрики одного персонажа для Asset и его общего Animation lifecycle. */
export interface Bot {
  readonly object: () => Object3D
  readonly animation: () => AnimationClip
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
  return {object: () => model.scene, animation: () => clip}
}
