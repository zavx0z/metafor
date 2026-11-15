import {useEffect, useMemo, useRef, useState} from "@zavx0z/immersive/XReact"
import {Button, Typography} from "@zavx0z/immersive/ui"
import BrowserPreview, {type StorybookAppWebPageShellExecutionSettingsBrowserPreview as Preview} from "@zavx0z/storybook-app-web-page-shell-execution-settings-browser-preview"
import {createProviderSettingsClient, type ProviderBrowserAccess} from "./provider-hud"

type BrowserClient = Preview.Input["client"]

export type ProviderBrowserLoginProps = Readonly<{
  access: ProviderBrowserAccess
  connectionId: string
  visible: boolean
  /** Одно явное открытие; новое значение после закрытия снова раскрывает тот же viewer. */
  openRequest?: number | undefined
}>

/** Вход использует готовый BrowserPreview и Provider grant; native model session не создаётся. */
export function ProviderBrowserLogin(props: ProviderBrowserLoginProps) {
  const current = useRef(props.access)
  current.current = props.access
  const lifetime = useMemo(() => new AbortController(), [])
  const client = useMemo(() => createProviderSettingsClient(() => ({...current.current, open: false, onOpenChange() {}}), lifetime.signal), [lifetime])
  const accessKey = JSON.stringify([props.access.atom?.ref, props.access.registries?.map(value => value.ref)])
  const registryRevision = JSON.stringify([props.access.atom?.getSnapshot().providers?.registry.revision, props.access.registries?.map(value => [value.ref, value.registry.revision])])
  const [browser, setBrowser] = useState<"capsule" | "chrome-studio" | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const consumedRequest = useRef(0)
  useEffect(() => () => lifetime.abort(), [lifetime])
  useEffect(() => {setOpen(false)}, [props.connectionId, props.visible, accessKey])
  useEffect(() => {
    let active = true
    if (!props.visible || !props.connectionId) setBrowser(null)
    setError("")
    if (props.visible && props.connectionId) void client.read().then(document => {
      if (!active) return
      const connection = document.connections.find(row => row.id === props.connectionId && row.enabled)
      if (!connection) throw new Error("Выберите включённое подключение")
      setBrowser(connection.provider === "capsule" || connection.provider === "chrome-studio" ? connection.provider : null)
    }).catch(cause => {if (active) {setBrowser(null); setError(String(cause))}})
    return () => {active = false}
  }, [client, props.connectionId, props.visible, accessKey, registryRevision])
  useEffect(() => {
    const request = props.openRequest ?? 0
    if (props.visible && browser && request > 0 && request !== consumedRequest.current) {
      consumedRequest.current = request
      setOpen(true)
    }
  }, [props.openRequest, props.visible, browser])
  return <section
    data-provider-browser-login={props.connectionId}
    style={css`
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 8px;
    `}
  >
    {props.visible && browser ? <Button
      label={open ? "Закрыть браузер входа" : "Войти"}
      onClick={() => setOpen(value => !value)}
    /> : null}
    {props.visible && open && browser ? <ProviderLoginBrowser
      key={props.connectionId}
      provider={browser}
      connectionId={props.connectionId}
      client={client}
    /> : null}
    {props.visible && props.connectionId && !browser && !error ? <Typography text="Вход через браузер доступен для подключений Capsule и Chrome Studio." /> : null}
    {error ? <Typography text={error} /> : null}
  </section>
}

function ProviderLoginBrowser(props: Readonly<{provider: "capsule" | "chrome-studio"; connectionId: string; client: BrowserClient}>) {
  return <BrowserPreview
    provider={props.provider}
    connectionId={props.connectionId}
    available={true}
    initialOpen={true}
    initialControl={true}
    client={props.client}
  />
}

/** UI использует тип сохранённого подключения, а не текст ошибки или догадку об авторизации. */
export function isBrowserProviderConnection(access: ProviderBrowserAccess | undefined, connectionId: string | undefined): boolean {
  if (!access || !connectionId) return false
  const assigned = access.atom?.getSnapshot().providers
  const owner = assigned ?? (access.registries?.length === 1 ? access.registries[0] : undefined)
  if (!owner) return false
  const configuration = owner.registry.settings.configuration
  if (configuration) {
    const connection = configuration.connections.find(value => value.id === connectionId)
    return connection?.enabled === true && (connection.provider === "capsule" || connection.provider === "chrome-studio")
  }
  const entry = owner.registry.entries.find(value => value.id === connectionId)
  return entry?.resolution === "exact" && (entry.service === "qwen" || entry.service === "deepseek" || entry.service === "chatgpt")
}
