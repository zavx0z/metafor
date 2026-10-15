import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import type {DOMComponentConstructor, Event, CustomEvent} from "@zavx0z/immersive"
import {Button, Typography} from "@zavx0z/immersive/ui"
import Workbench, {type StorybookAppWebPageShellWorkbench} from "@zavx0z/storybook-app-web-page-shell-workbench"
import Minimap from "@zavx0z/storybook-app-web-page-shell-minimap"
import createPresentation from "@zavx0z/storybook-app-web-page-presentation"
import type {DevelopmentCatalog, DevelopmentObserver, DevelopmentPackage} from "../../../release/shared/development"
import {createDevelopmentSocket, developmentChatFetcher, developmentSourceClient, readDevelopmentCatalog} from "./development-client"
import {DevelopmentDependencyGraph} from "./development-graph"
import {DevelopmentSource} from "./development-source"

type Model = StorybookAppWebPageShellWorkbench.Output
export type DevelopmentWorkbenchModel = Model
export type DevelopmentWorkbenchProps = Readonly<{
  active: boolean
  packageName: string | null
  width: number
  height: number
  observe: DevelopmentObserver
  navigate(name: string): void
  quantum(): void
  onReady?(model: Model): void
}>

/** Готовый Workbench в том же Space/Document; package presentations удерживают editor drafts. */
export function DevelopmentWorkbench(props: DevelopmentWorkbenchProps) {
  const [catalog, setCatalog] = useState<DevelopmentCatalog | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState("")
  const views = useRef(new Map<string, {view: ReturnType<typeof createPresentation>; dirty: boolean}>())
  const createSocket = useMemo(() => (_path: string) => createDevelopmentSocket(props.observe), [props.observe])
  const current = useRef(props)
  current.current = props
  const refresh = async (signal: AbortSignal, retry = false) => {
    try {const next = await readDevelopmentCatalog(signal, retry); if (!signal.aborted) {setCatalog(next); setError("")}}
    catch (cause) {if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))}
  }
  useEffect(() => {
    if (!props.active) return
    const scope = new AbortController()
    void refresh(scope.signal)
    return () => scope.abort()
  }, [props.active])
  useEffect(() => {
    if (!model) return
    const navigate = (event: Event) => {
      const item = (event as CustomEvent<{id: string}>).detail
      if (catalog?.packages.some(pkg => pkg.name === item.id)) current.current.navigate(item.id)
    }
    model.element.addEventListener(model.events.navigate, navigate)
    return () => model.element.removeEventListener(model.events.navigate, navigate)
  }, [model, catalog])
  useEffect(() => {
    if (!model || !catalog) return
    const selected = catalog.packages.find(pkg => pkg.name === (props.packageName ?? catalog.rootPackage))
    model.update("catalog.items", catalog.packages.map(pkg => ({id: pkg.name, label: pkg.label, route: pkg.address,
      searchText: pkg.name, ...(pkg.owner && pkg.owner !== pkg.name ? {parentId: pkg.owner} : {})})))
    model.update("catalog.active", selected?.name ?? null)
    if (!selected) {setError("Пакет отсутствует в назначенном каталоге"); return}
    let cached = views.current.get(selected.name)
    const summaryProps = {catalog, selected, navigate: props.navigate, sourceClient: developmentSourceClient,
      onDirtyChange(dirty: boolean) {const item = views.current.get(selected.name); if (item) item.dirty = dirty}}
    if (!cached) {
      if (views.current.size >= 32) {
        const evict = [...views.current].find(([name, value]) => name !== selected.name && !value.dirty)
        if (!evict) {setError("Сохраните открытые черновики перед открытием другого пакета"); return}
        evict[1].view.dispose(); views.current.delete(evict[0])
      }
      const view = createPresentation(model.document, DevelopmentPackageView as unknown as DOMComponentConstructor<typeof summaryProps>, summaryProps, "[data-development-package]")
      cached = {view, dirty: false}
      views.current.set(selected.name, cached)
    } else cached.view.componentRoot.render(DevelopmentPackageView as unknown as DOMComponentConstructor<typeof summaryProps>, summaryProps)
    model.present({label: selected.label, presentation: {node: cached.view.node, projection: "display"}, inspectorSubject: null, inspectorValues: {},
      ...(selected.resolution === "source" ? {chat: {address: selected.address, label: selected.label, fetcher: developmentChatFetcher, createSocket}} : {})})
    model.update("status", {lead: "Cosmos", owner: selected.name, detail: `${selected.resolution} · ${selected.writable ? "редактирование" : "чтение"}`})
  }, [model, catalog, props.packageName, props.navigate, createSocket])
  useEffect(() => () => {for (const item of views.current.values()) item.view.dispose(); views.current.clear()}, [])
  return <>
    <display
      id="cosmos-development-display"
      width={props.width * 25.4 / 96}
      height={props.height * 25.4 / 96}
      style={css`
        width: ${props.width}px;
        height: ${props.height}px;
        rotate: x 90deg;
        scale: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--widget-text-background);
        ${!props.active && css`
          display: none;
        `}
      `}
    >
      <nav style={css`
        display: flex;
        gap: var(--spacing-4);
        flex-shrink: 0;
      `}>
        <Typography text="Cosmos · Саморазработка" />
        <Button label="Quantum" onClick={props.quantum} />
        <Button label="Обновить каталог" onClick={() => {void refresh(new AbortController().signal, true)}} />
        {error ? <Typography text={error} /> : null}
      </nav>
      <Workbench
        displayId="cosmos-development-display"
        hudId="cosmos-development-hud"
        initial={{title: "Саморазработка Cosmos", projectName: "MetaFor", "catalog.label": "Пакеты", "catalog.management": null}}
        onReady={value => {setModel(value); current.current.onReady?.(value)}}
      />
    </display>
  </>
}

export function DevelopmentMinimap(props: {model: Model}) {
  const view = useSyncExternalStore(props.model.subscribe, props.model.getSnapshot)
  return <Minimap
    projectName="MetaFor · Пакеты"
    catalog={{label: view.state["catalog.label"], items: view.state["catalog.items"], activeId: view.state["catalog.active"],
      search: view.state["catalog.search"], management: null, onAction: view.onCatalogAction, onNavigate: view.onCatalogNavigate,
      onSearch: view.onCatalogSearch, onGroupToggle: view.onGroupToggle, navigationExpansion: view.navigationExpansion}}
  />
}
function DevelopmentPackageView(props: {catalog: DevelopmentCatalog; selected: DevelopmentPackage; navigate(name: string): void;
  sourceClient: typeof developmentSourceClient; onDirtyChange(dirty: boolean): void}) {
  const [tab, setTab] = useState<"graph" | "source">("graph")
  return <section data-development-package="" style={css`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  `}>
    <nav style={css`
      display: flex;
      gap: var(--spacing-4);
      flex-shrink: 0;
    `}>
      <Typography text={props.selected.name} />
      <Button label="Зависимости" onClick={() => setTab("graph")} />
      <Button label="Исходники" disabled={props.selected.resolution !== "source"} onClick={() => setTab("source")} />
    </nav>
    <div style={css`
      flex: 1;
      min-width: 0;
      min-height: 0;
      ${tab !== "graph" && css`
          display: none;
        `}
    `}>
      <DevelopmentDependencyGraph catalog={props.catalog} selectedPackage={props.selected.name} onSelectPackage={props.navigate} />
    </div>
    {props.selected.resolution === "source" ? <DevelopmentSourcePane selected={props.selected} active={tab === "source"} sourceClient={props.sourceClient} onDirtyChange={props.onDirtyChange} /> : null}
  </section>
}
function DevelopmentSourcePane(props: {selected: DevelopmentPackage; active: boolean;
  sourceClient: typeof developmentSourceClient; onDirtyChange(dirty: boolean): void}) {
  return <div style={css`
      flex: 1;
      min-width: 0;
      min-height: 0;
      ${!props.active && css`
          display: none;
        `}
    `}>
      <DevelopmentSource packageName={props.selected.name} writable={props.selected.writable} client={props.sourceClient} onDirtyChange={props.onDirtyChange} />
    </div>
}
