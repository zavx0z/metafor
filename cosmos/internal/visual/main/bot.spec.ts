import {expect, test} from "bun:test"
import {AnimationMixer, SkinnedMesh} from "@zavx0z/immersive/engine"
import {loadBot} from "./bot.ts"

test("the shipped bot retains one animated skeleton in the shared scene", async () => {
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  const bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
  const scene = bot.object()
  expect(scene.getObjectByName("Armature.001")).toBeUndefined()
  expect(scene.getObjectByName("Armature")).toBeDefined()
  const meshes: SkinnedMesh[] = []
  scene.traverse(object => { if (object instanceof SkinnedMesh) meshes.push(object) })
  expect(meshes).toHaveLength(2)
  expect(meshes.every(mesh => mesh.skeleton.bones.length > 0)).toBe(true)
  const hips = scene.getObjectByName("mixamorig:Hips")!
  const initial = [hips.position.x, hips.position.y, hips.position.z]
  const mixer = new AnimationMixer(scene)
  const action = mixer.clipAction(bot.animation())
  action.play()
  mixer.update(0.5)
  expect([hips.position.x, hips.position.y, hips.position.z]).not.toEqual(initial)
  expect(bot.object()).toBe(scene)
  action.stop()
})
