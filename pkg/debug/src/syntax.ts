/**
 * Серверная токенизация TS/JS через ts.createScanner.
 *
 * Идея: sidecar (Bun runtime) уже импортирует typescript для других вещей
 * (peerDep monorepo); прогнать через scanner весь scriptSource дешевле, чем
 * тащить ts-bundle (~10MB) в браузерный WebGPU UI. Клиент получает компактный
 * Token[][] (одна линия = массив токенов) и рендерит каждый с своим цветом.
 *
 * Категории сжаты до одного символа в JSON, чтобы network payload не пух.
 */

import ts from "typescript"

export type TokenCategory =
  | "k"  // keyword (const/let/return/...)
  | "s"  // string literal / template / JSX text
  | "n"  // number / bigint / regex
  | "c"  // comment
  | "t"  // type-like identifier (PascalCase)
  | "f"  // function-call identifier
  | "p"  // punctuation / operator
  | "d"  // default (identifier / whitespace)

export type Token = {
  s: number   // start column (0-based, в строке)
  e: number   // end column (exclusive)
  c: TokenCategory
}

export type SourceTokens = Token[][]

/**
 * Токенизирует исходник целиком и раскидывает токены по строкам.
 * Многострочные токены (template literals, /* ... *​/) разрезаются: каждая
 * строка получает свой кусок с тем же category.
 */
export function tokenize(source: string): SourceTokens {
  const lines = source.split("\n")
  const result: SourceTokens = lines.map(() => [])

  // Префиксная сумма: lineOffsets[i] = byte/char offset начала строки i в source.
  const lineOffsets = new Array<number>(lines.length + 1)
  lineOffsets[0] = 0
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i + 1] = (lineOffsets[i] ?? 0) + (lines[i]?.length ?? 0) + 1 // +1 на \n
  }

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /*skipTrivia*/ false,
    ts.LanguageVariant.JSX,
    source,
  )

  let kind = scanner.scan()
  let prevKind: ts.SyntaxKind | undefined
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    const start = scanner.getTokenStart()
    const end = scanner.getTokenEnd()
    const text = scanner.getTokenText()
    const category = categorize(kind, text, prevKind)

    if (category !== null && start < end) {
      pushSpan(result, lines, lineOffsets, start, end, category)
    }

    if (
      kind !== ts.SyntaxKind.WhitespaceTrivia &&
      kind !== ts.SyntaxKind.NewLineTrivia &&
      kind !== ts.SyntaxKind.SingleLineCommentTrivia &&
      kind !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      prevKind = kind
    }

    kind = scanner.scan()
  }

  return result
}

function pushSpan(
  result: SourceTokens,
  lines: string[],
  lineOffsets: number[],
  start: number,
  end: number,
  category: TokenCategory,
): void {
  // Бинарный поиск строки по offset'у — токенов много, lines.findIndex линейный медленный.
  let lineIndex = upperBound(lineOffsets, start) - 1
  if (lineIndex < 0) lineIndex = 0

  let cursor = start
  while (cursor < end && lineIndex < lines.length) {
    const lineStart = lineOffsets[lineIndex] ?? 0
    const lineLen = lines[lineIndex]?.length ?? 0
    const lineEnd = lineStart + lineLen
    const spanEnd = Math.min(end, lineEnd)
    const sCol = cursor - lineStart
    const eCol = spanEnd - lineStart
    if (eCol > sCol) {
      const bucket = result[lineIndex]
      if (bucket !== undefined) bucket.push({s: sCol, e: eCol, c: category})
    }
    cursor = spanEnd + 1 // +1 — пропуск \n при переходе на следующую строку
    lineIndex++
  }
}

function upperBound(arr: number[], value: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((arr[mid] ?? 0) <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

function categorize(kind: ts.SyntaxKind, text: string, prevKind: ts.SyntaxKind | undefined): TokenCategory | null {
  switch (kind) {
    case ts.SyntaxKind.SingleLineCommentTrivia:
    case ts.SyntaxKind.MultiLineCommentTrivia:
    case ts.SyntaxKind.JSDocComment:
      return "c"
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateHead:
    case ts.SyntaxKind.TemplateMiddle:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.JsxText:
      return "s"
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return "n"
    case ts.SyntaxKind.RegularExpressionLiteral:
      return "n"
    case ts.SyntaxKind.WhitespaceTrivia:
    case ts.SyntaxKind.NewLineTrivia:
    case ts.SyntaxKind.ConflictMarkerTrivia:
    case ts.SyntaxKind.ShebangTrivia:
      return null
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      // PascalCase → тип/класс. Иначе если следующее token будет '(' (мы это
      // не знаем заранее) — всё равно функция; в одном проходе сделаем
      // простой эвристикой: если предыдущий токен был 'function', 'new',
      // 'class', 'interface', 'type' — это identifier-определение того типа.
      // Не сильно точно, но контрастно.
      if (text.length > 0 && text[0] === text[0]?.toUpperCase() && /^[A-Z]/.test(text)) return "t"
      if (
        prevKind === ts.SyntaxKind.FunctionKeyword ||
        prevKind === ts.SyntaxKind.NewKeyword ||
        prevKind === ts.SyntaxKind.ClassKeyword
      ) return "f"
      return "d"
    default:
      // Вся семья keyword'ов (FirstKeyword..LastKeyword).
      if (kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword) return "k"
      // Punctuation/operators (FirstPunctuation..LastPunctuation, plus operators).
      if (kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation) return "p"
      return "d"
  }
}
