/**
Quantum-owned Storybook application manifest.

The manifest keeps one delivery page while an exact browser bootstrap selects
the Graph DOM laboratory or the bounded Bulk DOM pipeline.

@packageDocumentation
*/

import {fileURLToPath} from "node:url"
import {
  defineStorybookApp,
  type StorybookAppManifest,
  type StorybookStaticFile,
} from "@zavx0z/storybook/app"
import {createQuantumGraphStorybookPage} from "./graph/page.ts"

/** Creates the DOM-native Quantum Storybook used by local server and static delivery. */
export function createQuantumStorybookApp(): StorybookAppManifest {
  return defineStorybookApp({
    id: "quantum",
    title: "Quantum · лаборатория",
    basePath: "",
    home: {
      path: "/graph/",
      label: "Главная",
      ariaLabel: "На главную лаборатории Quantum",
    },
    footer: {
      lead: "Создано для",
      owner: {
        label: "MetaFor",
        href: "https://github.com/zavx0z/metafor",
      },
      detail: "лаборатории доменных проекций Quantum",
    },
    head: {
      meta: [{
        kind: "public-path",
        name: "engine-default-font",
        path: "/fonts/jetbrains-mono-bold.ttf",
      }],
    },
    pages: [createQuantumGraphStorybookPage()],
  })
}

/** Exact Engine-owned assets served by both local and local-static delivery. */
export function quantumStorybookStaticFiles(): readonly StorybookStaticFile[] {
  return Object.freeze([{
    publicPath: "/fonts/jetbrains-mono-bold.ttf",
    sourcePath: fileURLToPath(
      import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf"),
    ),
  }])
}
