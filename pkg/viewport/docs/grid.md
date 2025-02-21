# 📐 Координатная сетка

## Включение через атрибут

```html
<quantum-viewport grid>
  <!-- content -->
</quantum-viewport>
```

## CSS-настройка

```css
quantum-viewport {
  /* Базовые линии */
  --viewport-grid-size: 50;
  --viewport-grid-color: rgba(0, 0, 0, 0.1);
  --viewport-grid-line-width: 1;

  /* Основные линии */
  --viewport-grid-main-color: rgba(0, 0, 0, 0.3);
  --viewport-grid-main-line-width: 2;
}

/* Темная тема */
quantum-viewport.dark {
  --viewport-grid-color: rgba(255, 255, 255, 0.1);
  --viewport-grid-main-color: rgba(255, 255, 255, 0.3);
}
``` 