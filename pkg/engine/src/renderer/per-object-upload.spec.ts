import {describe, expect, test} from "bun:test"
import {
  BONE_MATRICES_SIZE,
  MAX_BONES,
  PER_OBJECT_UNIFORM_SIZE,
  planPerObjectUploads,
  populateBoneMatrixBlock,
} from "./per-object-upload"

describe("per-object GPU uploads", () => {
  test("uploads only compact uniforms when a frame has no skinned meshes", () => {
    expect(planPerObjectUploads(511, () => false)).toEqual({
      uniformBytes: 511 * PER_OBJECT_UNIFORM_SIZE,
      boneRanges: [],
    })
  })

  test("coalesces adjacent skinned meshes without uploading sparse gaps", () => {
    const skinnedIndices = new Set([1, 2, 5])

    expect(planPerObjectUploads(7, index => skinnedIndices.has(index))).toEqual({
      uniformBytes: 7 * PER_OBJECT_UNIFORM_SIZE,
      boneRanges: [
        {byteOffset: BONE_MATRICES_SIZE, byteLength: 2 * BONE_MATRICES_SIZE},
        {byteOffset: 5 * BONE_MATRICES_SIZE, byteLength: BONE_MATRICES_SIZE},
      ],
    })
  })

  test("retains 128 bone matrices, clears unused entries and never writes past the block", () => {
    const blockFloats = BONE_MATRICES_SIZE / Float32Array.BYTES_PER_ELEMENT
    const target = new Float32Array(blockFloats + 1).fill(-1)
    const written = populateBoneMatrixBlock(
      target,
      0,
      MAX_BONES + 1,
      index => new Float32Array(16).fill(index + 1),
    )

    expect(written).toBe(MAX_BONES)
    expect([...target.slice(0, 16)]).toEqual(new Array(16).fill(1))
    expect([...target.slice(blockFloats - 16, blockFloats)]).toEqual(new Array(16).fill(MAX_BONES))
    expect(target[blockFloats]).toBe(-1)

    target.fill(-1)
    populateBoneMatrixBlock(target, 0, 1, () => new Float32Array(16).fill(7))
    expect([...target.slice(0, 16)]).toEqual(new Array(16).fill(7))
    expect(target[16]).toBe(0)
    expect(target[blockFloats]).toBe(-1)
  })
})
