import {UiSurface} from "@layout/core/surface"
import {clearReadOnlyTextParticipants} from "@ui/elements/input"
import {drawStorybookPreviewChrome} from "@zavx0z/storybook/workbench"
import type {
  StorybookStoryArgs,
  StorybookStoryIndexItem,
  StorybookStoryModule,
} from "@zavx0z/storybook/stories"

export type GraphStoryPreviewDiagnostics = Readonly<{
  route: string
  layoutPlans: number
  materializations: number
}>

/** Consumer-owned preview Surface, исполняющая выбранный Graph story module. */
export class GraphStoryPreviewSurface extends UiSurface {
  readonly #previewParent = this.createRetainedParent()
  #story: StorybookStoryIndexItem | null = null
  #module: StorybookStoryModule | null = null
  #args: StorybookStoryArgs = Object.freeze({})
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
    this.node.name = "GraphStoryPreviewSurface"
    this.#previewParent.name = "GraphStoryPreviewSurface.preview"
  }

  get diagnostics(): GraphStoryPreviewDiagnostics {
    return Object.freeze({
      route: this.#story?.route ?? "",
      layoutPlans: this.#layoutPlans,
      materializations: this.#materializations,
    })
  }

  setStory(
    story: StorybookStoryIndexItem,
    module: StorybookStoryModule,
    args: StorybookStoryArgs,
  ): void {
    if (this.#story?.route !== story.route) clearReadOnlyTextParticipants(this)
    this.#story = story
    this.#module = module
    this.#args = args
    this.requestRender()
  }

  setArgs(args: StorybookStoryArgs): void {
    this.#args = args
    this.requestRender()
  }

  protected override render(): void {
    const story = this.#story
    const module = this.#module
    if (story === null || module === null) return
    const signature = `${story.route}:${JSON.stringify(this.#args)}`
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    if (!geometryChanged && previous.signature === signature) return
    if (geometryChanged) this.#layoutPlans += 1
    this.materializeRetainedParent(this.#previewParent, () => {
      drawStorybookPreviewChrome(this, this.rectW, this.rectH, {
        title: story.title,
        description: "Реальные доменные проекции, набор данных и элементы управления используют один типизированный сценарий.",
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
