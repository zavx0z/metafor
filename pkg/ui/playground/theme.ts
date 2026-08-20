import {uiShapeMetrics} from "@ui/elements"

export const playgroundTheme = Object.freeze({
  stagePadding: uiShapeMetrics.tightGap,
  stageGap: uiShapeMetrics.separatorWidth,
  catalogWidth: 210,
  sectionWidth: 160,
  infoWidth: 440,
  dockHeight: uiShapeMetrics.rowHeight,
  panelBackground: "rgba(12, 18, 30, 0.78)" as const,
  previewBackground: "rgba(8, 13, 22, 0.72)" as const,
})
