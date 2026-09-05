import type {RootSize} from "@zavx0z/browser"

let size: RootSize = {width: 1000, height: 700, left: 0, top: 0, dpr: 1}

/** Test double только для размера Browser; App и его компоненты исполняются настоящим Component. */
export function useSpace<Selection>(selector: (state: {size: RootSize}) => Selection): Selection {
  return selector({size})
}

export function setViewport(width: number, height: number): void {
  size = {...size, width, height}
}
