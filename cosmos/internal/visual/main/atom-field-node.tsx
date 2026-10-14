import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {ParameterNode} from "@zavx0z/immersive/nodes/node"
import {CheckboxParameter, NumberParameter, SelectParameter, TextParameter} from "@zavx0z/immersive/nodes/parameter"
import Socket from "@zavx0z/immersive/nodes/socket"
import {Button, Typography} from "@zavx0z/immersive/ui"
import {iconSvg} from "@zavx0z/immersive/ui/icons"
import type {MetaField, RuntimeAtom} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel} from "./agent-workspace"
import type {AgentFieldUpdate, AgentFieldValue} from "./agent-workspace-types"

const saveIcon = iconSvg('<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>')

type FieldDraft = Readonly<{
  value: AgentFieldValue
  expectedValue: AgentFieldValue
  text?: string | undefined
  error?: string | undefined
}>

function fieldValue(value: unknown): AgentFieldValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value) && value.every((item): item is number => typeof item === "number" && Number.isFinite(item))) return value.slice()
  return undefined
}

function sameValue(left: AgentFieldValue, right: AgentFieldValue): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right
}

/** Готовая нода текущего Display; черновики живут до общей записи либо размонтирования Atom. */
export function AtomFieldNode(props: Readonly<{
  atom: RuntimeAtom
  fields: readonly MetaField[]
  workspace: Pick<AgentWorkspaceModel, "saveFields">
  signal: AbortSignal
}>) {
  const lifetime = useMemo(() => new AbortController(), [])
  const signal = useMemo(() => AbortSignal.any([props.signal, lifetime.signal]), [props.signal, lifetime])
  useEffect(() => () => lifetime.abort(), [lifetime])
  const [drafts, setDrafts] = useState<ReadonlyMap<string, FieldDraft>>(new Map())
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const invalid = [...drafts.values()].some(draft => draft.error !== undefined)
  const change = (field: MetaField, value: AgentFieldValue, text?: string, error?: string) => {
    const observed = fieldValue(props.atom.values[field.key])
    if (busy || signal.aborted || observed === undefined) return
    setDrafts(previous => {
      const next = new Map(previous)
      const previousDraft = previous.get(field.key)
      const expectedValue = previousDraft ? previousDraft.expectedValue : observed
      if (!error && sameValue(value, expectedValue)) next.delete(field.key)
      else next.set(field.key, {value, expectedValue, text, error})
      return next
    })
    setNotice("")
  }
  const changeArray = (field: MetaField, text: string) => {
    let value: unknown
    try {value = JSON.parse(text)} catch {}
    const parsed = fieldValue(value)
    const valid = Array.isArray(parsed)
    change(field, valid ? parsed : drafts.get(field.key)?.value ?? fieldValue(props.atom.values[field.key]) ?? null,
      text, valid ? undefined : "Введите JSON-массив конечных чисел, например [1, 2, 3]")
  }
  const save = async () => {
    if (busy || invalid || drafts.size === 0 || signal.aborted) return
    const updates: AgentFieldUpdate[] = [...drafts].map(([field, draft]) => ({field, value: draft.value, expectedValue: draft.expectedValue}))
    setBusy(true)
    setNotice("")
    try {
      await props.workspace.saveFields(props.atom.ref, updates, signal)
      if (!signal.aborted) {
        setDrafts(new Map())
        setNotice("Поля сохранены")
      }
    } catch (error) {
      if (!signal.aborted) setNotice(error instanceof Error ? error.message : "Сохранение не подтверждено")
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return <section
    aria-label="Поля Atom"
    style={css`
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: var(--spacing-8);
      padding: var(--spacing-8);
    `}
  >
    <ParameterNode
      id={props.atom.ref}
      label={props.atom.meta}
      title={props.atom.ref}
      embedded={true}
      category={busy ? "Сохранение…" : `Изменено: ${drafts.size}`}
      actions={[{
        id: "save",
        label: busy ? "Сохранение полей" : `Сохранить поля (${drafts.size})`,
        iconSrc: saveIcon,
        disabled: busy || invalid || drafts.size === 0,
        onClick: () => {void save()},
      }]}
    >
      {props.fields.map(field => <AtomParameterRow
        key={field.key}
        nodeId={props.atom.ref}
        field={field}
        observed={fieldValue(props.atom.values[field.key]) !== undefined}
        value={drafts.has(field.key) ? drafts.get(field.key)!.value : fieldValue(props.atom.values[field.key]) ?? null}
        text={drafts.get(field.key)?.text}
        error={drafts.get(field.key)?.error}
        busy={busy}
        onChange={value => change(field, value)}
        onArrayInput={text => changeArray(field, text)}
      />)}
    </ParameterNode>
    {drafts.size > 0 ? <Button
      label="Отменить изменения"
      disabled={busy}
      onClick={() => {setDrafts(new Map()); setNotice("")}}
    /> : null}
    <Typography text={notice} />
  </section>
}

function AtomParameterRow(props: Readonly<{
  nodeId: string
  field: MetaField
  observed: boolean
  value: AgentFieldValue
  text?: string | undefined
  error?: string | undefined
  busy: boolean
  onChange(value: AgentFieldValue): void
  onArrayInput(text: string): void
}>) {
  const disabled = props.busy || !props.observed
  const label = `${props.field.label ?? props.field.key}${!props.observed ? " · значение не наблюдается" : props.value === null ? " · не задано" : ""}`
  const kind = props.field.type === "number" ? "float" : props.field.type === "enum" ? "menu" : props.field.type === "array" ? "collection" : props.field.type
  return <section
    style={css`
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: var(--spacing-4);
    `}
  >
    {props.field.type === "string" || props.field.type === "array" ? <TextParameter
      id={props.field.key}
      nodeId={props.nodeId}
      label={label}
      value={props.field.type === "array" ? props.text ?? (props.value === null ? "" : JSON.stringify(props.value)) : typeof props.value === "string" ? props.value : ""}
      placeholder={props.field.type === "array" ? "[1, 2, 3]" : "Не задано"}
      disabled={disabled}
      onInput={value => props.field.type === "array" ? props.onArrayInput(value) : props.onChange(value)}
    >
      <Socket
        slot="left"
        id={`${props.field.key}:in`}
        nodeId={props.nodeId}
        kind={kind}
        direction="input"
        side="left"
        label={`Вход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
      <Socket
        slot="right"
        id={`${props.field.key}:out`}
        nodeId={props.nodeId}
        kind={kind}
        direction="output"
        side="right"
        label={`Выход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
    </TextParameter> : null}
    {props.field.type === "number" ? <NumberParameter
      id={props.field.key}
      nodeId={props.nodeId}
      label={label}
      value={typeof props.value === "number" ? props.value : 0}
      disabled={disabled}
      onInput={props.onChange}
      onChange={props.onChange}
    >
      <Socket
        slot="left"
        id={`${props.field.key}:in`}
        nodeId={props.nodeId}
        kind={kind}
        direction="input"
        side="left"
        label={`Вход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
      <Socket
        slot="right"
        id={`${props.field.key}:out`}
        nodeId={props.nodeId}
        kind={kind}
        direction="output"
        side="right"
        label={`Выход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
    </NumberParameter> : null}
    {props.field.type === "boolean" ? <CheckboxParameter
      id={props.field.key}
      nodeId={props.nodeId}
      label={label}
      checked={props.value === true}
      disabled={disabled}
      onChange={props.onChange}
    >
      <Socket
        slot="left"
        id={`${props.field.key}:in`}
        nodeId={props.nodeId}
        kind={kind}
        direction="input"
        side="left"
        label={`Вход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
      <Socket
        slot="right"
        id={`${props.field.key}:out`}
        nodeId={props.nodeId}
        kind={kind}
        direction="output"
        side="right"
        label={`Выход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
    </CheckboxParameter> : null}
    {props.field.type === "enum" ? <SelectParameter
      id={props.field.key}
      nodeId={props.nodeId}
      label={label}
      value={typeof props.value === "string" ? props.value : ""}
      options={props.field.values.map(value => ({key: value, value, label: value}))}
      disabled={disabled}
      onChange={props.onChange}
    >
      <Socket
        slot="left"
        id={`${props.field.key}:in`}
        nodeId={props.nodeId}
        kind={kind}
        direction="input"
        side="left"
        label={`Вход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
      <Socket
        slot="right"
        id={`${props.field.key}:out`}
        nodeId={props.nodeId}
        kind={kind}
        direction="output"
        side="right"
        label={`Выход ${props.field.label ?? props.field.key}`}
        disabled={true}
      />
    </SelectParameter> : null}
    {!props.field.required && props.value !== null && props.observed ? <Button
      label={`Очистить ${props.field.label ?? props.field.key}`}
      disabled={disabled}
      onClick={() => props.onChange(null)}
    /> : null}
    <Typography text={props.error ?? ""} />
  </section>
}
