import {type Object3D} from "@metafor/engine"
import {UiSurface} from "@ui/elements/surface"
import {drawPlaygroundPreviewChrome} from "@ui/playground/surfaces"
import type {
  PlaygroundStoryArgs,
  PlaygroundStoryIndexItem,
  PlaygroundStoryModule,
} from "@ui/playground/stories"

export type ElementsStoryPreviewDiagnostics = Readonly<{
  route: string
  layoutPlans: number
  materializations: number
}>

export class ElementsStoryPreviewSurface extends UiSurface {
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
    this.node.name = "ElementsStoryPreviewSurface"
    this.#previewParent = this.createRetainedParent()
    this.#previewParent.name = "ElementsStoryPreviewSurface.preview"
  }

  get diagnostics(): ElementsStoryPreviewDiagnostics {
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
    if (index === null || module === null || this.rectW < 128 || this.rectH < 96) return
    const signature = `${index.route}:${JSON.stringify(this.#args)}`
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    if (!geometryChanged && previous.signature === signature) return
    if (geometryChanged) this.#layoutPlans += 1
    this.materializeRetainedParent(this.#previewParent, () => {
      drawPlaygroundPreviewChrome(this, this.rectW, this.rectH, {
        title: index.title,
        description: "Рабочий элемент, параметры и TypeScript используют один сценарий.",
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
