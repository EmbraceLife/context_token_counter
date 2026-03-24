// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — Token Bar Module
//
// PURPOSE: Count tokens for the current dialog and render a
// progress bar below the editor tabs. This is the foundation bar
// that all other modules (CRAFT bar, anchor toggle) attach to.
//
// HOW IT WORKS:
//   1. Fetch all messages via /find_msgs_ endpoint
//   2. Sum input_tokens + output_tokens for non-skipped messages
//   3. Render as a colored bar: green < 50%, yellow < 80%, red > 80%
//   4. Re-count on every HTMX WebSocket message (debounced 2s)
//
// CAP (200K): The maximum token budget for AI context.
// All thresholds are percentage-based (0.5 and 0.8), so changing
// CAP cascades everywhere: bar width, yellow zone, red zone.
//
// ANCHOR INTEGRATION: If Module 4 (anchor-toggle) has set an anchor,
// we only count messages ABOVE it — matching what AI actually sees.
// window._anchorMsgId is a function exported by Module 4.
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization if script is injected twice.
  // Each module gets its own __init key so they can be loaded independently.
  if (window.__initTokenBar) return;
  window.__initTokenBar = true;

  const CAP = 200_000;
  const DEBOUNCE_MS = 2000;
  const log = (...args) => console.log('[token-bar]', ...args);
  let timer = null;
  let lastTotal = 0;

  // RENDER: Update the bar fill width and color based on token count.
  // Called after every token recount. Stores lastTotal so injectBar()
  // can restore state if the bar gets destroyed by HTMX.
  function renderBar(total) {
    lastTotal = total;
    const pct = Math.min(100, total * 100 / CAP);
    const k = (total / 1000).toFixed(0);
    // COLOR THRESHOLDS: Green = comfortable, yellow = watch out, red = danger
    // These match the 50%/80% breakpoints used throughout the app.
    const color = total > CAP * 0.8 ? '#e55' : total > CAP * 0.5 ? '#ea3' : '#8b8';
    const fill = document.getElementById('token-fill');
    const label = document.getElementById('token-label');
    if (fill) { fill.style.width = pct + '%'; fill.style.background = color; }
    if (label) { label.textContent = k + 'K'; label.style.color = color; }
    log('rendered:', k + 'K (' + pct.toFixed(1) + '%) color:', color);
  }

  // FETCH + COUNT: Hit /find_msgs_ to get all dialog messages with metadata.
  // Sum tokens for non-skipped messages, respecting anchor if set.
  async function refresh() {
    try {
      const resp = await fetch('/find_msgs_', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          dlg_name: _edVar('dlg_name'),
          include_meta: 1,
          include_output: 0,
          trunc_in: 1
        })
      });
      const msgs = (await resp.json()).msgs || [];

      // ANCHOR-AWARE COUNTING: If Module 4 has set an anchor,
      // only count messages ABOVE it — matching what AI actually sees.
      // If no anchor is set (null), count all messages as before.
      const anchorId = window._anchorMsgId ? window._anchorMsgId() : null;
      let anchorIdx = msgs.length;
      if (anchorId) {
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].id === anchorId) { anchorIdx = i; break; }
        }
        log('anchor filtering: counting', anchorIdx, 'of', msgs.length, 'messages');
      }

      let total = 0;
      for (let i = 0; i < anchorIdx; i++) {
        if (msgs[i].skipped) continue;
        total += (msgs[i].input_tokens || 0) + (msgs[i].output_tokens || 0);
      }
      renderBar(total);
    } catch (e) {
      log('❌ refresh failed:', e.message);
      const label = document.getElementById('token-label');
      if (label) label.textContent = '⚠️';
    }
  }

  // DEBOUNCE: Don't recount on every single HTMX message — batch them.
  // 2s delay means rapid cell runs only trigger one recount at the end.
  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, DEBOUNCE_MS);
  }

  // INJECT: Create the bar DOM and insert it after the editor tab row.
  // Uses CSS classes from content.css for layout, dynamic values for fill/color.
  function injectBar() {
    if (document.getElementById('token-bar')) return;
    const tab = document.querySelector('#full_editor .uk-tab');
    if (!tab) return;

    const pct = Math.min(100, lastTotal * 100 / CAP);
    const k = (lastTotal / 1000).toFixed(0);
    const color = lastTotal > CAP * 0.8 ? '#e55' : lastTotal > CAP * 0.5 ? '#ea3' : '#8b8';

    const bar = document.createElement('div');
    bar.id = 'token-bar';
    // token-track class provides the grey background track
    bar.innerHTML =
      '<div class="token-track">' +
        '<div id="token-fill" style="width:' + pct + '%; background:' + color + ';"></div>' +
      '</div>' +
      '<span id="token-label" style="color:' + color + ';">' + k + 'K</span>';

    // SHARED CONTAINER: One fixed floating div holds all three modules
    // (token-bar, craft-bar, anchor-toggle) so they move together as a unit.
    // Dragging the container moves all three — no per-module drag logic needed.
    let container = document.getElementById('token-counter-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'token-counter-container';
      container.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;cursor:grab;display:flex;flex-direction:row;align-items:center;gap:8px;';
      document.body.appendChild(container);

      // DRAGGABLE: Drag the container — all child modules move together.
      let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
      container.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SPAN') return;
        isDragging = true;
        const r = container.getBoundingClientRect();
        dragOffsetX = e.clientX - r.left;
        dragOffsetY = e.clientY - r.top;
        container.style.cursor = 'grabbing';
      });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        container.style.left   = (e.clientX - dragOffsetX) + 'px';
        container.style.top    = (e.clientY - dragOffsetY) + 'px';
        container.style.right  = 'auto';
        container.style.bottom = 'auto';
      });
      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false; container.style.cursor = 'grab';
      });
    }
    container.appendChild(bar);
    log('✅ bar injected after tab row');
    document.dispatchEvent(new CustomEvent('token-bar-ready'));

    // CARD-COUNT OBSERVER: Only refresh when messages are added/removed.
    // Watches .dlg-body direct children only (no subtree) — cheap.
    // Compares card count to detect add/delete, debounced at 2s.
    const dlgBody = document.querySelector('.dlg-body');
    if (dlgBody) {
      let lastCardCount = document.querySelectorAll('.uk-card.msg-card[id$="-i"]').length;
      new MutationObserver(() => {
        const now = document.querySelectorAll('.uk-card.msg-card[id$="-i"]').length;
        if (now !== lastCardCount) {
          lastCardCount = now;
          log('📊 Card count changed →', now, '— scheduling refresh');
          scheduleRefresh();
        }
      }).observe(dlgBody, { childList: true });
    }

    // First load — if we have no data yet, trigger a recount
    if (lastTotal === 0) refresh();

    // RE-INJECT OBSERVER: Watch stable ancestor for HTMX swaps that destroy the bar.
    // #chat-box never gets swapped — safe to observe permanently.
    // When token-bar disappears (HTMX rebuilt #full_editor), re-inject immediately.
    const chatBox = document.querySelector('#chat-box');
    if (chatBox) {
      new MutationObserver(() => {
        if (!document.getElementById('token-bar')) {
          log('🔄 token-bar gone (HTMX swap?) — re-injecting');
          injectBar();
        }
      }).observe(chatBox, { childList: true, subtree: true });
    }
  }

  // LISTEN: Recount when anchor changes (dispatched by anchor-toggle).
  document.addEventListener('anchor-changed', scheduleRefresh);

  // STARTUP: Wait for the editor tab row to exist, then inject.
  // SolveIt loads asynchronously — the tab may not exist immediately.
  function check() {
    if (document.querySelector('#full_editor .uk-tab')) injectBar();
    else setTimeout(check, 100);
  }
  check();
})();
