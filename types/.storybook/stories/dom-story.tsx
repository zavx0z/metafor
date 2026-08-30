import type {
  Document,
  HTMLElement,
} from "@zavx0z/dom"
import {
  CodeEditor,
  type CodeEditorProps,
} from "@ui/components/code-editor"
import {Checkbox} from "@ui/components/checkbox"
import {EnumInput} from "@ui/components/enum-input"
import {
  createRoot,
  useState,
  type ComponentRoot,
} from "@zavx0z/react"
import {
  graphJsonStorySource,
  type GraphDomStorySource,
} from "./source.ts"

export type GraphDomStory<Args extends object = Readonly<Record<string, unknown>>> = Readonly<{
  element: HTMLElement
  componentRoot: Pick<ComponentRoot, "readStyleSheets">
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

type AnyGraphJsonStoryInput = GraphJsonStoryInput<Record<string, unknown>>

type GraphJsonPresentationProps = Readonly<{
  input: AnyGraphJsonStoryInput
  onArgsChange(args: Readonly<Record<string, unknown>>): void
}>

function GraphJsonPresentation(props: GraphJsonPresentationProps) {
  const [args, setArgs] = useState<Readonly<Record<string, unknown>>>(
    Object.freeze({...props.input.defaultArgs}),
  )
  const update = (key: string, value: unknown): void => {
    const next = Object.freeze({...args, [key]: value})
    setArgs(next)
    props.onArgsChange(next)
  }
  const editor = codeEditorProps(props.input, args)
  const control = props.input.control
  return <section
    data-story={props.input.id}
    data-control-kind={control?.kind}
    style={css`
      & {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        gap: 4px;
        padding: 6px;
        color: var(--widget-box-content);
      }
    `}
  >
    <h2 style={css`
      & {
        display: block;
        margin: 0;
        color: var(--widget-box-content);
        font-size: var(--font-size-md);
        line-height: 18px;
      }
    `}>{props.input.title}</h2>
    <div
      hidden={control === undefined}
      style={css`
        & {
          display: flex;
          flex-direction: row;
          min-height: 28px;
          gap: 4px;
        }
        &[hidden] { display: none; }
      `}
    >
      {control?.kind === "boolean"
        ? <GraphBooleanControlView definition={control} args={args} onChange={update} />
        : null}
      {control?.kind === "select"
        ? <GraphSelectControlView definition={control} args={args} onChange={update} />
        : null}
    </div>
    <div style={css`
      & {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex-grow: 1;
      }
    `}>
      <CodeEditor
        value={editor.value}
        readOnly={true}
        languageId={editor.languageId}
        path={editor.path}
        showLineNumbers={editor.showLineNumbers}
        title={editor.title}
        style={css`
          & {
            width: 100%;
            height: 100%;
            min-height: 0;
            flex-grow: 1;
          }
        `}
      />
    </div>
  </section>
}

type GraphControlViewProps = Readonly<{
  definition: GraphBooleanControl<Record<string, unknown>> | GraphSelectControl<Record<string, unknown>>
  args: Readonly<Record<string, unknown>>
  onChange(key: string, value: unknown): void
}>

function GraphBooleanControlView(props: GraphControlViewProps) {
  const definition = props.definition as GraphBooleanControl<Record<string, unknown>>
  const onChange = (checked: boolean): void => props.onChange(definition.key, checked)
  return <label
    data-control-key={definition.key}
    style={css`
      & {
        display: flex;
        flex-direction: row;
        align-items: center;
        min-height: 28px;
        gap: 4px;
        padding: 2px 4px;
        background: var(--space-node-navigation-background);
      }
    `}
  >
    <span style={css`
      & { display: block; color: var(--widget-box-content); font-size: var(--font-size-xs); }
    `}>{definition.label}</span>
    <Checkbox
      checked={Boolean(props.args[definition.key])}
      title={definition.description}
      onChange={onChange}
      style={css`& { flex-shrink: 0; }`}
    />
    <span style={css`
      & { display: block; color: var(--widget-text-content-readonly); font-size: var(--font-size-2xs); }
    `}>{definition.description}</span>
  </label>
}

function GraphSelectControlView(props: GraphControlViewProps) {
  const definition = props.definition as GraphSelectControl<Record<string, unknown>>
  const onChange = (value: string): void => props.onChange(definition.key, value)
  return <label
    data-control-key={definition.key}
    style={css`
      & {
        display: flex;
        flex-direction: row;
        align-items: center;
        min-height: 28px;
        gap: 4px;
        padding: 2px 4px;
        background: var(--space-node-navigation-background);
      }
    `}
  >
    <span style={css`
      & { display: block; color: var(--widget-box-content); font-size: var(--font-size-xs); }
    `}>{definition.label}</span>
    <EnumInput
      value={String(props.args[definition.key] ?? "")}
      options={definition.options.map((item) => ({
        key: item.value,
        value: item.value,
        label: item.label,
      }))}
      title={definition.description}
      onChange={onChange}
      style={css`& { width: 160px; height: 24px; }`}
    />
    <span style={css`
      & { display: block; color: var(--widget-text-content-readonly); font-size: var(--font-size-2xs); }
    `}>{definition.description}</span>
  </label>
}

/** Creates one stable semantic JSON presentation under one real ComponentRoot. */
export function createGraphJsonStory<Args extends object>(
  document: Document,
  input: GraphJsonStoryInput<Args>,
): GraphDomStory<Args> {
  const staging = document.createElement("div")
  const componentRoot = createRoot(staging)
  let currentArgs = Object.freeze({...input.defaultArgs}) as Args
  let disposed = false
  componentRoot.render(<GraphJsonPresentation
    input={input as unknown as AnyGraphJsonStoryInput}
    onArgsChange={(next) => { currentArgs = next as Args }}
  />)
  const element = staging.firstElementChild as HTMLElement | null
  if (element === null || element.getAttribute("data-story") !== input.id) {
    componentRoot.unmount()
    throw new Error(`Graph JSON story did not mount: ${input.id}`)
  }
  staging.removeChild(element)

  return Object.freeze({
    element,
    componentRoot,
    get args() { return currentArgs },
    get source() {
      return graphJsonStorySource({
        element,
        typescript: input.typescript(currentArgs),
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      componentRoot.unmount()
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
  })
}
