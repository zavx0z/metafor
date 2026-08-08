import type {UiSurfaceRect} from "@ui/elements"
import {dockHudSideTabFrame} from "@ui/hud"

export const HAMILTONIAN_INSPECTOR_STICK_WIDTH = 38
export const HAMILTONIAN_INSPECTOR_STICK_HEIGHT = 34
export const HAMILTONIAN_INSPECTOR_STICK_TOP = 46
export const HAMILTONIAN_INSPECTOR_MIN_WIDTH = 240
export const HAMILTONIAN_INSPECTOR_MIN_HEIGHT = 220
export const HAMILTONIAN_INSPECTOR_DEFAULT_HEIGHT = 620
export const HAMILTONIAN_INSPECTOR_MARGIN = 12

export function hamiltonianInspectorWidth(width: number): number {
  if (width < 720) return Math.min(250, Math.max(190, width * 0.38))
  return Math.min(360, Math.max(280, width * 0.28))
}

export function planHamiltonianOrchestrationWorkspace(
  width: number,
  height: number,
  inspectorOpen: boolean,
  inspectorFrame: UiSurfaceRect | null = null,
  inspectorStickFrame: UiSurfaceRect | null = null,
): {graph: UiSurfaceRect; inspector: UiSurfaceRect} {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  if (!inspectorOpen) {
    const stickWidth = Math.min(HAMILTONIAN_INSPECTOR_STICK_WIDTH, safeWidth)
    const stickHeight = Math.min(HAMILTONIAN_INSPECTOR_STICK_HEIGHT, safeHeight)
    const defaultStick = {
      x: safeWidth - stickWidth,
      y: Math.min(HAMILTONIAN_INSPECTOR_STICK_TOP, safeHeight - stickHeight),
    }
    const requested = inspectorStickFrame ?? {...defaultStick, w: stickWidth, h: stickHeight}
    const docked = dockHudSideTabFrame({
      x: clamp(requested.x, 0, safeWidth - stickWidth),
      y: clamp(requested.y, 0, safeHeight - stickHeight),
      w: stickWidth,
      h: stickHeight,
    }, {w: safeWidth, h: safeHeight}, "right")
    return {
      graph: {x: 0, y: 0, w: safeWidth, h: safeHeight},
      inspector: docked.rect,
    }
  }

  const defaultWidth = hamiltonianInspectorWidth(safeWidth)
  const defaultFrame = {
    x: safeWidth - defaultWidth - HAMILTONIAN_INSPECTOR_MARGIN,
    y: HAMILTONIAN_INSPECTOR_STICK_TOP,
    w: defaultWidth,
    h: Math.min(HAMILTONIAN_INSPECTOR_DEFAULT_HEIGHT, safeHeight - HAMILTONIAN_INSPECTOR_STICK_TOP - HAMILTONIAN_INSPECTOR_MARGIN),
  }
  return {
    graph: {x: 0, y: 0, w: safeWidth, h: safeHeight},
    inspector: constrainHamiltonianInspectorFrame(inspectorFrame ?? defaultFrame, safeWidth, safeHeight),
  }
}

export function constrainHamiltonianInspectorFrame(
  frame: UiSurfaceRect,
  viewportWidth: number,
  viewportHeight: number,
): UiSurfaceRect {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)
  const minimumWidth = Math.min(HAMILTONIAN_INSPECTOR_MIN_WIDTH, safeWidth)
  const minimumHeight = Math.min(HAMILTONIAN_INSPECTOR_MIN_HEIGHT, safeHeight)
  const w = clamp(frame.w, minimumWidth, safeWidth)
  const h = clamp(frame.h, minimumHeight, safeHeight)
  return {
    x: clamp(frame.x, 0, safeWidth - w),
    y: clamp(frame.y, 0, safeHeight - h),
    w,
    h,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
