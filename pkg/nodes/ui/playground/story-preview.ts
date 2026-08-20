import {div} from "@ui/elements/div"
import {UiSurface} from "@ui/elements/surface"
import {h2, p} from "@ui/elements/text"
import type {
  PlaygroundStoryArgs,
  PlaygroundStoryIndexItem,
  PlaygroundStoryModule,
} from "@ui/playground/stories"

export class NodeStoryPreviewSurface extends UiSurface {
  #index: PlaygroundStoryIndexItem | null = null
  #module: PlaygroundStoryModule | null = null
  #args: PlaygroundStoryArgs = Object.freeze({})

  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "NodeStoryPreviewSurface"
  }

  setStory(
    index: PlaygroundStoryIndexItem,
    module: PlaygroundStoryModule,
    args: PlaygroundStoryArgs,
  ): void {
    this.#index = index
    this.#module = module
    this.#args = args
    this.requestRender()
  }

  setArgs(args: PlaygroundStoryArgs): void {
    this.#args = args
    this.requestRender()
  }

  protected override render(): void {
    div(this, 0, 0, this.rectW, this.rectH, {
      style: {
        background: "rgba(8, 13, 22, 0.72)",
        borderColor: "rgba(214, 231, 255, 0.22)",
        borderRadius: 38,
      },
    })
    if (this.#index === null || this.#module === null) return
    h2(this, 42, 38, Math.max(0, this.rectW - 84), 42, {
      children: this.#index.title,
      style: {fontSize: 24},
    })
    p(this, 42, 92, Math.max(0, this.rectW - 84), 46, {
      children: "Production Socket, параметры и TypeScript используют одно состояние story.",
      style: {fontSize: 12, color: "muted"},
    })
    this.#module.render(this, this.#args, {x: 0, y: 0, w: this.rectW, h: this.rectH})
  }
}
