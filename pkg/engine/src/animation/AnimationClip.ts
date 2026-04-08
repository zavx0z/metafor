import { KeyframeTrack } from "./KeyframeTrack"

export class AnimationClip {
  public name: string
  public tracks: KeyframeTrack[]
  public duration: number

  constructor(name: string, duration: number = -1, tracks: KeyframeTrack[] = []) {
    this.name = name
    this.tracks = tracks
    this.duration = duration >= 0 ? duration : this.calculateDuration()
  }

  private calculateDuration(): number {
    let maxDuration = 0
    for (const track of this.tracks) {
      const trackDuration = track.times[track.times.length - 1] || 0
      if (trackDuration > maxDuration) {
        maxDuration = trackDuration
      }
    }
    return maxDuration
  }
}
