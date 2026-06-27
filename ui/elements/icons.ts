/**
 * Consistent 24px icons embedded as data URLs for the Vision Pro UI.
 */

const svgIcon = (source: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`

function iconSvg(body: string, color = "#fff"): string {
  return svgIcon(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`)
}

const runSvg = iconSvg("<path d=\"M8 5v14l11-7-11-7Z\"/>")
const restartSvg = iconSvg("<path d=\"M20 7v5h-5\"/><path d=\"M20 12a8 8 0 1 0-2.34 5.66\"/>")
const pauseSvg = iconSvg("<path d=\"M8 5v14\"/><path d=\"M16 5v14\"/>")
const stopSvg = iconSvg("<path d=\"M7 7h10v10H7z\"/>")
const debugResumeSvg = svgIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M8 5.5v13l11-6.5-11-6.5Z\" fill=\"#6fdd76\" stroke=\"#c7f7c9\" stroke-width=\"1.3\" stroke-linejoin=\"round\"/></svg>")
const debugPauseSvg = svgIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"7\" y=\"5\" width=\"3.8\" height=\"14\" rx=\"1.2\" fill=\"#f6c453\"/><rect x=\"13.2\" y=\"5\" width=\"3.8\" height=\"14\" rx=\"1.2\" fill=\"#f6c453\"/></svg>")
const debugStopSvg = svgIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"1.8\" fill=\"#ff4f4f\" stroke=\"#ffc1c1\" stroke-width=\"1.2\"/></svg>")
const debugStepOverSvg = iconSvg("<path d=\"M4 12a6 6 0 0 1 10.24-4.24L17 10\"/><path d=\"M17 5v5h-5\"/><path d=\"M19 19v-7\"/><path d=\"M15.5 15.5 19 12l3.5 3.5\"/>", "#6bb8ff")
const debugStepIntoSvg = iconSvg("<path d=\"M12 4v15\"/><path d=\"M7 14l5 5 5-5\"/>", "#6bb8ff")
const debugStepOutSvg = iconSvg("<path d=\"M12 20V5\"/><path d=\"M7 10l5-5 5 5\"/>", "#6bb8ff")
const debugRestartSvg = iconSvg("<path d=\"M20 7v5h-5\"/><path d=\"M20 12a8 8 0 1 0-2.34 5.66\"/>", "#6fdd76")
const debugExecutionPointSvg = iconSvg("<path d=\"M12 3v4\"/><path d=\"M12 17v4\"/><path d=\"M3 12h4\"/><path d=\"M17 12h4\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "#f6c453")
const closeSvg = iconSvg("<path d=\"M6 6l12 12\"/><path d=\"M18 6 6 18\"/>")
const stepOverSvg = iconSvg("<path d=\"M4 12a6 6 0 0 1 10.24-4.24L17 10\"/><path d=\"M17 5v5h-5\"/><path d=\"M19 19v-7\"/><path d=\"M15.5 15.5 19 12l3.5 3.5\"/>")
const stepIntoSvg = iconSvg("<path d=\"M12 4v15\"/><path d=\"M7 14l5 5 5-5\"/>")
const stepOutSvg = iconSvg("<path d=\"M12 20V5\"/><path d=\"M7 10l5-5 5 5\"/>")
const logSvg = iconSvg("<path d=\"M4 5h16v14H4z\"/><path d=\"m7 9 3 3-3 3\"/><path d=\"M12 15h5\"/>")
const databaseSvg = iconSvg("<ellipse cx=\"12\" cy=\"5\" rx=\"7\" ry=\"3\"/><path d=\"M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5\"/><path d=\"M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6\"/>")
const codexSvg = iconSvg("<path d=\"M17 6.5A7.5 7.5 0 1 0 17 17.5\"/><path d=\"M8.5 9.5 6 12l2.5 2.5\"/><path d=\"M15.5 9.5 18 12l-2.5 2.5\"/><path d=\"M13.5 8 10.5 16\"/>", "#5cf0ff")
const phoneSvg = iconSvg("<rect x=\"7\" y=\"2.5\" width=\"10\" height=\"19\" rx=\"2\"/><path d=\"M10.5 18.5h3\"/>")
const clearSvg = iconSvg("<path d=\"M4 7h16\"/><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M6 7l1 14h10l1-14\"/><path d=\"M9 7V4h6v3\"/>")
const autoscrollSvg = iconSvg("<path d=\"M12 4v11\"/><path d=\"M7 10l5 5 5-5\"/><path d=\"M5 20h14\"/>")
const manualSvg = iconSvg("<path d=\"M5 5h14v14H5z\"/><path d=\"M9 5v14\"/><path d=\"M12 9h5\"/><path d=\"M12 13h5\"/>")
const applySvg = iconSvg("<path d=\"m5 13 4 4L19 7\"/>")
const languageSvg = iconSvg("<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18\"/><path d=\"M12 3a14 14 0 0 1 0 18\"/><path d=\"M12 3a14 14 0 0 0 0 18\"/>")
const copySvg = iconSvg("<path d=\"M9 9h10v10H9z\"/><path d=\"M5 15V5h10\"/>")
const executionPointSvg = iconSvg("<path d=\"M12 3v4\"/><path d=\"M12 17v4\"/><path d=\"M3 12h4\"/><path d=\"M17 12h4\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>")
const breakpointSvg = iconSvg("<circle cx=\"12\" cy=\"12\" r=\"6\"/><path d=\"M12 6v12\"/><path d=\"M6 12h12\"/>")
const breakpointMuteSvg = iconSvg("<circle cx=\"12\" cy=\"12\" r=\"6\"/><path d=\"M4 4l16 16\"/>")
const breakpointActiveSvg = svgIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"12\" cy=\"12\" r=\"6.8\" fill=\"#ff4f4f\"/><circle cx=\"12\" cy=\"12\" r=\"6.8\" stroke=\"#ffc1c1\" stroke-width=\"1.4\"/></svg>")
const breakpointDisabledSvg = svgIcon("<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"12\" cy=\"12\" r=\"6.3\" stroke=\"#d8a6a6\" stroke-opacity=\"0.74\" stroke-width=\"2.2\"/></svg>")
const expandSvg = iconSvg("<path d=\"M8 3H3v5\"/><path d=\"M16 3h5v5\"/><path d=\"M21 16v5h-5\"/><path d=\"M3 16v5h5\"/><path d=\"M3 3l6 6\"/><path d=\"M21 3l-6 6\"/><path d=\"M21 21l-6-6\"/><path d=\"M3 21l6-6\"/>")
const collapseSvg = iconSvg("<path d=\"M9 3v6H3\"/><path d=\"M15 3v6h6\"/><path d=\"M21 15h-6v6\"/><path d=\"M3 15h6v6\"/>")
const plusSvg = iconSvg("<path d=\"M12 5v14\"/><path d=\"M5 12h14\"/>")
const minusSvg = iconSvg("<path d=\"M5 12h14\"/>")
const micSvg = iconSvg("<path d=\"M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z\"/><path d=\"M5 10a7 7 0 0 0 14 0\"/><path d=\"M12 17v4\"/><path d=\"M8 21h8\"/>")
const keyboardSvg = iconSvg("<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M7 10h.01\"/><path d=\"M11 10h.01\"/><path d=\"M15 10h.01\"/><path d=\"M19 10h.01\"/><path d=\"M7 14h10\"/>", "#5cf0ff")
const sendSvg = iconSvg("<path d=\"M22 2 11 13\"/><path d=\"m22 2-7 20-4-9-9-4 20-7Z\"/>", "#5cf0ff")
const imageSvg = iconSvg("<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"8.5\" cy=\"10\" r=\"1.5\"/><path d=\"M21 16l-5.2-5.2a1.6 1.6 0 0 0-2.2 0L5 19\"/>", "#5cf0ff")
const zoomInSvg = iconSvg("<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-4.5-4.5\"/><path d=\"M11 8v6\"/><path d=\"M8 11h6\"/>", "#5cf0ff")
const zoomOutSvg = iconSvg("<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-4.5-4.5\"/><path d=\"M8 11h6\"/>", "#5cf0ff")

export const uiIcons = {
  run: runSvg,
  resume: runSvg,
  restart: restartSvg,
  pause: pauseSvg,
  stop: stopSvg,
  debugResume: debugResumeSvg,
  debugPause: debugPauseSvg,
  debugStop: debugStopSvg,
  debugStepOver: debugStepOverSvg,
  debugStepInto: debugStepIntoSvg,
  debugStepOut: debugStepOutSvg,
  debugRestart: debugRestartSvg,
  debugExecutionPoint: debugExecutionPointSvg,
  close: closeSvg,
  stepOver: stepOverSvg,
  stepInto: stepIntoSvg,
  stepOut: stepOutSvg,
  log: logSvg,
  database: databaseSvg,
  codex: codexSvg,
  phone: phoneSvg,
  clear: clearSvg,
  autoscroll: autoscrollSvg,
  manual: manualSvg,
  apply: applySvg,
  language: languageSvg,
  copy: copySvg,
  executionPoint: executionPointSvg,
  breakpoint: breakpointSvg,
  breakpointMute: breakpointMuteSvg,
  breakpointActive: breakpointActiveSvg,
  breakpointDisabled: breakpointDisabledSvg,
  expand: expandSvg,
  collapse: collapseSvg,
  plus: plusSvg,
  minus: minusSvg,
  mic: micSvg,
  keyboard: keyboardSvg,
  send: sendSvg,
  image: imageSvg,
  eval: runSvg,
  zoomIn: zoomInSvg,
  zoomOut: zoomOutSvg,
} as const

export type UiIcon = (typeof uiIcons)[keyof typeof uiIcons]
