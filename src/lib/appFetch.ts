/** Use Electron's same-origin protocol proxy without changing Android/web behavior. */
export function appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  // The development window is served from Vite (http://) but still has the
  // Electron preload bridge. Route it through the same proxy as packaged
  // builds so signed image URLs do not hit browser CORS restrictions.
  const isElectronDesktop = typeof window !== 'undefined' && Boolean(window.talkDesktop)
  if (!/^https?:\/\//i.test(raw) || !isElectronDesktop) return fetch(input, init)
  return fetch(`talk://app/__api__/${encodeURIComponent(raw)}`, init).catch(() => fetch(input, init))
}
