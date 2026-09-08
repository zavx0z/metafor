/**
Browser entrypoint готовой визуальной среды Cosmos.

Release предоставляет native Canvas и declaration default font. Visual
подключает свой декларативный App через Browser createRoot/render; готовый runtime
экспортируется после первого представленного кадра. Его unmount освобождает
компоненты, browser lifecycle и объявленные App stylesheet links.

Пользовательский [закон визуальной среды](../README.md#визуальная-среда-main)
отделяет эту инфраструктуру от смысла показываемых Quantum/metafor данных.
Сценарии проверяют [Visual App](./app.spec.ts) и
[граница Cosmos](../../../tests/ham-005.boundary.spec.ts).

@packageDocumentation
*/

import {createRoot} from "@zavx0z/browser"
import {inspectRoot} from "@zavx0z/browser/diagnostics"
import {App} from "./app.tsx"

/** Точный browser environment этого platform entrypoint. */
export const environment = "main" as const

const canvas = globalThis.document.getElementById("visual-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Window visual canvas #visual-canvas is missing")
const packageVersion = import.meta.env.COSMOS_PACKAGE_VERSION
if (typeof packageVersion !== "string" || packageVersion.length === 0) {
  throw new Error("Window visual package version is missing")
}

/** Управление единственным приложением; render обновляет его без потери состояния. */
export const root = createRoot(canvas)
root.render(<App />)

/** Release наблюдает первый кадр через диагностику того же root. */
export const runtime = await inspectRoot(root).whenReady()

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  viewPoint: runtime.viewPoint,
  display: runtime.document.querySelector("display"),
  dock: runtime.document.getElementById("main-display-dock"),
})
