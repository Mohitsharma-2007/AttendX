import { Capacitor } from '@capacitor/core'

/**
 * Returns true only when the UI is running inside the packaged Capacitor app.
 *
 * Detection layers, most to least reliable:
 *  1. The Capacitor bridge itself (native platform flag).
 *  2. The global bridge object some Android WebViews expose late.
 *  3. The Capacitor HTTPS-localhost asset origin used by the APK WebView.
 *  4. Any Android WebView user agent ("; wv)" token) — a regular browser on
 *     the deployed website never carries that token, so the download link
 *     stays visible there while disappearing inside the installed app.
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false

  const platform = Capacitor.getPlatform()
  if (platform === 'android' || platform === 'ios' || Capacitor.isNativePlatform()) {
    return true
  }

  const bridge = (window as typeof window & { Capacitor?: typeof Capacitor }).Capacitor
  const bridgePlatform = bridge?.getPlatform?.()
  if (bridgePlatform === 'android' || bridgePlatform === 'ios' || bridge?.isNativePlatform?.()) {
    return true
  }

  // Capacitor serves the bundled assets from an https://localhost origin.
  const isCapacitorAssetOrigin =
    window.location.protocol === 'https:' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  // Any Android WebView (the token "; wv)" in the user agent) is the packaged
  // app, never a user's browser. This catches devices where the Capacitor
  // bridge initialises late or is otherwise unavailable.
  const isWebView = /\bwv\b/.test(navigator.userAgent)

  const isAndroid = /\bAndroid\b/i.test(navigator.userAgent)

  return (isAndroid && isCapacitorAssetOrigin) || isWebView
}
