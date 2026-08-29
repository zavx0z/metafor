import type {
  Document,
  HTMLElement,
  HTMLInputElement,
  HTMLSelectElement,
} from "@zavx0z/dom"
import {
  CodeEditor,
  type CodeEditorProps,
} from "@ui/components/code-editor"
import {Checkbox} from "@ui/components/checkbox"
import {EnumInput} from "@ui/components/enum-input"
import {createRoot} from "@zavx0z/react"
import {
  graphJsonStorySource,
  type GraphDomStorySource,
} from "./source.ts"

export type GraphDomStory<Args extends object = Readonly<Record<string, unknown>>> = Readonly<{
  element: HTMLElement
  args: Args
  source: GraphDomStorySource
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

/** Creates one stable semantic JSON presentation with current production controls. */
export function createGraphJsonStory<Args extends object>(
  document: Document,
  input: GraphJsonStoryInput<Args>,
): GraphDomStory<Args> {
  const root = document.createElement("section")
  const heading = document.createElement("h2")
  const controls = document.createElement("div")
  const result = document.createElement("div")
  const editorRoot = createRoot(result)
  let currentArgs = Object.freeze({...input.defaultArgs}) as Args
  let disposed = false
  let control: GraphControl<Args> | null = null

  root.className = "graph-json"
  root.setAttribute("data-story", input.id)
  heading.className = "graph-json__title"
  heading.append(input.title)
  controls.className = "graph-json__controls"
  result.className = "graph-json__result"
  root.append(heading, controls, result)

  const renderEditor = (): void => {
    const props = codeEditorProps(input, currentArgs)
    editorRoot.render(<CodeEditor
      value={props.value}
      readOnly={true}
      languageId={props.languageId}
      path={props.path}
      showLineNumbers={props.showLineNumbers}
      title={props.title}
    />)
  }
  const update = (patch: Partial<Args>): void => {
    if (disposed) throw new Error(`Graph DOM story is disposed: ${input.id}`)
    currentArgs = Object.freeze({...currentArgs, ...patch}) as Args
    renderEditor()
    control?.update(currentArgs)
  }
  control = input.control === undefined
    ? null
    : createControl(document, input.control, () => currentArgs, update)
  if (control !== null) controls.appendChild(control.element)
  else controls.setAttribute("hidden", "")
  renderEditor()

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
      editorRoot.unmount()
    },
  })
}

function codeEditorProps<Args extends object>(
  input: GraphJsonStoryInput<Args>,
  args: Args,
): CodeEditorProps {
  return Object.freeze({
    value: JSON.stringify(input.value(args), null, 2),
    readOnly: true,
    languageId: "json",
    path: `${input.id}.json`,
    showLineNumbers: true,
    title: input.title,
    style: Object.freeze({
      width: "100%",
      height: "100%",
      minHeight: 0,
      flexGrow: 1,
    }),
  })
}

type GraphControl<Args extends object> = Readonly<{
  element: HTMLElement
  update(args: Args): void
  dispose(): void
}>

function createControl<Args extends object>(
  document: Document,
  definition: GraphBooleanControl<Args> | GraphSelectControl<Args>,
  args: () => Args,
  update: (patch: Partial<Args>) => void,
): GraphControl<Args> {
  const label = document.createElement("label")
  const labelText = document.createElement("span")
  const controlHost = document.createElement("span")
  const description = document.createElement("span")
  const controlRoot = createRoot(controlHost)
  label.className = "graph-json__control"
  labelText.className = "graph-json__control-label"
  description.className = "graph-json__control-description"
  labelText.append(definition.label)
  description.append(definition.description)
  label.append(labelText, controlHost, description)

  if (definition.kind === "boolean") {
    const render = (next: Args): void => {
      controlRoot.render(<Checkbox
        checked={Boolean(next[definition.key])}
        title={definition.description}
        onChange={(checked) => update({[definition.key]: checked} as Partial<Args>)}
      />)
      const element = controlHost.querySelector("input") as HTMLInputElement | null
      if (element === null) throw new Error(`Graph checkbox did not mount: ${definition.key}`)
      element.className = `${element.className} graph-json__control-input`.trim()
      element.setAttribute("data-control-key", definition.key)
    }
    render(args())
    return Object.freeze({
      element: label,
      update: render,
      dispose: () => controlRoot.unmount(),
    })
  }

  const render = (next: Args): void => {
    controlRoot.render(<EnumInput
      value={String(next[definition.key] ?? "")}
      options={definition.options.map((item) => ({
        key: item.value,
        value: item.value,
        label: item.label,
      }))}
      title={definition.description}
      onChange={(value) => update({[definition.key]: value} as Partial<Args>)}
    />)
    const element = controlHost.querySelector("select") as HTMLSelectElement | null
    if (element === null) throw new Error(`Graph enum did not mount: ${definition.key}`)
    element.className = `${element.className} graph-json__control-input`.trim()
    element.setAttribute("data-control-key", definition.key)
  }
  render(args())
  return Object.freeze({
    element: label,
    update: render,
    dispose: () => controlRoot.unmount(),
  })
}
