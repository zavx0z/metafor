# ⚙️ Конфигурация

## Базовая настройка

```html

<quantum-viewport id="viewport">
  <!-- content -->
</quantum-viewport>

<script>
  const viewport = document.getElementById('viewport')

  viewport.configure({
    // Включение сетки
    grid: {
      enabled: true,
      size: 50
    },

    // Настройка масштабирования
    handlers: {
      gesture: {
        scale: {
          min: 0.1,    // Минимальный масштаб
          max: 5,      // Максимальный масштаб
          step: 0.1    // Шаг масштабирования
        },
        wheelZoomEnabled: true  // Масштабирование колесиком
      }
    },

    // Настройка анимаций
    animation: {
      duration: 300,
      easing: 'ease-out'
    }
  })
</script>
``` 