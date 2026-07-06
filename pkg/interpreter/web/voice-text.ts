import {cleanupVoiceText, type VoiceInputChunk, type VoiceInputSegment} from "./voice-input.ts"

const VOICE_MESSAGE_PAUSE_SECONDS = 1.6

export function mergeVoiceInputText(base: string, addition: string): string {
  const left = cleanupVoiceInputText(base)
  const right = cleanupVoiceInputText(addition)
  if (!left) return right
  if (!right) return left
  const leftKey = voiceInputCompareKey(left)
  const rightKey = voiceInputCompareKey(right)
  if (!rightKey || leftKey === rightKey || leftKey.endsWith(` ${rightKey}`)) return left
  if (rightKey.startsWith(`${leftKey} `)) return right
  return cleanupVoiceInputText(`${left} ${right}`)
}

export function sanitizeHostTerminalVoiceInput(text: string): string {
  return cleanupVoiceInputText(text)
    .replace(/\x1b\[201~/g, "")
    .replace(/\x1b/g, "")
}

export function voiceMessagesFromChunk(chunk: VoiceInputChunk): string[] {
  if (chunk.messages.length > 1) return chunk.messages.map(cleanupVoiceInputText).filter(Boolean)

  const byPause = voiceMessagesFromSegments(chunk.segments)
  if (byPause.length > 1) return byPause

  const source = chunk.messages[0] ?? chunk.text
  const byParagraph = splitVoiceParagraphs(source)
  return byParagraph.length > 0 ? byParagraph : byPause
}

export function voiceMessagesFromSegments(segments: VoiceInputSegment[]): string[] {
  const messages: string[] = []
  let current = ""
  let lastEnd: number | null = null

  for (const segment of segments) {
    const text = cleanupVoiceInputText(segment.text ?? "")
    if (!text) continue

    const start = segment.start
    const end = segment.end
    const hasPause =
      current.length > 0 &&
      typeof start === "number" &&
      typeof lastEnd === "number" &&
      start - lastEnd >= VOICE_MESSAGE_PAUSE_SECONDS

    if (hasPause) {
      messages.push(current)
      current = text
    } else {
      current = current ? `${current} ${text}` : text
    }

    if (typeof end === "number") lastEnd = end
  }

  if (current) messages.push(current)
  return messages
}

function splitVoiceParagraphs(text: string): string[] {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map(cleanupVoiceInputText)
    .filter(Boolean)
}

export function cleanupVoiceInputText(text: string): string {
  const cleaned = cleanupVoiceText(text).replace(/\s+/g, " ").trim()
  return voiceTextHasContent(cleaned) ? cleaned : ""
}

function voiceTextHasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

export function voiceInputCompareKey(text: string): string {
  return cleanupVoiceInputText(text)
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}
