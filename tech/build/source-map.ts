/** Возвращает development source map рядом с package artifact. */
export function sourceMapArtifact(artifact: string) {
  return `${artifact}.map`
}

/** Удаляет несемантический случайный Bun debug identity из executable bytes. */
export function canonicalExecutableSource(source: string) {
  const executable = source
    .trimEnd()
    .replace(/(?:^|\n)\/\/# debugId=[0-9A-Fa-f]+\s*$/, "")
    .trimEnd()
  return `${executable}\n`
}

/** Выносит Bun inline map из package-owned outfile в отдельный companion. */
export async function externalizeSourceMap(artifact: string) {
  const source = await Bun.file(artifact).text()
  const marker = "//# sourceMappingURL=data:application/json;base64,"
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1) throw new Error(`Inline source map is missing: ${artifact}`)

  const encoded = source
    .slice(markerIndex + marker.length)
    .split(/\r?\n/, 1)[0]
    ?.trim()
  if (!encoded) throw new Error(`Inline source map payload is missing: ${artifact}`)
  const sourceMap = Buffer.from(encoded, "base64")
  const parsed = JSON.parse(sourceMap.toString("utf8")) as Record<string, unknown>
  if (parsed.version !== 3) throw new Error(`Source map has unsupported version: ${artifact}`)
  delete parsed.debugId

  const canonicalSourceMap = Buffer.from(JSON.stringify(parsed))

  await Promise.all([
    Bun.write(artifact, canonicalExecutableSource(source.slice(0, markerIndex))),
    Bun.write(sourceMapArtifact(artifact), canonicalSourceMap),
  ])
}

/** Keeps an inline development map while removing Bun's random debug identity. */
export async function canonicalizeInlineSourceMap(artifact: string) {
  const source = await Bun.file(artifact).text()
  const marker = "//# sourceMappingURL=data:application/json;base64,"
  const markerIndex = source.lastIndexOf(marker)
  if (markerIndex === -1) throw new Error(`Inline source map is missing: ${artifact}`)
  const encoded = source
    .slice(markerIndex + marker.length)
    .split(/\r?\n/, 1)[0]
    ?.trim()
  if (!encoded) throw new Error(`Inline source map payload is missing: ${artifact}`)
  const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >
  if (parsed.version !== 3) throw new Error(`Source map has unsupported version: ${artifact}`)
  delete parsed.debugId
  const canonicalMap = Buffer.from(JSON.stringify(parsed)).toString("base64")
  const executable = canonicalExecutableSource(source.slice(0, markerIndex)).trimEnd()
  await Bun.write(artifact, `${executable}\n${marker}${canonicalMap}\n`)
}
