import {Color} from "@metafor/engine"
import {Z, palette, uiIcons, type UiSurface} from "@ui/elements"
import {IconButton} from "./Button.ts"
import {SliderControl} from "./SliderControl.ts"
import {TextField} from "./TextField.ts"
import type {VoiceInputHudPhraseGroup, VoiceInputHudPhraseGroupId} from "./VoiceInputHud.ts"

export type VoicePhraseSettingsProps = {
  key?: string
  title?: string
  groups: readonly VoiceInputHudPhraseGroup[]
  draftValue(groupId: VoiceInputHudPhraseGroupId): string
  onDraftChange(groupId: VoiceInputHudPhraseGroupId, value: string): void
  onAddPhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onRemovePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void
  onResetPhrases(groupId: VoiceInputHudPhraseGroupId): void
  onFuzzyChange(groupId: VoiceInputHudPhraseGroupId, value: number): void
}

export function VoicePhraseSettings(host: UiSurface, x: number, y: number, w: number, props: VoicePhraseSettingsProps): number {
  const keyPrefix = props.key ?? "voice-phrase-settings"
  if (props.title !== "") {
    host.drawText(props.title ?? "Фразы", x, y, {fontPx: 11, material: host.materials.cyan, maxWidthPx: w, z: Z.TEXT})
    y += 20
  }
  for (const group of props.groups) {
    y = drawVoicePhraseGroup(host, x, y, w, group, props, keyPrefix) + 12
  }
  return y
}

function drawVoicePhraseGroup(
  host: UiSurface,
  x: number,
  y: number,
  w: number,
  group: VoiceInputHudPhraseGroup,
  props: VoicePhraseSettingsProps,
  keyPrefix: string,
): number {
  const actionW = 28
  host.drawText(group.title, x, y + 2, {
    fontPx: 10,
    material: host.materials.text,
    maxWidthPx: Math.max(1, w - actionW - 8),
    z: Z.TEXT,
  })
  IconButton(host, x + w - actionW, y - 1, actionW, 22, {
    label: group.resetLabel,
    iconSrc: uiIcons.restart,
    variant: "text",
    action: () => {
      props.onResetPhrases(group.id)
      host.requestRender()
    },
  })
  host.drawText(group.description, x, y + 18, {
    fontPx: 8,
    material: host.materials.muted,
    maxWidthPx: w,
    z: Z.TEXT,
  })
  y += 38
  y = SliderControl(host, x, y, w, {
    key: `${keyPrefix}:fuzzy:${group.id}`,
    label: group.fuzzyLabel,
    value: group.fuzzyValue,
    min: 0,
    max: 0.5,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
    onChange: (value) => props.onFuzzyChange(group.id, Math.round(value * 20) / 20),
  }) + 6

  const addW = 28
  TextField(host, x, y, Math.max(1, w - addW - 6), 26, {
    key: `${keyPrefix}:input:${group.id}`,
    value: props.draftValue(group.id),
    placeholder: group.placeholder,
    submitOnEnter: true,
    onChange: (value) => props.onDraftChange(group.id, value),
    onSubmit: () => submitPhrase(host, group.id, props),
    sx: {fontSize: 10, borderRadius: 7, background: "bgInput", borderColor: "borderDim", color: "text"},
  })
  IconButton(host, x + w - addW, y, addW, 26, {
    label: group.addLabel,
    iconSrc: uiIcons.plus,
    action: () => submitPhrase(host, group.id, props),
  })
  y += 34
  return drawVoicePhraseChips(host, x, y, w, group, props, keyPrefix)
}

function submitPhrase(host: UiSurface, groupId: VoiceInputHudPhraseGroupId, props: VoicePhraseSettingsProps): void {
  const phrase = props.draftValue(groupId).replace(/\s+/g, " ").trim()
  if (!phrase) return
  props.onAddPhrase(groupId, phrase)
  props.onDraftChange(groupId, "")
  host.requestRender()
}

function drawVoicePhraseChips(
  host: UiSurface,
  x: number,
  y: number,
  w: number,
  group: VoiceInputHudPhraseGroup,
  props: VoicePhraseSettingsProps,
  keyPrefix: string,
): number {
  const chipH = 20
  const gap = 5
  let cx = x
  let cy = y
  for (const phrase of group.phrases) {
    const chipW = Math.min(w, Math.max(54, Math.ceil(host.measureText(phrase, 9)) + 28))
    if (cx > x && cx + chipW > x + w) {
      cx = x
      cy += chipH + gap
    }
    host.drawRoundedRect(cx, cy, chipW, chipH, {
      radius: 6,
      fill: new Color(0.06, 0.12, 0.15, 0.58),
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    host.drawText(phrase, cx + 8, cy + 5, {
      fontPx: 9,
      material: host.materials.text,
      maxWidthPx: Math.max(1, chipW - 26),
      z: Z.TEXT,
    })
    host.drawText("x", cx + chipW - 14, cy + 5, {
      fontPx: 9,
      material: host.materials.muted,
      maxWidthPx: 8,
      z: Z.TEXT,
    })
    host.hit(cx, cy, chipW, chipH, () => {
      props.onRemovePhrase(group.id, phrase)
      host.requestRender()
    }, {
      key: `${keyPrefix}:remove:${group.id}:${phrase}`,
      cursor: "pointer",
    })
    cx += chipW + gap
  }
  return cy + chipH
}
