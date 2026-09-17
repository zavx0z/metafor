# 📐 Координатная сетка

## Включение через атрибут

```html
<meta-for-viewport grid>
  <!-- content -->
</meta-for-viewport>
```

## CSS-настройка

```css
meta-for-viewport {
  /* Базовые линии */
  --meta-for-grid-size: 50;
  --meta-for-grid-color: rgba(0, 0, 0, 0.1);
  --meta-for-grid-line-width: 1;

  /* Основные линии */
  --meta-for-grid-main-color: rgba(0, 0, 0, 0.3);
  --meta-for-grid-main-line-width: 2;
}

/* Темная тема */
meta-for-viewport.dark {
  --meta-for-grid-color: rgba(255, 255, 255, 0.1);
  --meta-for-grid-main-color: rgba(255, 255, 255, 0.3);
}
```
