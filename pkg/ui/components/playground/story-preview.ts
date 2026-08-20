import {type Object3D} from "@metafor/engine"
import {div} from "@ui/elements/div"
import {UiSurface} from "@ui/elements/surface"
import {h2, p} from "@ui/elements/text"
import type {
  PlaygroundStoryArgs,
  PlaygroundStoryIndexItem,
  PlaygroundStoryModule,
} from "@ui/playground/stories"

export type ComponentsStoryPreviewDiagnostics = Readonly<{
  route: string
  layoutPlans: number
  materializations: number
}>

export class ComponentsStoryPreviewSurface extends UiSurface {
  readonly #previewParent: Object3D
  #storyIndex: PlaygroundStoryIndexItem | null = null
  #storyModule: PlaygroundStoryModule | null = null
  #args: PlaygroundStoryArgs = Object.freeze({})
  #materialized: Readonly<{
    signature: string
    w: number
    h: number
    pixelScale: number
    font: unknown
  }> | null = null
  #layoutPlans = 0
  #materializations = 0

  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "ComponentsStoryPreviewSurface"
    this.#previewParent = this.createRetainedParent()
    this.#previewParent.name = "ComponentsStoryPreviewSurface.preview"
  }

  get diagnostics(): ComponentsStoryPreviewDiagnostics {
    return Object.freeze({
      route: this.#storyIndex?.route ?? "",
      layoutPlans: this.#layoutPlans,
      materializations: this.#materializations,
    })
  }

  setStory(
    index: PlaygroundStoryIndexItem,
    module: PlaygroundStoryModule,
    args: PlaygroundStoryArgs,
  ): void {
    this.#storyIndex = index
    this.#storyModule = module
    this.#args = args
    this.requestRender()
  }

  setArgs(args: PlaygroundStoryArgs): void {
    this.#args = args
    this.requestRender()
  }

  protected override render(): void {
    const index = this.#storyIndex
    const module = this.#storyModule
    if (index === null || module === null) return
    const signature = `${index.route}:${JSON.stringify(this.#args)}`
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    if (!geometryChanged && previous.signature === signature) return
    if (geometryChanged) this.#layoutPlans += 1
    this.materializeRetainedParent(this.#previewParent, () => {
      div(this, 0, 0, this.rectW, this.rectH, {
        style: {
          background: "rgba(8, 13, 22, 0.72)",
          borderColor: "rgba(214, 231, 255, 0.22)",
          borderRadius: 38,
        },
      })
      h2(this, 42, 38, Math.max(0, this.rectW - 84), 42, {
        children: index.title,
        style: {fontSize: 24},
      })
      p(this, 42, 92, Math.max(0, this.rectW - 84), 46, {
        children: "Рабочий компонент, параметры и TypeScript используют один сценарий.",
        style: {fontSize: 12, color: "muted"},
      })
      module.render(this, this.#args, {x: 0, y: 0, w: this.rectW, h: this.rectH})
    })
    this.#materializations += 1
    this.#materialized = {
      signature,
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
    }
  }
}
