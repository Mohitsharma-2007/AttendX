/**
 * AttendX console protection.
 *
 * - Disables devtools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U) on web.
 * - Blocks the context menu on web.
 * - Replaces console output with a branded AttendX console.
 * - Detects devtools opening by window size heuristics and blurs the app.
 *
 * Inside the Capacitor APK the WebView has no reachable inspector in release
 * builds, so the size heuristics are skipped there.
 */

const isNative =
  typeof window !== 'undefined' &&
  Boolean((window as any).Capacitor?.isNativePlatform?.());

export function installConsoleProtection() {
  if (typeof window === 'undefined') return;

  // ── AttendX branded console ──────────────────────────────────────────
  const brand = [
    '%cAttendX%c Secure console · v1.0.3',
    'background:#10b981;color:#04110d;padding:2px 8px;border-radius:4px 0 0 4px;font-weight:800',
    'background:#0b1311;color:#94a3b8;padding:2px 8px;border-radius:0 4px 4px 0',
  ];
  try {
    console.log(...brand);
    console.log(
      '%cWARNING%c This console is for AttendX diagnostics only. Do not paste or run code from unknown sources.',
      'color:#ef4444;font-weight:800',
      'color:inherit',
    );
  } catch {
    /* console unavailable */
  }

  if (isNative) return;

  // ── Block devtools shortcuts on web ─────────────────────────────────
  const blockedCombos = (event: KeyboardEvent): boolean => {
    // Some Android WebViews / synthetic events dispatch keydown with an
    // undefined `key` — guard so we never crash the page on it.
    const key = (event.key ?? '').toUpperCase();
    if (event.key === 'F12') return true;
    if (event.ctrlKey && event.shiftKey && ['I', 'J', 'C'].includes(key)) return true;
    if (event.metaKey && event.altKey && ['I', 'J', 'C'].includes(key)) return true;
    if ((event.ctrlKey || event.metaKey) && key === 'U') return true;
    return false;
  };

  window.addEventListener('keydown', (event) => {
    if (blockedCombos(event)) {
      event.preventDefault();
      event.stopPropagation();
      try {
        console.log('[AttendX] Inspect element is disabled on AttendX web.');
      } catch {}
    }
  }, true);

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // ── Devtools open detection (window size heuristic) ──────────────────
  const threshold = 170;
  const check = () => {
    const wide = window.outerWidth - window.innerWidth > threshold;
    const tall = window.outerHeight - window.innerHeight > threshold;
    const open = wide || tall;
    document.documentElement.style.filter = open ? 'blur(14px)' : '';
    document.documentElement.style.pointerEvents = open ? 'none' : '';
  };
  window.addEventListener('resize', check);
  check();
}
