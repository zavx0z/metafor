export type CodexComposerAttachment = {
  id: string
  name: string
  path: string
  mime: string
  size: number
}

export type CodexImagePickerOptions = {
  multiple?: boolean
  parent?: HTMLElement
}

export type CodexAttachmentUploadOptions = {
  endpoint?: string
  maxBytes?: number
}

export const CODEX_IMAGE_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.tif,.tiff,.bmp,.svg"
export const CODEX_COMPOSER_MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024

export function codexComposerMessage(draft: string, attachments: readonly CodexComposerAttachment[]): string {
  const body = draft.replace(/\r\n?/g, "\n").trim()
  if (attachments.length === 0) return body
  const imageLines = attachments.map((attachment) => `- ${attachment.path}`).join("\n")
  const imageBlock = `Изображения:\n${imageLines}`
  return body.length === 0 ? imageBlock : `${body}\n\n${imageBlock}`
}

export function mergeCodexComposerDraft(base: string, addition: string): string {
  const left = base.trim()
  const right = addition.trim()
  if (!left) return right
  if (!right) return left
  return `${left}\n${right}`
}

export function codexImageDropFiles(dataTransfer: DataTransfer | null): File[] {
  if (dataTransfer === null) return []
  const files = new Map<string, File>()
  for (const file of Array.from(dataTransfer.files)) {
    if (codexFileLooksImage(file)) files.set(codexFileKey(file), file)
  }
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file !== null && codexFileLooksImage(file)) files.set(codexFileKey(file), file)
  }
  return [...files.values()]
}

export function codexFileLooksImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true
  return /\.(?:png|jpe?g|gif|webp|heic|heif|tiff?|bmp|svg)$/i.test(file.name)
}

export function pickCodexImageFiles(options: CodexImagePickerOptions = {}): Promise<File[]> {
  const parent = options.parent ?? document.body
  const input = document.createElement("input")
  input.type = "file"
  input.accept = CODEX_IMAGE_ACCEPT
  input.multiple = options.multiple ?? true
  input.tabIndex = -1
  Object.assign(input.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  } satisfies Partial<CSSStyleDeclaration>)

  return new Promise((resolve) => {
    let settled = false
    const finish = (files: File[]): void => {
      if (settled) return
      settled = true
      input.remove()
      window.removeEventListener("focus", handleWindowFocus, true)
      resolve(files.filter(codexFileLooksImage))
    }
    const handleWindowFocus = (): void => {
      window.setTimeout(() => {
        if (!settled && input.files !== null && input.files.length === 0) finish([])
      }, 250)
    }
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), {once: true})
    input.addEventListener("cancel", () => finish([]), {once: true})
    window.addEventListener("focus", handleWindowFocus, true)
    parent.appendChild(input)
    input.click()
  })
}

export async function uploadCodexAttachment(file: File, options: CodexAttachmentUploadOptions = {}): Promise<CodexComposerAttachment> {
  if (!codexFileLooksImage(file)) throw new Error("можно прикрепить только изображение")
  const maxBytes = options.maxBytes ?? CODEX_COMPOSER_MAX_ATTACHMENT_BYTES
  if (file.size > maxBytes) throw new Error("изображение больше 16 MB")
  const dataBase64 = base64Bytes(new Uint8Array(await file.arrayBuffer()))
  const response = await fetch(options.endpoint ?? "/hud/codex/attachments", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      name: file.name || "image.png",
      type: file.type || "",
      size: file.size,
      dataBase64,
    }),
  })
  const payload = await response.json().catch(() => null)
  const record = asRecord(payload)
  if (!response.ok || record?.["ok"] !== true) {
    const message = typeof record?.["error"] === "string" ? record["error"] : `upload ${response.status}`
    throw new Error(message)
  }
  const attachment = asRecord(record["attachment"])
  if (attachment === null) throw new Error("attachment response is invalid")
  const id = stringValue(attachment["id"]) ?? crypto.randomUUID()
  const name = stringValue(attachment["name"]) ?? (file.name || "image")
  const path = stringValue(attachment["path"])
  const mime = stringValue(attachment["mime"]) ?? (file.type || "image/*")
  const size = typeof attachment["size"] === "number" && Number.isFinite(attachment["size"]) ? attachment["size"] : file.size
  if (path === null) throw new Error("attachment path is missing")
  return {id, name, path, mime, size}
}

export async function uploadCodexAttachments(files: readonly File[], options: CodexAttachmentUploadOptions = {}): Promise<CodexComposerAttachment[]> {
  const uploaded: CodexComposerAttachment[] = []
  for (const file of files) uploaded.push(await uploadCodexAttachment(file, options))
  return uploaded
}

export function formatCodexAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B"
  if (size < 1024) return `${Math.round(size)} B`
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`
}

function codexFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function base64Bytes(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
