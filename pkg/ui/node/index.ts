/**
 * Node-system presentation model, card measurement and WebGPU rendering.
 * Automatic numeric geometry is delegated to `@metafor/layout` through a
 * minimal measured graph; layout does not receive this package's UI document.
 * @packageDocumentation
 */

export * from "./types/index.ts"
export * from "./validation.ts"
export * from "./card-layout.ts"
export * from "./containment.ts"
export * from "./layout-engine.ts"
export * from "./incremental-layout.ts"
export * from "./viewport.ts"
export * from "./edge-curve.ts"
export * from "./edge-particle.ts"
export * from "./surface.ts"
export * from "./inspector.ts"
