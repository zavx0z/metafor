import {join} from "node:path"
import type {StorybookPageManifest} from "@zavx0z/storybook/app"
import {GRAPH_STORIES} from "./stories.ts"

/** Quantum-owned Graph laboratory page composed by `@quantum/storybook`. */
export function createQuantumGraphStorybookPage(): StorybookPageManifest {
  return {
    id: "graph",
    title: "Quantum · лаборатория Graph",
    mountPath: "/",
    entrypoint: join(import.meta.dir, "entry.ts"),
    stylePath: join(import.meta.dir, "style.css"),
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
  }
}
