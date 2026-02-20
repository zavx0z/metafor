/**
 * Сгенерировать .gitignore для пакета
 */
export function generateGitignore(): string {
  return `node_modules/
dist/
*.json
`
}

/**
 * Сгенерировать index.html для пакета
 */
export function generateIndexHtml(packageName: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${description}</title>
</head>
<body>
  <meta-for src="zavx0z/${packageName}"></meta-for>
</body>
</html>
`
}
