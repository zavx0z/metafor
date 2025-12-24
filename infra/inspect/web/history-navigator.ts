export class HistoryNavigator<T> {
  private cursor = -1
  private chunks: T[][] = []

  load(chunks: T[][]) {
    this.chunks = chunks
    this.cursor = chunks.length - 1
  }

  hasData(): boolean {
    return this.chunks.length > 0
  }

  current(): T[] | null {
    if (!this.hasData()) return null
    if (this.cursor < 0 || this.cursor >= this.chunks.length) return null
    return this.chunks[this.cursor] ?? null
  }

  stepBack(): T[] | null {
    if (!this.hasData()) return null
    if (this.cursor > 0) this.cursor -= 1
    return this.current()
  }

  reset() {
    this.cursor = -1
    this.chunks = []
  }

  isAtStart(): boolean {
    if (!this.hasData()) return true
    return this.cursor <= 0
  }
}







