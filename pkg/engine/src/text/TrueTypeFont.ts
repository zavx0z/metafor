/**
 * @fileoverview Быстрый ридер TTF: один DataView, кэши, simple+compound глифы, cmap(4/12), метрики
 */

export type TableInfo = { offset: number; length: number }

export type Outline = {
  points: Float32Array
  onCurve: Uint8Array
  contours: Uint16Array
}

function f2dot14ToFloat(v: number): number {
  return v / 16384
}

export class TrueTypeFont {
  private dv: DataView
  private buf: ArrayBuffer
  private tables: Map<string, TableInfo> = new Map()
  private _unitsPerEm: number | null = null
  private _indexToLocFormat: 0 | 1 | null = null
  private _numGlyphs: number | null = null
  private _loca: Uint32Array | null = null
  private _hhea: { ascent: number; descent: number; lineGap: number; numberOfHMetrics: number } | null = null
  private _hmtx: { advance: Uint16Array; lsb: Int16Array } | null = null
  private pointsCache: Map<number, Outline> = new Map()

  constructor(buf: ArrayBuffer) {
    this.buf = buf
    this.dv = new DataView(buf)
    this.readTableDirectory()
    this.ensureHhea()
    this.ensureHmtx()
  }

  static async fromUrl(url: string) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`)
    const buf = await res.arrayBuffer()
    return new TrueTypeFont(buf)
  }

  private readTableDirectory(): void {
    let off = 4
    const numTables = this.dv.getUint16(off, false)
    off += 8
    for (let i = 0; i < numTables; i++) {
      const tag =
        String.fromCharCode(this.dv.getUint8(off)) +
        String.fromCharCode(this.dv.getUint8(off + 1)) +
        String.fromCharCode(this.dv.getUint8(off + 2)) +
        String.fromCharCode(this.dv.getUint8(off + 3))
      off += 4
      off += 4
      const toff = this.dv.getUint32(off, false)
      off += 4
      const tlen = this.dv.getUint32(off, false)
      off += 4
      this.tables.set(tag, { offset: toff, length: tlen })
    }
  }

  private getTable(tag: string): TableInfo {
    const t = this.tables.get(tag)
    if (!t) throw new Error(`TTF table not found: ${tag}`)
    return t
  }

  get unitsPerEm(): number {
    if (this._unitsPerEm != null) return this._unitsPerEm
    const head = this.getTable("head")
    this._unitsPerEm = this.dv.getUint16(head.offset + 18, false)
    return this._unitsPerEm
  }

  get indexToLocFormat(): 0 | 1 {
    if (this._indexToLocFormat != null) return this._indexToLocFormat
    const head = this.getTable("head")
    const v = this.dv.getInt16(head.offset + 50, false)
    this._indexToLocFormat = v === 0 ? 0 : 1
    return this._indexToLocFormat
  }

  get numGlyphs(): number {
    if (this._numGlyphs != null) return this._numGlyphs
    const maxp = this.getTable("maxp")
    this._numGlyphs = this.dv.getUint16(maxp.offset + 4, false)
    return this._numGlyphs
  }

  private ensureLoca(): Uint32Array {
    if (this._loca) return this._loca
    const loca = this.getTable("loca")
    const n = this.numGlyphs + 1
    const out = new Uint32Array(n)
    let p = loca.offset
    if (this.indexToLocFormat === 0) {
      for (let i = 0; i < n; i++, p += 2) out[i] = this.dv.getUint16(p, false) * 2
    } else {
      for (let i = 0; i < n; i++, p += 4) out[i] = this.dv.getUint32(p, false)
    }
    this._loca = out
    return out
  }

  private glyphRange(gid: number): { start: number; end: number } {
    if (gid < 0 || gid >= this.numGlyphs) throw new Error(`gid out of range: ${gid}`)
    const glyf = this.getTable("glyf")
    const loca = this.ensureLoca()
    return { start: glyf.offset + loca[gid]!, end: glyf.offset + loca[gid + 1]! }
  }

  private ensureHhea() {
    if (this._hhea) return
    const hhea = this.getTable("hhea")
    const o = hhea.offset
    const ascent = this.dv.getInt16(o + 4, false)
    const descent = this.dv.getInt16(o + 6, false)
    const lineGap = this.dv.getInt16(o + 8, false)
    const numberOfHMetrics = this.dv.getUint16(o + 34, false)
    this._hhea = { ascent, descent, lineGap, numberOfHMetrics }
  }

  private ensureHmtx() {
    if (this._hmtx) return
    const hmtx = this.getTable("hmtx")
    const nH = this._hhea!.numberOfHMetrics
    const nG = this.numGlyphs
    const advance = new Uint16Array(nH)
    const lsb = new Int16Array(nG)
    let p = hmtx.offset
    for (let i = 0; i < nH; i++) {
      advance[i] = this.dv.getUint16(p, false)
      p += 2
      lsb[i] = this.dv.getInt16(p, false)
      p += 2
    }
    const lastAdvance = advance[nH - 1]!
    for (let i = nH; i < nG; i++) {
      lsb[i] = this.dv.getInt16(p, false)
      p += 2
    }
    this._hmtx = { advance, lsb }
  }

  getHMetric(gid: number): { advanceWidth: number; lsb: number } {
    const nH = this._hhea!.numberOfHMetrics
    const adv = gid < nH ? this._hmtx!.advance[gid]! : this._hmtx!.advance[nH - 1]!
    const lsb = this._hmtx!.lsb[gid]!
    return { advanceWidth: adv, lsb }
  }

  private _cmap12: { sub: number; nGroups: number } | null = null
  private _cmap4: {
    sub: number
    segCount: number
    endCode: number
    startCode: number
    idDelta: number
    idRangeOff: number
  } | null = null

  private ensureCmap() {
    if (this._cmap12 || this._cmap4) return
    const cmap = this.getTable("cmap")
    const base = cmap.offset
    const numTables = this.dv.getUint16(base + 2, false)
    for (let i = 0; i < numTables; i++) {
      const rec = base + 4 + i * 8
      const subOff = this.dv.getUint32(rec + 4, false)
      const sub = base + subOff
      const fmt = this.dv.getUint16(sub, false)
      if (fmt === 12 && !this._cmap12) {
        const nGroups = this.dv.getUint32(sub + 12, false)
        this._cmap12 = { sub, nGroups }
      } else if (fmt === 4 && !this._cmap4) {
        const segCountX2 = this.dv.getUint16(sub + 6, false)
        const segCount = segCountX2 / 2
        const endCode = sub + 14
        const startCode = endCode + segCount * 2 + 2
        const idDelta = startCode + segCount * 2
        const idRangeOff = idDelta + segCount * 2
        this._cmap4 = { sub, segCount, endCode, startCode, idDelta, idRangeOff }
      }
    }
  }

  mapCharToGlyph(codepoint: number): number {
    this.ensureCmap()
    if (this._cmap12) {
      const { sub, nGroups } = this._cmap12
      let lo = 0,
        hi = nGroups - 1
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1
        const g = sub + 16 + mid * 12
        const startChar = this.dv.getUint32(g + 0, false)
        const endChar = this.dv.getUint32(g + 4, false)
        const startGid = this.dv.getUint32(g + 8, false)
        if (codepoint < startChar) hi = mid - 1
        else if (codepoint > endChar) lo = mid + 1
        else return startGid + (codepoint - startChar)
      }
    }
    if (this._cmap4) {
      const { segCount, endCode, startCode, idDelta, idRangeOff } = this._cmap4
      let lo = 0,
        hi = segCount - 1
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1
        const end = this.dv.getUint16(endCode + mid * 2, false)
        if (codepoint > end) lo = mid + 1
        else hi = mid - 1
      }
      const i = lo
      if (i >= segCount) return 0
      const start = this.dv.getUint16(startCode + i * 2, false)
      if (codepoint < start) return 0
      const delta = this.dv.getInt16(idDelta + i * 2, false)
      const rangeOffset = this.dv.getUint16(idRangeOff + i * 2, false)
      if (rangeOffset === 0) return (codepoint + delta) & 0xffff
      else {
        const roff = idRangeOff + i * 2
        const idx = roff + rangeOffset + (codepoint - start) * 2
        const gid = this.dv.getUint16(idx, false)
        if (gid === 0) return 0
        return (gid + delta) & 0xffff
      }
    }
    return 0
  }

  getGlyphOutline(gid: number): Outline {
    const cached = this.pointsCache.get(gid)
    if (cached) return cached
    const { start, end } = this.glyphRange(gid)
    if (start === end) {
      const empty: Outline = { points: new Float32Array(0), onCurve: new Uint8Array(0), contours: new Uint16Array(0) }
      this.pointsCache.set(gid, empty)
      return empty
    }
    const nContours = this.dv.getInt16(start, false)
    let outline: Outline
    if (nContours > 0) outline = this.readSimpleOutline(start)
    else if (nContours < 0) outline = this.readCompoundOutline(start)
    else outline = { points: new Float32Array(0), onCurve: new Uint8Array(0), contours: new Uint16Array(0) }
    this.pointsCache.set(gid, outline)
    return outline
  }

  getGlyphPoints(gid: number): Float32Array {
    return this.getGlyphOutline(gid).points
  }

  private readSimpleOutline(gStart: number): Outline {
    let p = gStart
    const numContours = this.dv.getInt16(p, false)
    p += 2
    p += 8
    const endPts = new Uint16Array(numContours)
    for (let i = 0; i < numContours; i++, p += 2) endPts[i] = this.dv.getUint16(p, false)
    const numPoints = endPts[numContours - 1]! + 1
    const instructionLength = this.dv.getUint16(p, false)
    p += 2 + instructionLength
    const flags = new Uint8Array(numPoints)
    for (let i = 0; i < numPoints; i++) {
      const f = this.dv.getUint8(p++)
      flags[i] = f
      if ((f & 0x08) !== 0) {
        const rep = this.dv.getUint8(p++)
        for (let r = 0; r < rep && i + 1 < numPoints; r++) flags[++i] = f
      }
    }
    const X = new Int16Array(numPoints)
    for (let i = 0; i < numPoints; i++) {
      const f = flags[i]!
      if ((f & 0x02) !== 0) {
        const dx = this.dv.getUint8(p++)
        X[i] = (i ? X[i - 1]! : 0) + ((f & 0x10) !== 0 ? dx : -dx)
      } else if ((f & 0x10) === 0) {
        const dx = this.dv.getInt16(p, false)
        p += 2
        X[i] = (i ? X[i - 1]! : 0) + dx
      } else X[i] = i ? X[i - 1]! : 0
    }
    const Y = new Int16Array(numPoints)
    for (let i = 0; i < numPoints; i++) {
      const f = flags[i]!
      if ((f & 0x04) !== 0) {
        const dy = this.dv.getUint8(p++)
        Y[i] = (i ? Y[i - 1]! : 0) + ((f & 0x20) !== 0 ? dy : -dy)
      } else if ((f & 0x20) === 0) {
        const dy = this.dv.getInt16(p, false)
        p += 2
        Y[i] = (i ? Y[i - 1]! : 0) + dy
      } else Y[i] = i ? Y[i - 1]! : 0
    }
    const pts = new Float32Array(numPoints * 2)
    for (let i = 0, j = 0; i < numPoints; i++, j += 2) {
      pts[j] = X[i]!
      pts[j + 1] = Y[i]!
    }
    const onCurve = new Uint8Array(numPoints)
    for (let i = 0; i < numPoints; i++) onCurve[i] = flags[i]! & 1 ? 1 : 0
    return { points: pts, onCurve, contours: endPts }
  }

  private readCompoundOutline(gStart: number): Outline {
    let p = gStart
    const numContours = this.dv.getInt16(p, false)
    p += 2
    p += 8
    if (numContours >= 0) return this.readSimpleOutline(gStart)
    const ARG_1_AND_2_ARE_WORDS = 0x0001
    const ARGS_ARE_XY_VALUES = 0x0002
    const WE_HAVE_A_SCALE = 0x0008
    const MORE_COMPONENTS = 0x0020
    const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040
    const WE_HAVE_A_TWO_BY_TWO = 0x0080
    const WE_HAVE_INSTRUCTIONS = 0x0100
    let partsPts: Float32Array[] = []
    let partsOn: Uint8Array[] = []
    let partsEnds: Uint16Array[] = []
    let totalPts = 0
    let totalContours = 0
    let assembledPts = new Float32Array(0)
    let flags = 0
    do {
      flags = this.dv.getUint16(p, false)
      p += 2
      const compGid = this.dv.getUint16(p, false)
      p += 2
      let arg1 = 0,
        arg2 = 0
      if ((flags & ARG_1_AND_2_ARE_WORDS) !== 0) {
        arg1 = this.dv.getInt16(p, false)
        p += 2
        arg2 = this.dv.getInt16(p, false)
        p += 2
      } else {
        arg1 = this.dv.getInt8(p)
        p += 1
        arg2 = this.dv.getInt8(p)
        p += 1
      }
      let a = 1,
        b = 0,
        c = 0,
        d = 1
      if ((flags & WE_HAVE_A_SCALE) !== 0) {
        const s = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
        a = s
        d = s
      } else if ((flags & WE_HAVE_AN_X_AND_Y_SCALE) !== 0) {
        a = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
        d = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
      } else if ((flags & WE_HAVE_A_TWO_BY_TWO) !== 0) {
        a = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
        b = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
        c = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
        d = f2dot14ToFloat(this.dv.getInt16(p, false))
        p += 2
      }
      const subOutline = this.getGlyphOutline(compGid)
      const subPts = subOutline.points
      const subOn = subOutline.onCurve
      const subEnds = subOutline.contours
      let dx = 0,
        dy = 0
      if ((flags & ARGS_ARE_XY_VALUES) !== 0) {
        dx = arg1
        dy = arg2
      } else {
        const idx1 = Math.max(0, Math.min(subPts.length / 2 - 1, arg1))
        const idx2 = Math.max(0, Math.min(assembledPts.length / 2 - 1, arg2))
        const lx = subPts[idx1 * 2]!,
          ly = subPts[idx1 * 2 + 1]!
        const tx = a * lx + b * ly
        const ty = c * lx + d * ly
        const X = assembledPts.length ? assembledPts[idx2 * 2]! : 0
        const Y = assembledPts.length ? assembledPts[idx2 * 2 + 1]! : 0
        dx = X - tx
        dy = Y - ty
      }
      const trPts = new Float32Array(subPts.length)
      for (let i = 0; i < subPts.length; i += 2) {
        const x = subPts[i]!,
          y = subPts[i + 1]!
        trPts[i] = a * x + b * y + dx
        trPts[i + 1] = c * x + d * y + dy
      }
      const offsetPoints = totalPts / 2
      const trEnds = new Uint16Array(subEnds.length)
      for (let i = 0; i < subEnds.length; i++) trEnds[i] = subEnds[i]! + offsetPoints
      partsPts.push(trPts)
      partsOn.push(subOn)
      partsEnds.push(trEnds)
      totalPts += trPts.length
      totalContours += trEnds.length
      const newAssembled = new Float32Array(assembledPts.length + trPts.length)
      newAssembled.set(assembledPts, 0)
      newAssembled.set(trPts, assembledPts.length)
      assembledPts = newAssembled
    } while ((flags & MORE_COMPONENTS) !== 0)
    if ((flags & WE_HAVE_INSTRUCTIONS) !== 0) {
      const n = this.dv.getUint16(p, false)
      p += 2 + n
    }
    const pts = this.concatFloat32(partsPts, totalPts)
    const on = this.concatUint8(partsOn)
    const ends = this.concatUint16(partsEnds, totalContours)
    return { points: pts, onCurve: on, contours: ends }
  }

  private concatFloat32(chunks: Float32Array[], totalFloats: number): Float32Array {
    const out = new Float32Array(totalFloats)
    let off = 0
    for (const a of chunks) {
      out.set(a, off)
      off += a.length
    }
    return out
  }

  private concatUint8(chunks: Uint8Array[]): Uint8Array {
    let total = 0
    for (const a of chunks) total += a.length
    const out = new Uint8Array(total)
    let off = 0
    for (const a of chunks) {
      out.set(a, off)
      off += a.length
    }
    return out
  }

  private concatUint16(chunks: Uint16Array[], total: number): Uint16Array {
    const out = new Uint16Array(total)
    let off = 0
    for (const a of chunks) {
      out.set(a, off)
      off += a.length
    }
    return out
  }
}
