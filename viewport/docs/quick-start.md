# 📦 Быстрый старт

## Базовое использование

```html
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="quantum-viewport.js"></script>
  <link rel="stylesheet" href="quantum-viewport.css">
</head>
<body>
<quantum-viewport>
  <div class="node" data-drag-selector>Node 1</div>
  <div class="node" data-drag-selector>Node 2</div>
</quantum-viewport>

<script>
  const viewport = document.querySelector('quantum-viewport')

  // Центрирование содержимого
  viewport.center()

  // Программное управление масштабом
  viewport.setScale(1.5)
</script>
</body>
</html>
``` 