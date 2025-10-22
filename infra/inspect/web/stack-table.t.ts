import type { Impulse } from "../../../atom/em"

export interface StackTable extends HTMLElement {
  render(currentStack: Impulse[]): void
  clear(): void
  setVisible(visible: boolean): void
}
