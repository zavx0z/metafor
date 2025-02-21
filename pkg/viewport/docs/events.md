# 🎮 События

## Обработка событий

```javascript
// Изменение масштаба
viewport.addEventListener('scale', (e) => {
  console.log('Новый масштаб:', e.detail)
})

// Перемещение viewport
viewport.addEventListener('translate', (e) => {
  console.log('Новая позиция:', e.detail)
})

// Начало перетаскивания элемента
viewport.addEventListener('dragstart', (e) => {
  console.log('Начало перетаскивания:', e.detail)
})

// Окончание перетаскивания
viewport.addEventListener('dragend', (e) => {
  console.log('Окончание перетаскивания:', e.detail)
})
``` 