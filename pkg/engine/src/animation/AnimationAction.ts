import { AnimationClip } from "./AnimationClip"
import { AnimationMixer } from "./AnimationMixer"
import { KeyframeTrack } from "./KeyframeTrack"
import { Quaternion } from "../math/Quaternion"
import { Vector3 } from "../math/Vector3"

// Вспомогательные типы для прототипов
declare module "../math/Vector3" {
  interface Vector3 {
    lerp(v: Vector3, alpha: number): this
  }
}
declare module "../math/Quaternion" {
  interface Quaternion {
    slerp(qb: Quaternion, t: number): this
    copy(q: Quaternion): this
  }
}

export class AnimationAction {
  private mixer: AnimationMixer
  private clip: AnimationClip
  private localRoot: any
  private time: number = 0
  public loop: boolean = true
  public paused: boolean = false
  public timeScale: number = 1

  constructor(mixer: AnimationMixer, clip: AnimationClip, localRoot?: any) {
    this.mixer = mixer
    this.clip = clip
    this.localRoot = localRoot || mixer.getRoot()
  }

  public play(): this {
    this.time = 0
    this.paused = false
    this.mixer.addAction(this)
    return this
  }

  public stop(): this {
    this.paused = true
    this.mixer.removeAction(this)
    return this
  }

  public update(deltaTime: number): void {
    if (this.paused) return

    this.time += deltaTime * this.timeScale

    if (this.loop) {
      this.time = this.time % this.clip.duration
    }

    if (this.time > this.clip.duration && !this.loop) {
      this.stop()
      return
    }

    for (const track of this.clip.tracks) {
      const node = this.localRoot.getObjectByName(track.nodeName)
      if (!node) {
        continue
      }

      const { times, values } = track
      const prevIndex = Math.max(0, this.findKeyframeIndex(times, this.time))
      const nextIndex = Math.min(times.length - 1, prevIndex + 1)

      if (prevIndex === nextIndex) {
        this.applyValue(node, track, prevIndex)
      } else {
        const prevTime = times[prevIndex]
        const nextTime = times[nextIndex]
        const t = (this.time - prevTime) / (nextTime - prevTime)
        this.interpolateAndApply(node, track, prevIndex, nextIndex, t)
      }
      node.updateMatrix()
    }
  }

  private findKeyframeIndex(times: Float32Array, time: number): number {
    let low = 0
    let high = times.length - 1

    while (low < high) {
      // Bitwise shift is faster than Math.floor
      const mid = (low + high + 1) >>> 1
      if (times[mid] <= time) {
        low = mid
      } else {
        high = mid - 1
      }
    }
    return low
  }

  private applyValue(node: any, track: KeyframeTrack, index: number): void {
    const itemSize = track.type === "quaternion" ? 4 : 3
    const offset = index * itemSize

    switch (track.type) {
      case "vector":
        node.position.fromArray(track.values, offset)
        break
      case "quaternion":
        node.quaternion.fromArray(track.values, offset)
        break
      case "scale":
        node.scale.fromArray(track.values, offset)
        break
    }
  }

  private interpolateAndApply(node: any, track: KeyframeTrack, prevIndex: number, nextIndex: number, t: number): void {
    const itemSize = track.type === "quaternion" ? 4 : 3
    const prevOffset = prevIndex * itemSize
    const nextOffset = nextIndex * itemSize

    switch (track.type) {
      case "vector":
      case "scale":
        const prevVec = new Vector3().fromArray(track.values, prevOffset)
        const nextVec = new Vector3().fromArray(track.values, nextOffset)
        const targetVec = track.type === "vector" ? node.position : node.scale
        targetVec.copy(prevVec).lerp(nextVec, t)
        break
      case "quaternion":
        const prevQuat = new Quaternion().fromArray(track.values, prevOffset)
        const nextQuat = new Quaternion().fromArray(track.values, nextOffset)
        node.quaternion.copy(prevQuat).slerp(nextQuat, t)
        break
    }
  }
}

if (!Vector3.prototype.lerp) {
  Vector3.prototype.lerp = function (v: Vector3, alpha: number): Vector3 {
    this.x += (v.x - this.x) * alpha
    this.y += (v.y - this.y) * alpha
    this.z += (v.z - this.z) * alpha
    return this
  }
}

if (!Quaternion.prototype.slerp) {
  Quaternion.prototype.slerp = function (qb: Quaternion, t: number): Quaternion {
    if (t === 0) return this
    if (t === 1) return this.copy(qb)

    const x = this.x,
      y = this.y,
      z = this.z,
      w = this.w
    let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z

    if (cosHalfTheta < 0) {
      const qb_ = new Quaternion(-qb.x, -qb.y, -qb.z, -qb.w)
      cosHalfTheta = -cosHalfTheta
      if (cosHalfTheta >= 1.0) {
        this.set(x, y, z, w)
        return this
      }
      const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta)
      if (sinHalfTheta <= Number.EPSILON) {
        const s = 1 - t
        this.set(s * x + t * qb_.x, s * y + t * qb_.y, s * z + t * qb_.z, s * w + t * qb_.w)
        return this.normalize()
      }
      const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta)
      const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
      const ratioB = Math.sin(t * halfTheta) / sinHalfTheta
      this.set(
        x * ratioA + qb_.x * ratioB,
        y * ratioA + qb_.y * ratioB,
        z * ratioA + qb_.z * ratioB,
        w * ratioA + qb_.w * ratioB,
      )
      return this
    } else {
      if (cosHalfTheta >= 1.0) {
        this.set(x, y, z, w)
        return this
      }
      const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta)
      if (sinHalfTheta <= Number.EPSILON) {
        const s = 1 - t
        this.set(s * x + t * qb.x, s * y + t * qb.y, s * z + t * qb.z, s * w + t * qb.w)
        return this.normalize()
      }
      const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta)
      const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
      const ratioB = Math.sin(t * halfTheta) / sinHalfTheta
      this.set(
        x * ratioA + qb.x * ratioB,
        y * ratioA + qb.y * ratioB,
        z * ratioA + qb.z * ratioB,
        w * ratioA + qb.w * ratioB,
      )
      return this
    }
  }
}
