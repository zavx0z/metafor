import type { Impulse } from "@metafor/atom"

export interface StackTable extends HTMLElement {
  render(currentStack: Impulse[]): void
  clear(): void
  setVisible(visible: boolean): void
}
