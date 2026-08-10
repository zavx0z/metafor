export const UNIFORM_ALIGNMENT = 256

// mat4x4 + mat4x4 + material data, aligned for dynamic uniform offsets.
export const PER_OBJECT_UNIFORM_SIZE = Math.ceil((64 + 64 + 16 + 4) / UNIFORM_ALIGNMENT) * UNIFORM_ALIGNMENT
export const MAX_BONES = 128
export const BONE_MATRICES_SIZE = MAX_BONES * 16 * 4

export interface BufferUploadRange {
  byteOffset: number
  byteLength: number
}

export interface PerObjectUploadPlan {
  uniformBytes: number
  boneRanges: BufferUploadRange[]
}

export function populateBoneMatrixBlock(
  target: Float32Array,
  targetFloatOffset: number,
  boneCount: number,
  matrixAt: (index: number) => ArrayLike<number>,
): number {
  const blockFloats = BONE_MATRICES_SIZE / Float32Array.BYTES_PER_ELEMENT
  target.fill(0, targetFloatOffset, targetFloatOffset + blockFloats)

  const writtenBoneCount = Math.min(Math.max(0, boneCount), MAX_BONES)
  for (let index = 0; index < writtenBoneCount; index++) {
    target.set(matrixAt(index), targetFloatOffset + index * 16)
  }
  return writtenBoneCount
}

export function planPerObjectUploads(
  objectCount: number,
  isSkinnedAt: (index: number) => boolean,
): PerObjectUploadPlan {
  const boneRanges: BufferUploadRange[] = []
  let rangeStart = -1

  for (let index = 0; index <= objectCount; index++) {
    const isSkinned = index < objectCount && isSkinnedAt(index)
    if (isSkinned && rangeStart < 0) {
      rangeStart = index
    } else if (!isSkinned && rangeStart >= 0) {
      boneRanges.push({
        byteOffset: rangeStart * BONE_MATRICES_SIZE,
        byteLength: (index - rangeStart) * BONE_MATRICES_SIZE,
      })
      rangeStart = -1
    }
  }

  return {
    uniformBytes: objectCount * PER_OBJECT_UNIFORM_SIZE,
    boneRanges,
  }
}
