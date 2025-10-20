// Типы для компонентов
export interface ControlPanel extends HTMLElement {
  setCollapsed(collapsed: boolean): void
  setOpacity(value: string): void
  setPlayState(isPlaying: boolean): void
  setStepDisabled(disabled: boolean): void
}
