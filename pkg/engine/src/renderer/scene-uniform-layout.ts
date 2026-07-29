export type SceneUniformLayout = Readonly<{
  byteSize: number
  cameraFloatOffset: number
  lightsFloatOffset: number
}>

/**
 * WGSL arrays keep the Light struct's 16-byte alignment after numLights.
 */
export const createSceneUniformLayout = (
  maxLights: number,
  lightStructBytes: number,
): SceneUniformLayout => {
  const lightsByteOffset = 144
  const cameraByteOffset = lightsByteOffset + maxLights * lightStructBytes
  return {
    byteSize: cameraByteOffset + 16,
    cameraFloatOffset: cameraByteOffset / 4,
    lightsFloatOffset: lightsByteOffset / 4,
  }
}
