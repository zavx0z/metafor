export class KeyframeTrack {
  public nodeName: string
  public type: "vector" | "quaternion" | "scale"
  public times: Float32Array
  public values: Float32Array

  constructor(nodeName: string, type: "vector" | "quaternion" | "scale", times: Float32Array, values: Float32Array) {
    this.nodeName = nodeName
    this.type = type
    this.times = times
    this.values = values
  }
}
