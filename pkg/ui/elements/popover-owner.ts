import type {UiSurfaceRect} from "./runtime.ts"
import type {DismissReason, UiSurface} from "./surface.ts"

export type ActivePopover = {
  surface: UiSurface
  key: string
  parentKey?: string
  regions: readonly UiSurfaceRect[]
  dismiss(reason: DismissReason): void
}

type ActivePopoverChain = {
  rootKey: string
  entries: Map<string, ActivePopover>
}

const activeChains = new WeakMap<object, ActivePopoverChain>()

export type PopoverChainSurface = Readonly<{interactionScope(): object}>

export function surfacesShareActivePopoverChain(first: PopoverChainSurface, second: PopoverChainSurface): boolean {
  if (first === second) return true
  const scope = first.interactionScope()
  if (scope !== second.interactionScope()) return false
  const chain = activeChains.get(scope)
  if (chain === undefined) return false
  let hasFirst = false
  let hasSecond = false
  for (const entry of chain.entries.values()) {
    if (entry.surface === first) hasFirst = true
    if (entry.surface === second) hasSecond = true
  }
  return hasFirst && hasSecond
}

export function activatePopover(scope: object, next: ActivePopover): void {
  let chain = activeChains.get(scope)
  const parentInChain = next.parentKey !== undefined && chain?.entries.has(next.parentKey) === true
  if (chain === undefined || (!parentInChain && chain.rootKey !== next.key)) {
    if (chain !== undefined) dismissPopoverChain(scope, "replaced")
    chain = {rootKey: next.key, entries: new Map()}
    activeChains.set(scope, chain)
  }
  chain.entries.set(next.key, next)
}

export function deactivatePopover(scope: object, key: string): void {
  const chain = activeChains.get(scope)
  if (chain === undefined || !chain.entries.has(key)) return
  if (chain.rootKey === key) {
    activeChains.delete(scope)
    return
  }
  const remove = new Set([key])
  let changed = true
  while (changed) {
    changed = false
    for (const entry of chain.entries.values()) {
      if (entry.parentKey !== undefined && remove.has(entry.parentKey) && !remove.has(entry.key)) {
        remove.add(entry.key)
        changed = true
      }
    }
  }
  for (const entryKey of remove) chain.entries.delete(entryKey)
}

export function dismissPopoverChain(scope: object, reason: DismissReason): void {
  const chain = activeChains.get(scope)
  if (chain === undefined) return
  activeChains.delete(scope)
  for (const entry of [...chain.entries.values()].reverse()) entry.dismiss(reason)
}

export function popoverChainRegions(
  scope: object,
  surface: UiSurface,
  fallback: readonly UiSurfaceRect[],
): readonly UiSurfaceRect[] {
  const chain = activeChains.get(scope)
  if (chain === undefined) return fallback
  return [...chain.entries.values()].filter((entry) => entry.surface === surface).flatMap((entry) => entry.regions)
}
