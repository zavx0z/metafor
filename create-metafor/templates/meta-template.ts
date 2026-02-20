/**
 * Сгенерировать шаблон meta.ts
 */
export function generateMetaTemplate(name: string, description: string): string {
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
