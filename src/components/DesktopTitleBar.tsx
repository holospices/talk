import { useEffect, useState } from 'react'
import { Copy, Maximize2, Minus, X } from 'lucide-react'

export function DesktopTitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const api = window.talkDesktop
    if (!api) return
    void api.isMaximized().then(setMaximized)
    return api.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className="desktop-titlebar">
      <div className="desktop-titlebar-brand">
        <img src="./app-icon.png" alt="" />
        <span>Talk</span>
      </div>
      <div className="desktop-titlebar-drag" />
      <div className="desktop-window-controls">
        <button type="button" onClick={() => window.talkDesktop?.minimize()} aria-label="最小化"><Minus size={14} /></button>
        <button type="button" onClick={() => window.talkDesktop?.toggleMaximize()} aria-label={maximized ? '还原' : '最大化'}>
          {maximized ? <Copy size={12} /> : <Maximize2 size={12} />}
        </button>
        <button type="button" className="desktop-close" onClick={() => window.talkDesktop?.close()} aria-label="关闭"><X size={14} /></button>
      </div>
    </header>
  )
}
