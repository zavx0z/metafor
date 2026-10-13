import {useMemo, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import {useAtom, type AtomContext} from "../../atom"
import Preferences, {type StorybookChatPreferences} from "@zavx0z/storybook-chat-preferences"

/** Проверка exact public widget, без Storybook HTTP и без локальной копии формы. */
export function PreferencesFixture(props: StorybookChatPreferences.Input) {
  return <Preferences selection={props.selection} effective={props.effective} sources={props.sources} connections={props.connections}
    settings={props.settings} inheritLabel={props.inheritLabel} busy={props.busy} fields={props.fields} disabledFields={props.disabledFields} onChange={props.onChange} />
}

/** Настоящий compiled component расширяет tools outlet; свой локальный state переживает parent updates. */
export function ToolExtension(props: Readonly<{atom: AtomContext}>) {
  const atom = useAtom(props.atom)
  const source = useMemo(() => ({
    subscribe: (listener: () => void) => atom.subscribe(listener),
    getSnapshot: () => atom.getSnapshot(),
  }), [atom])
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const [count, setCount] = useState(0)
  return <button
    data-tools-extension={atom.ref}
    onClick={() => setCount(value => value + 1)}
  >{snapshot.revision}:{count}</button>
}
