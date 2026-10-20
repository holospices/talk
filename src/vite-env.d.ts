/// <reference types="vite/client" />

/** Injected by vite.config.ts's `define` from package.json's version field. */
declare const __APP_VERSION__: string

interface Window {
  talkDesktop?: {
    platform: string
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(callback: (maximized: boolean) => void): () => void
  }
}
