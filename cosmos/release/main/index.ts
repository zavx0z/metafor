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

import {observeBrowserNetwork} from "./network"

const DEFAULT_FONT_META_NAME = "engine-default-font"
if (document.querySelector(`meta[name="${DEFAULT_FONT_META_NAME}"]`) === null) {
  const declaration = document.createElement("meta")
  declaration.name = DEFAULT_FONT_META_NAME
  declaration.content = "/assets/fonts/jetbrains-mono-bold.ttf"
  document.head.append(declaration)
}

const {runtime, presentInfrastructure} = await import("@internal/visual")
let stopObserving = observeBrowserNetwork(presentInfrastructure)
addEventListener("pagehide", () => stopObserving())
window.addEventListener("pageshow", event => {
  if (event.persisted) stopObserving = observeBrowserNetwork(presentInfrastructure)
})
console.debug("[@cosmos/release:main]", "Visual runtime подключён", {
  runtime: Object.keys(runtime),
})
