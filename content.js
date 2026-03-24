// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — Content Script Loader
//
// PURPOSE: Inject token counter modules into the page's MAIN world
// in strict order. Module dependency chain requires sequential loading:
//   token-bar.js → craft-discover.js → craft-count.js → craft-bar.js → anchor-toggle.js
//
// WHY MAIN WORLD? All modules call _edVar('dlg_name') to get the
// current dialog name. _edVar lives on the PAGE's window object —
// content script isolation can't see it. MAIN world injection via
// <script src="..."> gives us direct access to page globals.
//
// WHY SEQUENTIAL? Module 2 calls window.discoverCrafts (from Module 1).
// Module 3 reads window._craftTokens (from Module 2).
// Module 4 reads window._anchorMsgId (set by itself, read by Module 0).
// Loading out of order → undefined references → silent failures.
//
// RE-INJECTION: Not needed because each module self-heals via
// MutationObserver — if HTMX destroys a bar, the observer re-injects it.
// Page refresh? Chrome re-runs this loader automatically.
// ═══════════════════════════════════════════════════════════════

(async function () {
  const log = (...args) => console.log('[token-counter-loader]', ...args);

  log('content script running, url:', location.href);

  // GUARD: Only inject on dialog pages — skip dashboard, terminal, folder views.
  // Dialog pages have paths like /dialog_xxx. Non-dialog pages don't need token bars.
  if (!location.pathname.startsWith('/dialog_')) {
    log('not a dialog page, skipping token counter injection');
    return;
  }

  // ALIVE CHECK: Chrome can invalidate extension context during updates.
  // If the runtime is gone, bail out — script injection would throw.
  const alive = () => !!chrome.runtime?.id;

  // INJECT: Create a <script> tag pointing to our extension file.
  // The src uses chrome.runtime.getURL to get the extension:// URL.
  // onload fires after the browser has fully executed the script.
  // We remove the tag after load — the code persists in memory.
  function loadScript(path) {
    return new Promise((resolve, reject) => {
      if (!alive()) return reject(new Error('Extension context invalidated'));
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(path);
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => reject(new Error('Failed to load ' + path));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // LOAD ORDER: token-bar first (renders the base bar that others attach to),
  // then craft-discover → craft-count → craft-bar (the CRAFT chain),
  // finally anchor-toggle (attaches to whichever bar exists).
  try {
    await loadScript('token-bar.js');
    log('✅ token-bar.js loaded');
    await loadScript('craft-discover.js');
    log('✅ craft-discover.js loaded');
    await loadScript('craft-count.js');
    log('✅ craft-count.js loaded');
    await loadScript('craft-bar.js');
    log('✅ craft-bar.js loaded');
    await loadScript('anchor-toggle.js');
    log('✅ anchor-toggle.js loaded');
    await loadScript('heartbeat.js');
    log('✅ heartbeat.js loaded');
    log('🎉 all modules injected');
  } catch (e) {
    log('❌ injection failed:', e.message);
  }
})();
