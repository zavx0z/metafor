import type {UiSurface} from "@ui/elements"
import {definePlaygroundRoutes, type PlaygroundRouteDeclaration} from "./router.ts"

export type PlaygroundStoryArgs = Readonly<Record<string, unknown>>

export type PlaygroundStoryControlKind =
  | "boolean"
  | "number"
  | "text"
  | "select"
  | "color"
  | "custom"

export type PlaygroundStoryControlOption = Readonly<{
  value: string
  label: string
}>

export type PlaygroundStoryControl<Key extends string = string> = Readonly<{
  key: Key
  label: string
  group: string
  kind: PlaygroundStoryControlKind
  description?: string
  options?: readonly PlaygroundStoryControlOption[]
}>

export type PlaygroundStoryPlayContext<Args extends PlaygroundStoryArgs = PlaygroundStoryArgs> = Readonly<{
  surface: UiSurface
  args: Args
}>

export type PlaygroundStoryModuleInput<Args extends PlaygroundStoryArgs> = Readonly<{
  defaultArgs: Args
  controls?: readonly PlaygroundStoryControl<Extract<keyof Args, string>>[]
  render(surface: UiSurface, args: Args): void
  source(args: Args): string
  play?(context: PlaygroundStoryPlayContext<Args>): void | Promise<void>
}>

export type PlaygroundStoryModule = Readonly<{
  defaultArgs: PlaygroundStoryArgs
  controls: readonly PlaygroundStoryControl[]
  render(surface: UiSurface, args: PlaygroundStoryArgs): void
  source(args: PlaygroundStoryArgs): string
  play?(context: PlaygroundStoryPlayContext): void | Promise<void>
}>

export type PlaygroundStoryLoader = () => Promise<PlaygroundStoryModule>

export type PlaygroundStoryVariantInput = Readonly<{
  id: string
  label: string
  title: string
  tags?: readonly string[]
  load: PlaygroundStoryLoader
}>

export type PlaygroundStorySectionInput = Readonly<{
  id: string
  label: string
  variants: readonly PlaygroundStoryVariantInput[]
}>

export type PlaygroundStoryComponentInput = Readonly<{
  id: string
  label: string
  apiName: string
  tags?: readonly string[]
  sections: readonly PlaygroundStorySectionInput[]
}>

export type PlaygroundStoryGroupInput = Readonly<{
  id: string
  label: string
  components: readonly PlaygroundStoryComponentInput[]
}>

export type PlaygroundStoryPath = Readonly<{
  component: string
  section: string
  variant: string
}>

export type PlaygroundStoryCatalogInput = Readonly<{
  groups: readonly PlaygroundStoryGroupInput[]
  fallback: PlaygroundStoryPath
}>

export type PlaygroundStoryIndexItem = Readonly<{
  route: string
  groupId: string
  groupLabel: string
  componentId: string
  componentLabel: string
  apiName: string
  sectionId: string
  sectionLabel: string
  variantId: string
  variantLabel: string
  title: string
  tags: readonly string[]
  searchText: string
}>

export type PlaygroundStoryRegistry = Readonly<{
  declaration: PlaygroundRouteDeclaration<string>
  index: readonly PlaygroundStoryIndexItem[]
  fallback: string
  find(route: string): PlaygroundStoryIndexItem | undefined
  load(route: string): Promise<PlaygroundStoryModule>
}>

type InternalStory = Readonly<{
  index: PlaygroundStoryIndexItem
  load: PlaygroundStoryLoader
}>

export function definePlaygroundStoryModule<const Args extends PlaygroundStoryArgs>(
  input: PlaygroundStoryModuleInput<Args>,
): PlaygroundStoryModule {
  const defaultArgs = Object.freeze({...input.defaultArgs})
  const controls = Object.freeze((input.controls ?? []).map((control) => normalizeControl(control)))
  const module: PlaygroundStoryModule = {
    defaultArgs,
    controls,
    render(surface, args) {
      input.render(surface, args as Args)
    },
    source(args) {
      const source = input.source(args as Args)
      if (source.trim().length === 0) throw new Error("Playground story source must not be empty")
      return source
    },
    ...(input.play === undefined ? {} : {
      play: (context: PlaygroundStoryPlayContext) => input.play!({
        surface: context.surface,
        args: context.args as Args,
      }),
    }),
  }
  return Object.freeze(module)
}

export function definePlaygroundStories(input: PlaygroundStoryCatalogInput): PlaygroundStoryRegistry {
  if (input.groups.length === 0) throw new Error("Playground story catalog must contain at least one group")
  const stories: InternalStory[] = []
  const groupIds = new Set<string>()
  const componentIds = new Set<string>()

  for (const group of input.groups) {
    validateId("group", group.id)
    validateLabel("group", group.label)
    if (groupIds.has(group.id)) throw new Error(`Duplicate playground story group: ${group.id}`)
    groupIds.add(group.id)
    if (group.components.length === 0) throw new Error(`Playground story group has no components: ${group.id}`)

    for (const component of group.components) {
      validateId("component", component.id)
      validateLabel("component", component.label)
      validateLabel("component apiName", component.apiName)
      if (componentIds.has(component.id)) throw new Error(`Duplicate playground story component: ${component.id}`)
      componentIds.add(component.id)
      if (component.sections.length === 0) throw new Error(`Playground story component has no sections: ${component.id}`)
      const sectionIds = new Set<string>()

      for (const section of component.sections) {
        validateId("section", section.id)
        validateLabel("section", section.label)
        if (sectionIds.has(section.id)) throw new Error(`Duplicate playground story section: ${component.id}/${section.id}`)
        sectionIds.add(section.id)
        if (section.variants.length === 0) throw new Error(`Playground story section has no variants: ${component.id}/${section.id}`)
        const variantIds = new Set<string>()

        for (const variant of section.variants) {
          validateId("variant", variant.id)
          validateLabel("variant", variant.label)
          validateLabel("story title", variant.title)
          if (variantIds.has(variant.id)) {
            throw new Error(`Duplicate playground story variant: ${component.id}/${section.id}/${variant.id}`)
          }
          variantIds.add(variant.id)
          if (typeof variant.load !== "function") throw new Error("Playground story loader must be a function")
          const route = storyRoute({component: component.id, section: section.id, variant: variant.id})
          const tags = Object.freeze(uniqueStrings([...(component.tags ?? []), ...(variant.tags ?? [])]))
          const index: PlaygroundStoryIndexItem = Object.freeze({
            route,
            groupId: group.id,
            groupLabel: group.label,
            componentId: component.id,
            componentLabel: component.label,
            apiName: component.apiName,
            sectionId: section.id,
            sectionLabel: section.label,
            variantId: variant.id,
            variantLabel: variant.label,
            title: variant.title,
            tags,
            searchText: normalizeSearch([
              group.label,
              component.label,
              component.apiName,
              section.label,
              variant.label,
              variant.title,
              ...tags,
            ]),
          })
          stories.push(Object.freeze({index, load: variant.load}))
        }
      }
    }
  }

  const routes = Object.freeze(stories.map(({index}) => index.route))
  const fallback = storyRoute(input.fallback)
  const declaration = definePlaygroundRoutes({routes, fallback})
  const byRoute = new Map(stories.map((story) => [story.index.route, story]))
  const loaded = new Map<string, Promise<PlaygroundStoryModule>>()
  const index = Object.freeze(stories.map((story) => story.index))

  return Object.freeze({
    declaration,
    index,
    fallback,
    find(route: string) {
      return byRoute.get(route)?.index
    },
    load(route: string) {
      const story = byRoute.get(route)
      if (story === undefined) return Promise.reject(new Error(`Unknown playground story route: ${route}`))
      const current = loaded.get(route)
      if (current !== undefined) return current
      const pending = story.load()
        .then((module) => validateLoadedStory(route, module))
        .catch((error) => {
          loaded.delete(route)
          throw error
        })
      loaded.set(route, pending)
      return pending
    },
  })
}

export function storyRoute(path: PlaygroundStoryPath): string {
  validateId("component", path.component)
  validateId("section", path.section)
  validateId("variant", path.variant)
  return `${path.component}/${path.section}/${path.variant}`
}

function normalizeControl(control: PlaygroundStoryControl): PlaygroundStoryControl {
  validateId("control", control.key)
  validateLabel("control", control.label)
  validateLabel("control group", control.group)
  const options = control.options === undefined
    ? undefined
    : Object.freeze(control.options.map((option) => Object.freeze({
      value: option.value,
      label: option.label,
    })))
  return Object.freeze({...control, ...(options === undefined ? {} : {options})})
}

function validateLoadedStory(route: string, module: PlaygroundStoryModule): PlaygroundStoryModule {
  if (module === null || typeof module !== "object") throw new Error(`Playground story did not load a module: ${route}`)
  if (module.defaultArgs === null || typeof module.defaultArgs !== "object" || Array.isArray(module.defaultArgs)) {
    throw new Error(`Playground story defaultArgs must be an object: ${route}`)
  }
  if (!Array.isArray(module.controls)) throw new Error(`Playground story controls must be an array: ${route}`)
  if (typeof module.render !== "function") throw new Error(`Playground story render must be a function: ${route}`)
  if (typeof module.source !== "function") throw new Error(`Playground story source must be a function: ${route}`)
  return module
}

function validateId(kind: string, value: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid playground story ${kind} id: ${value}`)
  }
}

function validateLabel(kind: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`Playground story ${kind} label must not be empty`)
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
}

function normalizeSearch(values: readonly string[]): string {
  return uniqueStrings(values).join(" ").toLocaleLowerCase("ru-RU")
}
