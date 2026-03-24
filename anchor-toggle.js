// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — Anchor Toggle (Module 4)
//
// PURPOSE: Let the user set an anchor message so the token bar
// only counts messages ABOVE that point — reflecting what AI sees.
//
// WHY? Solveit only sends messages above the current prompt to AI.
// If you have 200 messages but work at message 50, only 50 go to AI.
// Counting all 200 is misleading. The anchor marks "I'm working here"
// so the bar shows your real context usage.
//
// UX PATTERN: Toggle ON → click a message → captures ID → auto-OFF.
//   1. User clicks 📌 → green border signals "click a message now"
//   2. User clicks any message in the dialog
//   3. Click handler walks UP DOM via closest('[data-sm]')
//      [data-sm] is Solveit's data attribute on every message wrapper
//   4. anchorMsgId is set → button shows the ID → toggle auto-turns OFF
//   5. Token bar recalculates → only counts messages above anchor
//
// PERSISTENCE: Anchor stored in localStorage keyed by dialog name.
// Survives page refresh, MutationObserver re-creation, browser restarts.
// Each dialog remembers its own anchor independently.
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization on double injection.
  if (window.__initAnchorToggle) return;
  window.__initAnchorToggle = true;

  const log = (...args) => console.log('[anchor-toggle]', ...args);

  // PERSISTENCE: localStorage key includes dialog name so each dialog
  // keeps its own anchor. Changing dialogs doesn't cross-contaminate.
  const storageKey = 'anchor_' + _edVar('dlg_name');

  // RESTORE: Check for previous anchor from last session.
  let anchorMsgId = localStorage.getItem(storageKey) || null;
  let selecting = false;
  if (anchorMsgId) {
    log('🔄 Restored anchor from localStorage:', anchorMsgId);
  }

  // CREATE BUTTON: 📌 toggle that attaches below the CRAFT bar (or token bar).
  function createAnchorButton() {
    if (document.getElementById('anchor-toggle')) return;

    // ATTACH POINT: Prefer CRAFT bar if it exists, fall back to token bar.
    // This keeps the visual hierarchy: token bar → craft bar → anchor toggle.
    const craftBar = document.getElementById('craft-bar');
    const tokenBar = document.getElementById('token-bar');
    const insertAfter = craftBar || tokenBar;
    if (!insertAfter) {
      console.warn('[anchor-toggle] ⚠️ No bar found to attach to');
      return;
    }

    // BUILD DOM: Uses CSS classes from content.css for static layout.
    const btn = document.createElement('div');
    btn.id = 'anchor-toggle';
    btn.innerHTML =
      '<span id="anchor-btn" title="Click to select anchor message">📌</span>' +
      '<span id="anchor-id-label">(all messages)</span>';

    // SHARED CONTAINER: Append into the shared floating container so
    // anchor-toggle stays on the same line as token-bar and craft-bar.
    document.getElementById('token-counter-container').appendChild(btn);
    log('✅ Button injected after', insertAfter.id);

    // RESTORE UI: If we have a saved anchor, update the label and recount.
    // This makes the bar reflect the anchor even after page refresh.
    if (anchorMsgId) {
      document.getElementById('anchor-id-label').textContent = anchorMsgId;
      log('🔄 Restoring anchor UI:', anchorMsgId);
      recountWithAnchor(anchorMsgId);
    }

    // TOGGLE HANDLER: Click 📌 to enter/exit selection mode.
    // Green border = active, grey = idle.
    const anchorBtn = document.getElementById('anchor-btn');
    anchorBtn.addEventListener('click', () => {
      selecting = !selecting;
      // Toggle CSS class instead of inline style — cleaner separation
      anchorBtn.classList.toggle('selecting', selecting);
      log('🔀 Selection mode:', selecting ? 'ON' : 'OFF');
    });

    // MESSAGE SELECTION: Document-level click listener.
    // Gated by `selecting` flag — does nothing when OFF.
    // Uses closest('[data-sm]') to find the message wrapper.
    // wrapper.id IS the clean message ID (no stripping needed).
    // Auto-off after selection (one-shot mode).
    document.addEventListener('click', (e) => {
      if (!selecting) return;

      // Don't capture clicks on the toggle button itself
      if (e.target.closest('#anchor-toggle')) return;

      // Walk up DOM to find the message wrapper.
      // [data-sm] is Solveit's own attribute on every message's outer div.
      const wrapper = e.target.closest('[data-sm]');
      if (!wrapper) return;

      const msgId = wrapper.id;
      if (!msgId) return;

      // SET ANCHOR: Update state, persist, update UI
      anchorMsgId = msgId;
      localStorage.setItem(storageKey, msgId);
      document.getElementById('anchor-id-label').textContent = msgId;
      log('📌 Anchor set and saved:', msgId);
      window.dispatchEvent(new CustomEvent('anchorSet', { detail: msgId }));

      // AUTO-OFF: Prevent accidental re-selection (one-shot pattern)
      selecting = false;
      anchorBtn.classList.remove('selecting');
      log('🔀 Selection mode: OFF (auto)');

      // RECOUNT: Tell the token bar to recount with new anchor
      document.dispatchEvent(new CustomEvent('anchor-changed'));
      recountWithAnchor(msgId);
    });

    // No MutationObserver needed — anchor button is injected once on init.
  }

  // RECOUNT: Fetch all messages, find anchor index, sum tokens above it.
  // Updates the main token bar with the filtered count.
  async function recountWithAnchor(anchorId) {
    console.group('[anchor-toggle] 📊 Recounting with anchor:', anchorId);

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

      // FIND ANCHOR: Messages above this index go to AI context
      let anchorIdx = msgs.length;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].id === anchorId) { anchorIdx = i; break; }
      }
      log('📍 Anchor at index', anchorIdx, 'of', msgs.length, 'messages');

      // SUM: Only non-skipped messages ABOVE anchor
      let total = 0;
      let counted = 0;
      for (let i = 0; i < anchorIdx; i++) {
        if (msgs[i].skipped) continue;
        total += (msgs[i].input_tokens || 0) + (msgs[i].output_tokens || 0);
        counted++;
      }
      log('📊 Tokens above anchor:', (total / 1000).toFixed(1) + 'K',
          '| counted:', counted, 'of', anchorIdx, 'messages');

      // UPDATE TOKEN BAR: Apply the anchor-filtered count to the main bar.
      // Same color thresholds as token-bar.js.
      const CAP = 200_000;
      const pct = Math.min(100, total * 100 / CAP);
      const k = (total / 1000).toFixed(0);
      const color = total > CAP * 0.8 ? '#e55' : total > CAP * 0.5 ? '#ea3' : '#8b8';
      const fill = document.getElementById('token-fill');
      const label = document.getElementById('token-label');
      if (fill) { fill.style.width = pct + '%'; fill.style.background = color; }
      if (label) { label.textContent = k + 'K'; label.style.color = color; }

      log('✅ Bar updated:', k + 'K (' + pct.toFixed(1) + '%)');

    } catch (e) {
      console.error('[anchor-toggle] ❌ Recount failed:', e.message);
    }
    console.groupEnd();
  }

  // EXPORT: Other modules read this to know the current anchor.
  // Returns null when no anchor is set → count all messages.
  window._anchorMsgId = () => anchorMsgId;

  // STARTUP: Listen for token-bar injection, then attach button.
  // Also try immediately in case token-bar already exists.
  document.addEventListener('token-bar-ready', () => createAnchorButton());
  if (document.getElementById('token-bar')) createAnchorButton();
})();
