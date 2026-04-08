import { Object3D } from "../core/Object3D"
import { AnimationAction } from "./AnimationAction"
import { AnimationClip } from "./AnimationClip"

export class AnimationMixer {
  private root: Object3D
  private actions: AnimationAction[] = []

  constructor(root: Object3D) {
    this.root = root
  }

  public getRoot(): Object3D {
    return this.root
  }

  public clipAction(clip: AnimationClip, localRoot?: Object3D): AnimationAction {
    const action = new AnimationAction(this, clip, localRoot)
    return action
  }

  public addAction(action: AnimationAction): void {
    if (this.actions.indexOf(action) === -1) {
      this.actions.push(action)
    }
  }

  public removeAction(action: AnimationAction): void {
    const index = this.actions.indexOf(action)
    if (index !== -1) {
      this.actions.splice(index, 1)
    }
  }

  public update(deltaTime: number): void {
    for (let i = 0; i < this.actions.length; i++) {
      this.actions[i].update(deltaTime)
    }
  }
}
