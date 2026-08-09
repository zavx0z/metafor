/**
 * @ui/node — transport-neutral node-system model, ELK layout and WebGPU UI.
 *
 * Producers adapt their own runtime facts into {@link NodeSystemDocument}.
 * This package never reads application state or transports by itself.
 * Its Blender-derived visual grammar is content-first: exact renderer text
 * metrics feed one Flex plan shared by ELK geometry and WebGPU rendering.
 */

export * from "./model.ts"
export * from "./validation.ts"
export * from "./card-layout.ts"
export * from "./containment.ts"
export * from "./layout-engine.ts"
export * from "./incremental-layout.ts"
export * from "./edge-curve.ts"
export * from "./edge-particle.ts"
export * from "./viewport.ts"
export * from "./surface.ts"
export * from "./inspector.ts"
