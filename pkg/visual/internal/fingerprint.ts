import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "../VisualMaterialSpec.ts"

const FNV32_OFFSET = 0x811c9dc5
const FNV32_PRIME = 0x01000193
const SECOND_HASH_OFFSET = 0x9e3779b9
const SECOND_HASH_PRIME = 0x5bd1e995

const numberBuffer = new ArrayBuffer(8)
const numberView = new DataView(numberBuffer)
const textEncoder = new TextEncoder()

type FingerprintablePath = Readonly<{
  material: VisualLineMaterial
  ownerDarkParticleId: number
  /** Flat `[x0, y0, z0, …]` local-frame coordinates. */
  points: readonly number[]
}>

/**
 * Two independent 32-bit mixes over the exact bytes of every contributing
 * value. A batch whose fingerprint is unchanged has byte-identical geometry and
 * material, so a renderer can keep its existing GPU line buffer.
 */
class Fingerprint {
  #left = FNV32_OFFSET
  #right = SECOND_HASH_OFFSET

  byte(value: number): void {
    this.#left = Math.imul(this.#left ^ value, FNV32_PRIME)
    this.#right = Math.imul(this.#right ^ value, SECOND_HASH_PRIME)
  }

  number(value: number): void {
    numberView.setFloat64(0, value, false)
    for (let index = 0; index < 8; index++) {
      this.byte(numberView.getUint8(index))
    }
  }

  text(value: string): void {
    const bytes = textEncoder.encode(value)
    this.number(bytes.length)
    bytes.forEach((byte) => this.byte(byte))
  }

  digest(): string {
    return (
      (this.#left >>> 0).toString(16).padStart(8, "0") +
      (this.#right >>> 0).toString(16).padStart(8, "0")
    )
  }
}

const mixLineMaterial = (
  hash: Fingerprint,
  material: VisualLineMaterial,
): void => {
  hash.text(material.kind)
  hash.text(material.visibilityMode)
  material.color.forEach((channel) => hash.number(channel))
  material.glowColor.forEach((channel) => hash.number(channel))
  hash.number(material.glowIntensity)
  hash.number(material.opacity)
}

/** Content fingerprint of one homogeneous line batch. */
export const visualBatchFingerprint = (
  batchId: string,
  paths: readonly FingerprintablePath[],
): string => {
  const hash = new Fingerprint()
  hash.text(batchId)
  hash.number(paths.length)
  for (const entry of paths) {
    hash.number(entry.ownerDarkParticleId)
    mixLineMaterial(hash, entry.material)
    hash.number(entry.points.length)
    for (const coordinate of entry.points) hash.number(coordinate)
  }
  return hash.digest()
}

/**
 * Content digest of an ordered list of already-stringified parts.
 *
 * Used for cache and validity keys, where the inputs are identities and scalar
 * values rather than coordinate buffers. Order is significant, and each part is
 * length-prefixed, so no concatenation of different parts can collide.
 */
export const visualPreparationDigest = (
  parts: readonly string[],
): string => {
  const hash = new Fingerprint()
  hash.number(parts.length)
  for (const part of parts) hash.text(part)
  return hash.digest()
}

/** Value equality for one quantum material spec. */
export const sameVisualQuantumMaterial = (
  left: VisualQuantumMaterial,
  right: VisualQuantumMaterial,
): boolean =>
  left.kind === right.kind &&
  left.form === right.form &&
  left.glowIntensity === right.glowIntensity &&
  left.highlightSize === right.highlightSize &&
  left.opacity === right.opacity &&
  left.color.every((channel, index) => channel === right.color[index])
