import {
  type Document,
  type HTMLElement,
} from "@zavx0z/dom"
import {
  createCodeEditor,
} from "@ui/components/code-editor"
import type {StorybookDomStorySource} from "@zavx0z/storybook/stories"
import {graphJsonStorySource} from "./stories/source.ts"

export type GraphDomStory<Args extends object = Readonly<Record<string, unknown>>> = Readonly<{
  element: HTMLElement
  args: Args
  source: StorybookDomStorySource
  dispose(): void
}>

export type GraphDomStoryFactory = (document: Document) => GraphDomStory

export type GraphBooleanControl<Args extends object> = Readonly<{
  kind: "boolean"
  key: keyof Args & string
  label: string
  description: string
}>

export type GraphSelectControl<Args extends object> = Readonly<{
  kind: "select"
  key: keyof Args & string
  label: string
  description: string
  options: readonly Readonly<{value: string; label: string}>[]
}>

export type GraphJsonStoryInput<Args extends object> = Readonly<{
  id: string
  title: string
  defaultArgs: Args
  control?: GraphBooleanControl<Args> | GraphSelectControl<Args>
  value(args: Args): unknown
  typescript(args: Args): string
}>

/** Creates one stable semantic JSON presentation with an optional native control. */
export function createGraphJsonStory<Args extends object>(
  document: Document,
  input: GraphJsonStoryInput<Args>,
): GraphDomStory<Args> {
  const root = document.createElement("section")
  const heading = document.createElement("h2")
  const controls = document.createElement("div")
  const result = document.createElement("div")
  let currentArgs = Object.freeze({...input.defaultArgs}) as Args
  let disposed = false

  root.className = "graph-json"
  root.setAttribute("data-story", input.id)
  heading.className = "graph-json__title"
  heading.append(input.title)
  controls.className = "graph-json__controls"
  result.className = "graph-json__result"

  const editor = createCodeEditor(document, codeEditorProps(input, currentArgs))
  result.appendChild(editor.element)
  root.append(heading, controls, result)

  const update = (patch: Partial<Args>): void => {
    if (disposed) throw new Error(`Graph DOM story is disposed: ${input.id}`)
    currentArgs = Object.freeze({...currentArgs, ...patch}) as Args
    editor.update(codeEditorProps(input, currentArgs))
  }
  const control = input.control === undefined
    ? null
    : createControl(document, input.control, () => currentArgs, update)
  if (control !== null) controls.appendChild(control.element)
  else controls.setAttribute("hidden", "")

  return Object.freeze({
    element: root,
    get args() { return currentArgs },
    get source() {
      return graphJsonStorySource({
        id: input.id,
        title: input.title,
        ...(input.control === undefined ? {} : {control: input.control}),
        typescript: input.typescript(currentArgs),
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      control?.dispose()
      editor.dispose()
    },
  })
}

function codeEditorProps<Args extends object>(
  input: GraphJsonStoryInput<Args>,
  args: Args,
) {
  return Object.freeze({
    value: JSON.stringify(input.value(args), null, 2),
    readOnly: true as const,
    languageId: "json",
    path: `${input.id}.json`,
    showLineNumbers: true,
    title: input.title,
    className: "graph-json__editor",
  })
}

function createControl<Args extends object>(
  document: Document,
  definition: GraphBooleanControl<Args> | GraphSelectControl<Args>,
  args: () => Args,
  update: (patch: Partial<Args>) => void,
): Readonly<{element: HTMLElement; dispose(): void}> {
  const label = document.createElement("label")
  const labelText = document.createElement("span")
  const description = document.createElement("span")
  label.className = "graph-json__control"
  labelText.className = "graph-json__control-label"
  description.className = "graph-json__control-description"
  labelText.append(definition.label)
  description.append(definition.description)

  if (definition.kind === "boolean") {
    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = Boolean(args()[definition.key])
    input.setAttribute("data-control-key", definition.key)
    const onChange = (): void => {
      update({[definition.key]: input.checked} as Partial<Args>)
    }
    input.addEventListener("change", onChange)
    label.append(input, labelText, description)
    return Object.freeze({
      element: label,
      dispose() { input.removeEventListener("change", onChange) },
    })
  }

  const select = document.createElement("select")
  select.setAttribute("data-control-key", definition.key)
  for (const item of definition.options) {
    const option = document.createElement("option")
    option.value = item.value
    option.append(item.label)
    select.appendChild(option)
  }
  select.value = String(args()[definition.key] ?? "")
  const onChange = (): void => {
    update({[definition.key]: select.value} as Partial<Args>)
  }
  select.addEventListener("change", onChange)
  label.append(labelText, select, description)
  return Object.freeze({
    element: label,
    dispose() { select.removeEventListener("change", onChange) },
  })
}
