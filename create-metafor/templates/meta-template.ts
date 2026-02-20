/**
 * Сгенерировать шаблон meta.ts для группы с enum операций
 */
export function generateGroupMetaTemplate(
  name: string,
  description: string,
  enumValues: string[]
): string {
  return `import "@metafor/meta"

export default MetaFor("${name}", { desc: "${description}" })
  .context((t) => ({
    operation: t.enum(
      ${enumValues.map((v) => `"${v}"`).join(",\n      ")}
    ).optional({ label: "Тип операции" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html\`
      \${context.operation &&
      html\` <meta-for src="zavx0z/${name}-\${context.operation}" context=\${{ args: context.args }} /> \`}
    \`,
  })
`
}

/**
 * Сгенерировать шаблон meta.ts для команды без enum
 */
export function generateCommandMetaTemplate(
  name: string,
  description: string
): string {
  return `import "@metafor/meta"

export default MetaFor("${name}", { desc: "${description}" })
  .context((t) => ({
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({})
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html\`
      \${context.error && html\`<div class="error">\${context.error}</div>\`}
    \`,
  })
`
}

/**
 * Сгенерировать шаблон meta.ts
 */
export function generateMetaTemplate(
  name: string,
  description: string,
  enumValues: string[]
): string {
  if (enumValues.length > 0) {
    return generateGroupMetaTemplate(name, description, enumValues)
  }
  return generateCommandMetaTemplate(name, description)
}
