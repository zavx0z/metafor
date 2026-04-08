export enum YogaLoadingState {
  PENDING,
  LOADING,
  READY,
  ERROR,
}

/**
 * Singleton service for managing the asynchronous lifecycle of Yoga Layout.
 * Handles WASM loading and prevents race conditions.
 */
export class YogaService {
  private static _instance: YogaService

  public static get instance(): YogaService {
    if (!YogaService._instance) {
      YogaService._instance = new YogaService()
    }
    return YogaService._instance
  }

  private _state: YogaLoadingState = YogaLoadingState.PENDING
  private _yoga: any = null
  private initializationPromise: Promise<any> | null = null

  private constructor() {}

  public get state(): YogaLoadingState {
    return this._state
  }

  /**
   * Initializes the Yoga WASM module. Safe to call multiple times.
   * Returns a promise that resolves when Yoga is ready.
   */
  public async initialize(): Promise<any> {
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    this._state = YogaLoadingState.LOADING

    this.initializationPromise = (async () => {
      try {
        // @ts-ignore Прямой импорт ES модуля
        const yogaModule = await import("/yoga-wasm-base64-esm.js")
        const yogaExport = yogaModule.default || yogaModule

        if (typeof yogaExport === "function") {
          this._yoga = await yogaExport()
        } else {
          this._yoga = yogaExport
        }

        this._state = YogaLoadingState.READY
        return this._yoga
      } catch (error) {
        this._state = YogaLoadingState.ERROR
        this.initializationPromise = null
        console.error("YogaService: Error loading WASM:", error)
        throw error
      }
    })()

    return this.initializationPromise
  }

  /**
   * Returns the initialized Yoga instance.
   * @throws Error if usage is attempted before initialization.
   */
  public get yoga(): any {
    if (this._state !== YogaLoadingState.READY || !this._yoga) {
      throw new Error("YogaService not ready. Call await YogaService.instance.initialize() first.")
    }
    return this._yoga
  }
}

export default YogaService
