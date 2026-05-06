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
    ts.LanguageVariant.Standard,
    source,
  )

  // Стек глубины template-substitution. Когда мы внутри `${...}`, после
  // CloseBraceToken нужен reScanTemplateToken — иначе scanner глотает всё
  // до следующего ` как identifier'ы/regex и подсветка едет на следующих
  // строках.
  const templateDepth: number[] = []
  let kind = scanner.scan()
  let prevKind: ts.SyntaxKind | undefined
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    // Если scanner отдал `/` (или `/=`) в контексте, где должен быть regex
    // (после `=`, `(`, `,`, `return`, `[`, `||`, `&&` и т.п.), переключим
    // его на regex-ре-сканирование. Без этого scanner считает `/` делением,
    // а внутри character-class regex может оказаться backtick — после чего
    // scanner ловит "template literal" и съедает весь файл одним string-токеном.
    if (
      (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) &&
      isRegexContext(prevKind)
    ) {
      const reKind = scanner.reScanSlashToken()
      if (reKind === ts.SyntaxKind.RegularExpressionLiteral) {
        kind = reKind
      }
    }

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

    // Tracking template substitution: TemplateHead открывает substitution,
    // CloseBrace внутри substitution либо закрывает её (rescan → TemplateTail)
    // либо переходит к следующей подстановке (rescan → TemplateMiddle).
    if (kind === ts.SyntaxKind.TemplateHead || kind === ts.SyntaxKind.TemplateMiddle) {
      templateDepth.push(0)
    } else if (kind === ts.SyntaxKind.OpenBraceToken && templateDepth.length > 0) {
      templateDepth[templateDepth.length - 1]! += 1
    } else if (kind === ts.SyntaxKind.CloseBraceToken && templateDepth.length > 0) {
      const top = templateDepth[templateDepth.length - 1]!
      if (top > 0) {
        templateDepth[templateDepth.length - 1]! = top - 1
      } else {
        // Конец substitution: scanner думает что прочитал просто `}` —
        // перезапускаем сканирование как template-токен.
        kind = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false)
        // Категоризируем заново под TemplateMiddle/Tail.
        const reStart = scanner.getTokenStart()
        const reEnd = scanner.getTokenEnd()
        const reText = scanner.getTokenText()
        const reCategory = categorize(kind, reText, prevKind)
        if (reCategory !== null && reStart < reEnd) {
          pushSpan(result, lines, lineOffsets, reStart, reEnd, reCategory)
        }
        if (kind === ts.SyntaxKind.TemplateTail) {
          templateDepth.pop()
        }
        // TemplateMiddle оставляет templateDepth текущий уровень — следующая
        // подстановка снова пройдёт по той же логике.
        kind = scanner.scan()
        continue
      }
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

/**
 * Эвристика "после этого токена `/` — это начало regex, не оператор деления".
 * Стандартный подход без AST: regex может появиться там, где ожидается
 * выражение (после `=`, `(`, `,`, `return`, операторов и т.п.), а не там
 * где ожидается оператор (после identifier'а / литерала / `)` / `]`).
 */
function isRegexContext(prev: ts.SyntaxKind | undefined): boolean {
  if (prev === undefined) return true
  switch (prev) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.CloseParenToken:
    case ts.SyntaxKind.CloseBracketToken:
    case ts.SyntaxKind.PlusPlusToken:
    case ts.SyntaxKind.MinusMinusToken:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.SuperKeyword:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
      return false
    default:
      return true
  }
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
