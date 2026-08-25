/**
Quantum-owned Storybook application manifest.

The manifest keeps the Graph laboratory under `/graph` while its catalog,
preview state and lazy experiments remain owned by Quantum.

@packageDocumentation
*/

import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  defineStorybookApp,
  type StorybookAppManifest,
  type StorybookStaticFile,
} from "@zavx0z/storybook/app"
import {GRAPH_STORIES} from "./graph/stories.ts"

/** Creates the single-page Quantum Storybook used by local server and static delivery. */
export function createQuantumStorybookApp(): StorybookAppManifest {
  return defineStorybookApp({
    id: "quantum",
    title: "Quantum · лаборатория Graph",
    basePath: "/graph",
    home: {
      path: "/",
      label: "Главная",
      ariaLabel: "На главную лаборатории Quantum",
    },
    footer: {
      lead: "Создано для",
      owner: {
        label: "MetaFor",
        href: "https://github.com/zavx0z/metafor",
      },
      detail: "лаборатория Graph для сравнения доменных проекций",
    },
    head: {
      meta: [{
        kind: "public-path",
        name: "engine-default-font",
        path: "/fonts/jetbrains-mono-bold.ttf",
      }],
    },
    pages: [{
      id: "graph",
      title: "Quantum · лаборатория Graph",
      mountPath: "/",
      entrypoint: join(import.meta.dir, "graph/entry.ts"),
      stylePath: join(import.meta.dir, "graph/style.css"),
      body: {
        kind: "canvas",
        canvasId: "quantum-storybook-canvas",
      },
      capability: "webgpu-diagnostic",
      readiness: {
        dataset: "quantumStorybook",
        value: "ready",
      },
      canvas: {
        id: "quantum-storybook-canvas",
        evidence: "non-black",
      },
      routeTree: GRAPH_STORIES.routeTree,
    }],
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
