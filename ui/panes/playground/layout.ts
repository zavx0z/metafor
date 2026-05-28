export type PanesPlaygroundLayout = {
  stageX: number
  stageY: number
  stageW: number
  stageH: number
  gap: number
  catalogW: number
  sectionW: number
  paramsW: number
  dockH: number
  previewW: number
  previewH: number
  sectionX: number
  previewX: number
  paramsX: number
}

export function panesPlaygroundLayout(rectW: number, rectH: number): PanesPlaygroundLayout {
  const stageW = Math.max(1040, Math.min(1660, rectW - 36))
  const stageH = Math.max(560, Math.min(860, rectH - 36))
  const stageX = (rectW - stageW) / 2
  const stageY = (rectH - stageH) / 2
  const gap = 18
  const catalogW = Math.round(Math.max(184, Math.min(228, stageW * 0.16)))
  const sectionW = Math.round(Math.max(132, Math.min(172, stageW * 0.11)))
  const paramsW = Math.round(Math.max(300, Math.min(372, stageW * 0.23)))
  const dockH = Math.max(86, Math.min(112, stageH * 0.15))
  const previewW = stageW - catalogW - sectionW - paramsW - gap * 3
  const previewH = stageH - dockH - gap
  const sectionX = stageX + catalogW + gap
  const previewX = sectionX + sectionW + gap
  const paramsX = previewX + previewW + gap
  return {stageX, stageY, stageW, stageH, gap, catalogW, sectionW, paramsW, dockH, previewW, previewH, sectionX, previewX, paramsX}
}
