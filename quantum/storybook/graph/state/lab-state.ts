import type {
  StorybookStoryArgs,
  StorybookStoryIndexItem,
  StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import type {StorybookStoryPanelMode} from "@zavx0z/storybook/workbench"
import {
  GRAPH_STORIES,
  graphStoryIndex,
  type GraphStoryRoute,
} from "../stories.ts"

export type GraphLabSnapshot = Readonly<{
  route: GraphStoryRoute
  story: StorybookStoryIndexItem
  args: StorybookStoryArgs
  source: string
  panelMode: StorybookStoryPanelMode
  changes: number
}>

/** Владеет только текущим story/args UI-лаборатории и не хранит Quantum Graph. */
export class GraphLabState {
  #route: GraphStoryRoute
  #story: StorybookStoryIndexItem
  #module: StorybookStoryModule
  #args: StorybookStoryArgs
  #panelMode: StorybookStoryPanelMode = "controls"
  #changes = 0
  #loadRevision = 0

  private constructor(
    route: GraphStoryRoute,
    story: StorybookStoryIndexItem,
    module: StorybookStoryModule,
  ) {
    this.#route = route
    this.#story = story
    this.#module = module
    this.#args = Object.freeze({...module.defaultArgs})
  }

  static async create(route: GraphStoryRoute): Promise<GraphLabState> {
    return new GraphLabState(route, graphStoryIndex(route), await GRAPH_STORIES.load(route))
  }

  get route(): GraphStoryRoute {
    return this.#route
  }

  get story(): StorybookStoryIndexItem {
    return this.#story
  }

  get module(): StorybookStoryModule {
    return this.#module
  }

  get args(): StorybookStoryArgs {
    return this.#args
  }

  get panelMode(): StorybookStoryPanelMode {
    return this.#panelMode
  }

  async select(route: GraphStoryRoute): Promise<boolean> {
    const revision = ++this.#loadRevision
    const story = graphStoryIndex(route)
    let module: StorybookStoryModule
    try {
      module = await GRAPH_STORIES.load(route)
    } catch (error) {
      if (revision !== this.#loadRevision) return false
      throw error
    }
    if (revision !== this.#loadRevision) return false
    this.#route = route
    this.#story = story
    this.#module = module
    this.#args = Object.freeze({...module.defaultArgs})
    this.#changes = 0
    return true
  }

  /** Cancels any pending lazy selection while preserving the last committed story. */
  invalidateSelection(): void {
    this.#loadRevision += 1
  }

  setControl(key: string, value: unknown): void {
    if (!this.#module.controls.some((control) => control.key === key)) {
      throw new Error(`Graph story не объявляет control: ${key}`)
    }
    this.#args = Object.freeze({...this.#args, [key]: value})
    this.#changes += 1
  }

  setPanelMode(mode: StorybookStoryPanelMode): void {
    this.#panelMode = mode
  }

  snapshot(): GraphLabSnapshot {
    return Object.freeze({
      route: this.#route,
      story: this.#story,
      args: this.#args,
      source: this.#module.source(this.#args),
      panelMode: this.#panelMode,
      changes: this.#changes,
    })
  }
}
