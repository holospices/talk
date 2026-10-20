import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

interface Props {
  children: ReactNode
  resetKey?: string
}

interface State {
  hasError: boolean
  resetKey?: string
}

/** Keeps an unexpected render failure from taking the entire app to a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the diagnostic in development tools without exposing internals in the UI.
    console.error('[app] render failed', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex h-full flex-col items-center justify-center gap-4 bg-[#f4f4f6] px-8 text-center">
          <CircleAlert size={38} className="text-[var(--ui-danger)]" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-gray-900">页面出了点问题</h1>
            <p className="mt-2 text-sm text-gray-500">本地聊天数据没有丢失，重新加载即可继续。</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white"
          >
            重新加载
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
