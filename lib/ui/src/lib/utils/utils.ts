export function debounce<T extends any[]>(func: (...args: T) => void, timeout: number): (...args: T) => void {
	let timerId: NodeJS.Timeout

	return function (...args: T) {
		// Если есть запущенный таймер, очистим его
		if (timerId) {
			clearTimeout(timerId)
		}

		// Запускаем новый таймер
		timerId = setTimeout(() => {
			// Вызываем переданную функцию с аргументами после таймаута
			func(...args)
		}, timeout)
	}
}
