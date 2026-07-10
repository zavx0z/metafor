from pathlib import Path

path = Path("boundary/domain.ts")
text = path.read_text()

old = '''    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    const address = parseInflatonAddress(part.path)
'''
new = '''    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    const operation: "add" | "replace" | "remove" = part.op
    const address = parseInflatonAddress(part.path)
'''
assert old in text
text = text.replace(old, new, 1)
text = text.replace('''        op: part.op,
        path: gravitonDeclarationPath(address),
        value: part.op === "replace" ? createForceDelta(previousCanonical, canonical) : canonical,
      })
      await this.addOrPatchLocalConsequences(tx, address, previous, next, part.op, committed)
''', '''        op: operation,
        path: gravitonDeclarationPath(address),
        value: operation === "replace" ? createForceDelta(previousCanonical, canonical) : canonical,
      })
      await this.addOrPatchLocalConsequences(tx, address, previous, next, operation as "add" | "replace", committed)
''', 1)

old = '''  private async rememberRoot(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "string" || part.path.startsWith("force/replay/")) return null
    if (typeof part.from === "string") this.replayRoots.get(part.from)?.add(part.path)
    const effects = await this.sql.begin(async (tx) => {
      await tx`INSERT INTO boundary_root (src) VALUES (${part.path}) ON CONFLICT DO NOTHING`
      const exists = (await tx<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${part.path}`)[0]
      return exists ? await this.ensureRootActor(tx, part.path) : []
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: part.path, messages: effects.map(particleMessage)}
  }
'''
new = '''  private async rememberRoot(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "string" || part.path.startsWith("force/replay/")) return null
    const src = part.path
    if (typeof part.from === "string") this.replayRoots.get(part.from)?.add(src)
    const effects: Particle[] = await this.sql.begin(async (tx): Promise<Particle[]> => {
      await tx`INSERT INTO boundary_root (src) VALUES (${src}) ON CONFLICT DO NOTHING`
      const exists = (await tx<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${src}`)[0]
      return exists ? await this.ensureRootActor(tx, src) : []
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: src, messages: effects.map(particleMessage)}
  }
'''
assert old in text
text = text.replace(old, new, 1)

old = '''  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    const columns = await this.sql<Array<{name: string}>>`PRAGMA table_info(${this.sql(table)})`
    if (!columns.some((entry) => entry.name === column)) await this.sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
'''
new = '''  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    const columns = await this.sql.unsafe<Array<{name: string}>>(`PRAGMA table_info(${table})`)
    if (!columns.some((entry) => entry.name === column)) await this.sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
'''
assert old in text
text = text.replace(old, new, 1)
path.write_text(text)
