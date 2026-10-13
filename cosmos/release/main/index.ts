/**
Window entrypoint действующего release.

Он подключает выбранную visual capability как часть уже проверенного
composition. Смысл состава принадлежит
[release owner law](../README.md#что-называется-выпуском).

Перед visual import release гарантирует inert document declaration для
Engine-owned default font. Уже объявленный custom/default URL остаётся
authoritative; fallback нужен только Window с ранее cached root HTML.

@packageDocumentation
*/

import {createBrowserClient} from "./clients"
import type {ClientViewAction, ClientViewInspection} from "@metafor/types/cosmos/client"
import {observeBrowserNetwork} from "./network"
import {createAgentWorkspace} from "./agents"
import {createProductRouter} from "./router"

let controls: {inspect(): ClientViewInspection; act(action: ClientViewAction): unknown} | null = null
let diagnostics: typeof import("@internal/visual")["clientDiagnostics"] | null = null
const client = createBrowserClient({
  diagnostics(request, signal) {
    if (!diagnostics) throw new Error("Visual is not ready")
    return diagnostics.diagnostics(request, signal)
  },
  capture(signal) {
    if (!diagnostics) throw new Error("Visual is not ready")
    return diagnostics.capture(signal)
  },
  inspect: () => controls?.inspect() ?? null,
  act(action, signal) {
    signal.throwIfAborted()
    if (!controls) throw new Error("Visual is not ready")
    return controls.act(action)
  },
})
client.start()
client.setPhase("visual.pending")
try {
  const DEFAULT_FONT_META_NAME = "engine-default-font"
  if (document.querySelector(`meta[name="${DEFAULT_FONT_META_NAME}"]`) === null) {
    const declaration = document.createElement("meta")
    declaration.name = DEFAULT_FONT_META_NAME
    declaration.content = "/assets/fonts/jetbrains-mono-bold.ttf"
    document.head.append(declaration)
  }

  const {runtime, presentInfrastructure, connectAgents, clientControls, clientDiagnostics, connectAnnotationFeedback, presentAtomRoute, connectAtomNavigation} = await import("@internal/visual")
  controls = clientControls
  diagnostics = clientDiagnostics
  const disconnectFeedback = connectAnnotationFeedback({source: client.getDescriptor, send: client.feedback})
  const agents = createAgentWorkspace()
  const disconnectAgents = connectAgents(agents)
  const router = createProductRouter({source: {
    getSnapshot() {
      const snapshot = agents.getSnapshot()
      return {status: snapshot.status === "error" ? "unavailable" as const : snapshot.status, graph: snapshot.graph, verseId: snapshot.verseId,
        ...(snapshot.observedWorld ? {observedWorld: snapshot.observedWorld} : {}), ...(snapshot.error ? {error: snapshot.error} : {})}
    },
    subscribe: agents.subscribe,
  }, applyRoute(route, context) {
    if (context.cause === "presentation") return
    if (route.kind === "atom") presentAtomRoute({kind: "atom", ref: route.ref})
    else if (route.kind === "networks") presentAtomRoute(route)
    else presentAtomRoute({kind: "unavailable", message: route.kind === "loading" ? "Загрузка Verse…" : route.kind === "noSuchAtom" ? `Atom ${route.atomId ?? ""} не найден в Verse` : route.kind === "noSuchVerse" ? `Verse ${route.verseId} не подключена` : route.kind === "unavailable" ? route.error : "Адрес не соответствует Verse и Atom"})
  }})
  const disconnectNavigation = connectAtomNavigation({
    atom(ref) {
      const verseId = agents.getSnapshot().verseId
      if (verseId) router.navigate({kind: "atom", verseId, atomId: ref.slice(5)})
    },
    networks() {router.navigate({kind: "networks"})},
  })
  router.start()
  let stopObserving = observeBrowserNetwork(presentInfrastructure)
  let stopAgents = agents.start()
  addEventListener("pagehide", (event: PageTransitionEvent) => {
    stopObserving()
    stopAgents()
    if (!event.persisted) {
      disconnectNavigation()
      router.dispose()
      clientControls.dispose()
      disconnectFeedback()
      disconnectAgents()
      agents.dispose()
    }
  })
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      stopObserving = observeBrowserNetwork(presentInfrastructure)
      stopAgents = agents.start()
    }
  })
  console.debug("[@cosmos/release:main]", "Visual runtime подключён", {
    runtime: Object.keys(runtime),
  })
  client.setPhase("ready")
} catch (error) {
  client.fail(error)
  throw error
}
