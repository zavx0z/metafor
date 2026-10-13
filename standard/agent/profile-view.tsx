import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {Button, SelectField, Typography} from "@zavx0z/immersive/ui"
import type {ProfileIntentRequest, ProfileOperation, ProfileTargetDescriptor} from "@metafor/types/metafor/profile-intent"

/** Explicit intentions address actual assigned owning Meta; admission never claims a completed immutable save. */
export function AgentProfileControls(props: Readonly<{
  targets: readonly ProfileTargetDescriptor[]
  error?: string | null | undefined
  intent?: ((request: ProfileIntentRequest, signal: AbortSignal) => Promise<void>) | undefined
  beforeIntent?: ((operation: ProfileOperation) => void) | undefined
}>) {
  const lifetime = useMemo(() => new AbortController(), [props.intent])
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState("")
  const [selected, setSelected] = useState("")
  const key = (target: ProfileTargetDescriptor) => JSON.stringify([target.worldIdentity, target.atomRef])
  const target = props.targets.find(target => key(target) === selected) ?? (!selected && props.targets.length === 1 ? props.targets[0] : undefined)
  useEffect(() => {
    setPending(false)
    setNotice("")
    return () => lifetime.abort()
  }, [lifetime])
  const act = async (target: ProfileTargetDescriptor, operation: Exclude<ProfileOperation, "profile.reconfigure">) => {
    if (pending || !target.available || !target.supportedOperations.includes(operation) || !props.intent) return
    setPending(true)
    setNotice("")
    props.beforeIntent?.(operation)
    try {
      await props.intent({id: crypto.randomUUID(), operation, target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile}, lifetime.signal)
      if (!lifetime.signal.aborted) setNotice("Намерение принято. Завершение наблюдается в состоянии владельца профиля.")
    } catch (error) {
      if (!lifetime.signal.aborted) setNotice(error instanceof Error ? error.message : "Операция профиля недоступна")
    } finally {
      if (!lifetime.signal.aborted) setPending(false)
    }
  }
  return <section
    aria-label="Сохранённые профили браузера"
    style={css`
      display: flex;
      flex-direction: column;
      gap: var(--spacing-8);
    `}
  >
    <SelectField label="Профиль" value={target ? key(target) : ""} options={[
      {key: "none", value: "", label: props.targets.length ? "Выберите профиль" : "Профили не назначены"},
      ...props.targets.map(target => ({key: key(target), value: key(target), label: target.expectedProfile.name})),
    ]} disabled={pending || props.targets.length === 0} onChange={setSelected} />
    <div style={css`display: flex; flex-wrap: wrap; gap: var(--spacing-8);`}>
    <Button
      label="Открыть профиль"
      disabled={pending || props.intent === undefined || !target?.available || !target.supportedOperations.includes("profile.open")}
      onClick={() => {if (target) void act(target, "profile.open")}}
    />
    <Button
      label="Сохранить профиль"
      disabled={pending || props.intent === undefined || !target?.available || !target.supportedOperations.includes("profile.save")}
      onClick={() => {if (target) void act(target, "profile.save")}}
    />
    </div>
    {notice || props.error ? <Typography text={notice || props.error || ""} /> : null}
  </section>
}
