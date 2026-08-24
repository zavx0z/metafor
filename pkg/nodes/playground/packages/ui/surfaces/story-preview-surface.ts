import {UiSurface} from "@ui/elements/surface"
import {drawPlaygroundPreviewChrome} from "@ui/playground/surfaces"
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
    const index = this.#index
    drawPlaygroundPreviewChrome(this, this.rectW, this.rectH, index === null ? {} : {
      title: index.title,
      description: index.componentId === "parameter"
        ? "Рабочие Parameter, Field, Socket и TypeScript используют одно состояние сценария."
        : "Рабочий Socket, параметры и TypeScript используют одно состояние сценария.",
    })
    if (index === null || this.#module === null) return
    this.#module.render(this, this.#args, {x: 0, y: 0, w: this.rectW, h: this.rectH})
  }
}
