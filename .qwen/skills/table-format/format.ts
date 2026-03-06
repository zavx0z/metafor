#!/usr/bin/env bun

/**
 * Table Format Skill
 *
 * Форматирует ширину колонок таблиц в Markdown-файлах согласно QWEN.md
 *
 * Использование:
 *   bun run .qwen/skills/table-format/format.ts <файл>
 *   bun run .qwen/skills/table-format/format.ts .  # все .md файлы в директории
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"

/**
 * Проверяет, является ли строка разделителем таблицы
 */
function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)*\|?\s*$/.test(line)
}

/**
 * Проверяет, является ли строка содержимым таблицы
 */
function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line) && !isTableDivider(line)
}

/**
 * Разбирает строку таблицы на ячейки
 */
function parseRow(line: string): string[] {
  const trimmed = line.trim()
  // Удаляем начальный и конечный pipe если есть
  const content = trimmed.replace(/^\|\s*/, "").replace(/\s*\|$/, "")
  return content.split("|").map((cell) => cell.trim())
}

/**
 * Форматирует строку таблицы с выровненными колонками
 */
function formatRow(cells: string[], widths: number[], alignLeft = true): string {
  const formatted = cells.map((cell, i) => {
    const width = widths[i] ?? 0
    const padding = width - cell.length
    if (alignLeft) {
      return ` ${cell}${" ".repeat(padding)} `
    } else {
      return ` ${" ".repeat(padding)}${cell} `
    }
  })
  return `|${formatted.join("|")}|`
}

/**
 * Форматирует разделитель таблицы
 */
function formatDivider(cells: string[], widths: number[]): string {
  const formatted = cells.map((cell, i) => {
    const width = widths[i] ?? 0
    const dashes = "-".repeat(width)
    return ` ${dashes} `
  })
  return `|${formatted.join("|")}|`
}

/**
 * Вычисляет максимальную ширину для каждой колонки
 */
function calculateWidths(rows: string[][]): number[] {
  const widths: number[] = []
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cellLength = row[i]?.length ?? 0
      if (!widths[i] || cellLength > widths[i]) {
        widths[i] = cellLength
      }
    }
  }
  return widths
}

/**
 * Форматирует таблицу в тексте
 */
function formatTable(lines: string[]): string[] {
  if (lines.length < 2) return lines

  // Находим все строки таблицы
  const tableRows: { index: number; line: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i]!) || isTableDivider(lines[i]!)) {
      tableRows.push({ index: i, line: lines[i]! })
    }
  }

  // Если это не таблица (меньше 2 строк), возвращаем как есть
  if (tableRows.length < 2) return lines

  // Проверяем, что вторая строка - разделитель
  const secondRow = tableRows[1]?.line ?? ""
  if (!isTableDivider(secondRow)) {
    return lines // Это не таблица
  }

  // Парсим все строки таблицы
  const parsedRows = tableRows.map(({ line }) => parseRow(line))
  const widths = calculateWidths(parsedRows)

  // Форматируем строки
  const result = [...lines]
  for (let i = 0; i < tableRows.length; i++) {
    const { index } = tableRows[i]!
    const row = parsedRows[i]!
    if (isTableDivider(tableRows[i]!.line)) {
      result[index] = formatDivider(row, widths)
    } else {
      result[index] = formatRow(row, widths)
    }
  }

  return result
}

/**
 * Обрабатывает markdown файл
 */
async function processFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf-8")
  const lines = content.split("\n")

  // Находим все таблицы и форматируем их
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    // Проверяем, начинается ли таблица с этой строки
    if (isTableRow(lines[i]!) && i + 1 < lines.length && isTableDivider(lines[i + 1]!)) {
      // Находим конец таблицы
      let tableEnd = i + 2
      while (tableEnd < lines.length && isTableRow(lines[tableEnd]!)) {
        tableEnd++
      }
      // Форматируем таблицу
      const tableLines = lines.slice(i, tableEnd)
      const formatted = formatTable(tableLines)
      result.push(...formatted)
      i = tableEnd
    } else {
      result.push(lines[i]!)
      i++
    }
  }

  const newContent = result.join("\n")
  if (newContent !== content) {
    await writeFile(filePath, newContent, "utf-8")
    console.log(`✅ Отформатирован: ${filePath}`)
  } else {
    console.log(`✓ Без изменений: ${filePath}`)
  }
}

/**
 * Рекурсивно находит все markdown файлы в директории
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...(await findMarkdownFiles(fullPath)))
    } else if (entry.isFile() && extname(entry.name) === ".md") {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Главная функция
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log("Использование:")
    console.log("  bun run .qwen/skills/table-format/format.ts <файл>")
    console.log("  bun run .qwen/skills/table-format/format.ts .  # все .md файлы")
    process.exit(1)
  }

  const target = args[0]!

  try {
    const stat = await Bun.file(target).stat()
    if (stat.isDirectory()) {
      const files = await findMarkdownFiles(target)
      console.log(`Найдено ${files.length} markdown файлов`)
      for (const file of files) {
        await processFile(file)
      }
    } else if (stat.isFile()) {
      await processFile(target)
    } else {
      console.error(`❌ Не найдено: ${target}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`❌ Ошибка: ${error}`)
    process.exit(1)
  }
}

main()
