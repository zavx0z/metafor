import {join} from "node:path"
import type {StorybookPageManifest} from "@zavx0z/storybook/app"
import {QUANTUM_STORY_ROUTE_TREE} from "../routes.ts"

/** Quantum delivery page with exact Graph DOM and Bulk DOM dispatch. */
export function createQuantumGraphStorybookPage(): StorybookPageManifest {
  return {
    id: "graph",
    title: "Quantum · лаборатория",
    mountPath: "/",
    entrypoint: join(import.meta.dir, "../bootstrap.ts"),
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
    routeTree: QUANTUM_STORY_ROUTE_TREE,
    touch: true,
  }
}
