declare global {
  /**
   * Атом - компонент графа
   * @interface QGraphAtom
   * @extends HTMLElement
   */
  interface QGraphAtom extends Partial<HTMLElement> {
    viewport: QViewport & HTMLElement
    render(snapshot: QGraphAtomProps): void
    getElementById(activeStateId: string): unknown
    updateContext(context: Record<string, any>): void
    updateState(newState: string): void
  }
  /**
   * Параметры Атома - компонента графа
   * @interface QGraphAtomProps
   * @property {QMachineSnapshot} atom - Снимок состояния атома
   */
  type QGraphAtomProps = {
    atom: QMachineSnapshot
  }
}
export {}
