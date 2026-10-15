import {useMemo, useSyncExternalStore} from "@zavx0z/immersive/XReact"
import type {SpatialTreeState} from "@zavx0z/immersive/nodes/spatial/tree"

/** Скрывает native volumes без смены исходного Store и без remount его Display/content. */
export function useSpatialVisibility(source: SpatialTreeState, active: boolean): SpatialTreeState {
  const current = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const projected = useMemo(() => active || current === null ? current : {
    ...current,
    visibleVolumeIds: new Set<string>(),
    showGrid: false,
  }, [current, active])
  return useMemo(() => active ? source : {
    id: source.id,
    subscribe: source.subscribe,
    publish: source.publish,
    getSnapshot: () => projected,
  }, [source, projected, active])
}
