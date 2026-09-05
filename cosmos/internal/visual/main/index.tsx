/**
Browser entrypoint готовой визуальной среды Cosmos.

Release предоставляет native Canvas и declaration default font. Visual
подключает свой декларативный App через Browser attach; готовый runtime
экспортируется после первого представленного кадра. Его unmount освобождает
компоненты, browser lifecycle и объявленную здесь ссылку на тему.

Пользовательский [закон визуальной среды](../README.md#визуальная-среда-main)
отделяет эту инфраструктуру от смысла показываемых Quantum/metafor данных.
Сценарии проверяют [Visual App](./app.spec.ts) и
[граница Cosmos](../../../tests/ham-005.boundary.spec.ts).

@packageDocumentation
*/

import {attach} from "@zavx0z/browser"
import {VisualApp} from "./app.tsx"

/** Точный browser environment этого platform entrypoint. */
export const environment = "main" as const

const canvas = globalThis.document.getElementById("visual-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Window visual canvas #visual-canvas is missing")
const packageVersion = import.meta.env.COSMOS_PACKAGE_VERSION
if (typeof packageVersion !== "string" || packageVersion.length === 0) {
  throw new Error("Window visual package version is missing")
}

/** Готовое подключение. Его unmount освобождает App и все ресурсы Browser. */
export const runtime = await attach({
  canvas,
  app: <VisualApp />,
  stylesheets: [`/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`],
  frameloop: "demand",
})

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  viewPoint: runtime.viewPoint,
  display: runtime.document.getElementById("main"),
  dock: runtime.document.getElementById("main-display-dock"),
})
