import {type Document, type DOMComponentConstructor} from "@zavx0z/immersive"
import {useRef, useState} from "@zavx0z/immersive/XReact"
import {Button, SelectField, TextField, Typography} from "@zavx0z/immersive/ui"
import createPresentation from "@zavx0z/storybook-app-web-page-presentation"
import type {DevelopmentAgentProfile, DevelopmentAgentProfileUpdate} from "../../../release/shared/development-agent"

type Props = Readonly<{profile: DevelopmentAgentProfile, onSave(update: DevelopmentAgentProfileUpdate): Promise<void>}>

/** Собственный semantic элемент настроек переносится внутри shared pinned Chat того же Document. */
export function createDevelopmentAgentSettings(document: Document, props: Props) {
  const component = DevelopmentAgentSettings as unknown as DOMComponentConstructor<Props>
  const view = createPresentation(document, component, props, "[data-development-agent-settings]")
  return {element: view.element, update(profile: DevelopmentAgentProfile) {view.componentRoot.render(component, {...props, profile})}, dispose: view.dispose}
}

export function DevelopmentAgentSettings(props: Props) {
  const [open, setOpen] = useState(false)
  return <section
    data-development-agent-settings=""
    style={css`
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      padding: var(--spacing-4);
    `}
  >
    <Button label={`Настройки агента · ${props.profile.name}`} onClick={() => setOpen(value => !value)} />
    {open ? <DevelopmentAgentSettingsForm profile={props.profile} onSave={props.onSave} /> : null}
  </section>
}

function DevelopmentAgentSettingsForm(props: Props) {
  const [draft, setDraft] = useState<DevelopmentAgentProfileUpdate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const working = useRef(false)
  const update = (value: Partial<Pick<DevelopmentAgentProfileUpdate, "name" | "gender">>) => setDraft(current => ({
    expectedRevision: props.profile.revision, expectedName: props.profile.name, name: props.profile.name,
    gender: props.profile.gender, ...current, ...value,
  }))
  return <section style={css`
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  `}>
    <TextField label="Имя агента" value={draft?.name ?? props.profile.name} disabled={busy} onInput={name => update({name})} />
    <SelectField
      label="Пол"
      value={draft?.gender ?? props.profile.gender}
      disabled={busy}
      options={[{key: "male", value: "male", label: "Мужской"}, {key: "female", value: "female", label: "Женский"}]}
      onChange={gender => {if (gender === "male" || gender === "female") update({gender})}}
    />
    <Button
      label="Сохранить настройки агента"
      disabled={busy || !draft || !draft.name.trim()}
      onClick={() => {
        if (!draft || working.current) return
        working.current = true
        setBusy(true)
        void props.onSave({...draft, name: draft.name.trim()}).then(() => {setDraft(null); setError("")}, cause => {
          // expectedName/revision остаются исходными для явного завершения partial rename.
          setError(cause instanceof Error ? cause.message : String(cause))
        }).finally(() => {working.current = false; setBusy(false)})
      }}
    />
    <Button label="Отменить изменения" disabled={busy || !draft} onClick={() => {setDraft(null); setError("")}} />
    <Typography text={error} />
  </section>
}
