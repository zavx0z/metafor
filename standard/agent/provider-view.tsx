import {useEffect, useMemo, useState} from "@zavx0z/immersive/XReact"
import {Button, Panel, SelectField, Typography} from "@zavx0z/immersive/ui"
import {CapsuleRtcMediaController, type CapsuleRtcMediaSnapshot} from "@capsule/webrtc/media"
import type {CapsuleRtcInputController} from "@capsule/webrtc/input"
import type {AtomContext, AtomViewSnapshot, AtomBrowserConnection} from "./atom"
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import {useProvider, sameProviderBinding} from "./provider"
import {connectProviderBrowserPreview, type ProviderBrowserPreview, type ProviderBrowserPreviewSnapshot} from "./browser-preview"
import {bindProviderBrowserInput} from "./browser-input"
import {AgentProfileControls} from "./profile-view"

/** Canonical provider connections and a granted RTC session remain inside the passed Atom's existing Display. */
export function AgentProviderConnections(props: Readonly<{atom: AtomContext; snapshot: AtomViewSnapshot; active: boolean}>) {
  const provider = useProvider(props.atom)
  return <ProviderBrowserConnections
    ownerKey={props.atom.ref}
    snapshot={props.snapshot}
    active={props.active}
    connectBrowser={props.atom.actions.connectBrowser ? provider.connectBrowser : undefined}
    profileIntent={props.atom.actions.profileIntent}
  />
}

export function ProviderBrowserConnections(props: Readonly<{
  ownerKey: string
  snapshot: Pick<AtomViewSnapshot, "providers" | "profileTargets" | "profileError">
  active: boolean
  connectBrowser?: ((entryId: string, signal: AbortSignal) => Promise<AtomBrowserConnection>) | undefined
  profileIntent?: AtomContext["actions"]["profileIntent"] | undefined
}>) {
  const lifetime = useMemo(() => new AbortController(), [props.ownerKey])
  const session = useMemo(() => ({abort: null as AbortController | null, preview: null as ProviderBrowserPreview | null,
    input: null as CapsuleRtcInputController | null, entryId: null as string | null, binding: null as ProviderBinding | null}), [props.ownerKey])
  const alive = useMemo(() => ({active: true}), [])
  useEffect(() => () => {alive.active = false}, [])
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [sink, setSink] = useState<HTMLTextAreaElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserId, setBrowserId] = useState("")
  const [preview, setPreview] = useState<ProviderBrowserPreviewSnapshot | null>(null)
  const [mediaState, setMediaState] = useState<CapsuleRtcMediaSnapshot | null>(null)
  const bindVideo = useMemo(() => (value: HTMLVideoElement | null) => setVideo(value), [])
  const bindSink = useMemo(() => (value: HTMLTextAreaElement | null) => setSink(value), [])
  const media = useMemo(() => video === null ? null : new CapsuleRtcMediaController(video, {onState: state => {
    if (alive.active) setMediaState(state)
  }}), [video])
  const disconnect = () => {
    session.input?.close()
    session.input = null
    session.abort?.abort()
    session.abort = null
    session.preview = null
    session.entryId = null
    session.binding = null
    media?.clear()
    setPreview(null)
    setBusy(false)
  }
  useEffect(() => () => {
    lifetime.abort()
    session.input?.close()
    session.abort?.abort()
  }, [lifetime])
  useEffect(() => () => media?.clear(), [media])
  useEffect(() => {
    if (!props.active) disconnect()
  }, [props.active])
  useEffect(() => {
    if (session.entryId !== null) {
      const current = props.snapshot.providers?.registry.entries.find(entry => entry.id === session.entryId)
      if (!current || session.binding !== null && !sameProviderBinding(current, session.binding)) disconnect()
    }
  }, [props.snapshot.providers])
  const connect = async (entryId: string) => {
    if (!props.active || !video || !sink || !media || busy) return
    disconnect()
    const active = new AbortController()
    session.abort = active
    session.entryId = entryId
    const signal = AbortSignal.any([active.signal, lifetime.signal])
    setBusy(true)
    setNotice("")
    try {
      const connection = await props.connectBrowser!(entryId, signal)
      const view = await connectProviderBrowserPreview({connection, media, origin: globalThis.location.origin, signal,
        onState: state => {
          if (signal.aborted) return
          session.input?.setEnabled(state.controlReady)
          setPreview(state)
        }})
      if (signal.aborted) {
        await view.close()
        return
      }
      session.preview = view
      session.binding = connection.binding
      session.input = bindProviderBrowserInput({video, sink, send: command => view.sendTransient(command)})
      session.input.setEnabled(view.snapshot().controlReady)
      setPreview(view.snapshot())
    } catch (error) {
      if (!signal.aborted) setNotice(error instanceof Error ? error.message : "Предпросмотр недоступен")
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  const registry = props.snapshot.providers?.registry
  const entries = registry?.entries ?? []
  const browsers = entries.filter(entry => entry.capabilities.browserPreview)
  const selectedBrowser = browserId || (browsers.length === 1 ? browsers[0]!.id : "")
  return <section
    aria-label="Подключения Provider"
    style={css`
      display: flex;
      flex-direction: column;
      min-height: 0;
      gap: var(--spacing-8);
    `}
  >
    <AgentProfileControls
      targets={props.snapshot.profileTargets ?? []}
      error={props.snapshot.profileError}
      intent={props.profileIntent}
      beforeIntent={operation => {if (operation === "profile.open") disconnect()}}
    />
    <Panel label="Браузер" expanded={browserOpen} onToggle={open => {setBrowserOpen(open); if (!open) disconnect()}}>
      <ProviderBrowserBody canConnect={props.connectBrowser !== undefined} busy={busy} selectedBrowser={selectedBrowser} browsers={browsers} setBrowserId={setBrowserId} connect={connect}
        bindVideo={bindVideo} bindSink={bindSink} preview={preview} mediaState={mediaState} media={media} disconnect={disconnect} notice={notice}
        toggleMicrophone={() => {void session.preview?.toggleMicrophone().catch(error => {if (alive.active) setNotice(error instanceof Error ? error.message : "Микрофон недоступен")})}} />
    </Panel>
  </section>
}

function ProviderBrowserBody(props: Readonly<{
  canConnect: boolean; busy: boolean; selectedBrowser: string; browsers: readonly ProviderBinding[]; setBrowserId(value: string): void; connect(id: string): Promise<void>
  bindVideo(value: HTMLVideoElement | null): void; bindSink(value: HTMLTextAreaElement | null): void
  preview: ProviderBrowserPreviewSnapshot | null; mediaState: CapsuleRtcMediaSnapshot | null; media: CapsuleRtcMediaController | null
  disconnect(): void; toggleMicrophone(): void; notice: string
}>) {
  const {busy, selectedBrowser, browsers, setBrowserId, connect, bindVideo, bindSink, preview, mediaState, media, disconnect, notice} = props
  return <div style={css`display: flex; flex-direction: column; gap: var(--spacing-8);`}>
    <SelectField label="Подключение браузера" value={selectedBrowser}
      options={[{key: "none", value: "", label: "Выберите подключение"}, ...browsers.map(entry => ({key: entry.id, value: entry.id, label: entry.service}))]}
      disabled={busy || !props.canConnect} onChange={setBrowserId} />
    <Button label="Открыть просмотр" disabled={busy || !selectedBrowser || !props.canConnect}
      onClick={() => {void connect(selectedBrowser)}} />
    <div
      data-provider-browser="true"
      style={css`
        position: relative;
        width: 100%;
        min-height: 160px;
      `}
    >
      <video
        ref={bindVideo}
        aria-label="WebRTC браузер Provider"
        autoplay={true}
        muted={true}
        playsInline={true}
        tabIndex={0}
        style={css`
          display: block;
          width: 100%;
          height: 340px;
          object-fit: contain;
          background: #05070a;
        `}
      />
      <textarea
        ref={bindSink}
        aria-label="Ввод в WebRTC браузер"
        autocomplete="off"
        spellcheck={false}
        style={css`
          position: absolute;
          left: 0;
          top: 0;
          width: 1px;
          height: 1px;
          min-width: 1px;
          min-height: 1px;
          opacity: 0;
          pointer-events: none;
        `}
      />
    </div>
    <Typography text={busy ? "Получение разрешённой сессии…" : preview
      ? preview.description.profile
      : "Просмотр уже запущенного браузера"} />
    <Typography text={notice || preview?.error || preview?.viewer?.controlError || preview?.viewer?.error || mediaState?.error || ""} />
    <nav
      aria-label="Управление WebRTC подключением"
      style={css`
        display: flex;
        gap: var(--spacing-8);
      `}
    >
      <Button
        label="Отключить просмотр"
        disabled={!busy && preview === null}
        onClick={disconnect}
      />
      <Button
        label={mediaState?.muted === false ? "Выключить звук" : "Включить звук"}
        disabled={preview?.description.media?.audio !== true}
        onClick={() => media?.setMuted(mediaState?.muted === false)}
      />
      <Button
        label={preview?.microphone?.status === "on" ? "Выключить микрофон" : "Включить микрофон"}
        disabled={!preview?.microphone?.transportReady || preview.microphone.status === "requesting"}
        onClick={props.toggleMicrophone}
      />
    </nav>
  </div>
}
