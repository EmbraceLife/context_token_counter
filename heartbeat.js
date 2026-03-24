// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — Heartbeat Module
//
// PURPOSE: Remind the user to send a prompt if they've been idle
// for 4 minutes. Injects a heartbeat prompt automatically so the
// AI context stays fresh and the user stays engaged.
//
// ALGORITHM (simple, no mid-countdown interrupts):
//   1. Find the most recent prompt message ID → save as savedId
//   2. Start a 4-minute visible countdown in the container
//   3. When countdown reaches 0:
//      a. Re-fetch most recent prompt ID
//      b. If DIFFERENT from savedId → user already sent something
//         → update savedId, restart countdown (all good)
//      c. If SAME → user was idle → inject heartbeat prompt
//         → update savedId, restart countdown
//
// WHY NO MID-COUNTDOWN POLLING?
// We only care about the state at the moment the 4 minutes expire.
// Polling during countdown adds complexity with no benefit — the
// check at T=4min tells us everything we need to know.
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization if script is injected twice.
  if (window.__initHeartbeat) return;
  window.__initHeartbeat = true;

  const INTERVAL_MS = 4 * 60 * 1000;  // 4 minutes
  const HEARTBEAT_TEXT = '🕐 Heartbeat: 4 minutes have passed — are you still there? Feel free to continue or ask a new question.';
  const log = (...args) => console.log('[heartbeat]', ...args);

  let savedId = null;       // Most recent prompt msg ID at last check
  let countdownTimer = null; // setInterval handle for countdown display
  let fireTimer = null;      // setTimeout handle for the 4-min trigger
  let secondsLeft = INTERVAL_MS / 1000;

  // ── DISPLAY ──────────────────────────────────────────────────
  // INJECT BOXES: Add two bordered boxes into the shared container,
  // matching the mockup — left box = countdown, right box = saved ID.
  // Both sit at the right end of the existing bar row.
  function injectLabel() {
    if (document.getElementById('heartbeat-timer')) return;
    const container = document.getElementById('token-counter-container');
    if (!container) {
      setTimeout(injectLabel, 500);
      return;
    }

    const boxStyle = 'display:inline-block;border:1px solid #888;border-radius:3px;' +
                     'padding:1px 5px;font-size:11px;font-family:monospace;' +
                     'white-space:nowrap;min-width:36px;text-align:center;color:#aaa;';

    // LEFT BOX: countdown timer
    const timerBox = document.createElement('span');
    timerBox.id = 'heartbeat-timer';
    timerBox.style.cssText = boxStyle;
    timerBox.textContent = '4:00';

    // RIGHT BOX: truncated saved prompt ID
    const idBox = document.createElement('span');
    idBox.id = 'heartbeat-id';
    idBox.style.cssText = boxStyle + 'min-width:60px;';
    idBox.textContent = '—';

    container.appendChild(timerBox);
    container.appendChild(idBox);
    log('✅ heartbeat boxes injected');
  }

  // UPDATE DISPLAY: Tick the countdown and refresh the saved ID box.
  function updateDisplay() {
    const timerBox = document.getElementById('heartbeat-timer');
    const idBox    = document.getElementById('heartbeat-id');
    if (timerBox) {
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      timerBox.textContent = m + ':' + String(s).padStart(2, '0');
      // COLOR SHIFT: neutral → yellow → red as deadline approaches
      timerBox.style.color = secondsLeft < 60 ? '#e55' : secondsLeft < 120 ? '#ea3' : '#aaa';
    }
    // ID BOX: show first 9 chars of savedId (e.g. "_2e40c196")
    if (idBox) {
      idBox.textContent = savedId ? savedId.slice(0, 9) : '—';
    }
  }

  // ── API HELPERS ───────────────────────────────────────────────
  // FETCH PROMPT BEFORE ANCHOR: Find all prompt messages, then return
  // the one immediately before the anchor message in dialog order.
  // WHY ANCHOR-RELATIVE? The anchor is our fixed reference point.
  // We want to know if the user added a NEW prompt above the anchor —
  // not whether the last prompt in the whole dialog changed (that would
  // always look "new" after we inject a heartbeat ourselves).
  async function fetchLatestPromptId() {
    try {
      const anchorId = window._anchorMsgId ? window._anchorMsgId() : null;
      log('anchor ID:', anchorId);
      const resp = await fetch('/find_msgs_', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          dlg_name: _edVar('dlg_name'),
          include_meta: 1,
          include_output: 0
        })
      });
      const data = await resp.json();
      const msgs = data.msgs || [];
      if (!msgs.length) return null;

      if (!anchorId) {
        // No anchor set — fall back to last message
        return msgs[msgs.length - 1].id;
      }

      // FIND ANCHOR POSITION: Find the message immediately before the anchor
      // (any type — anchor is a note, so we must search all messages)
      const anchorIdx = msgs.findIndex(m => m.id === anchorId);
      if (anchorIdx <= 0) return msgs[msgs.length - 1].id;  // anchor is first or missing
      return msgs[anchorIdx - 1].id;
    } catch (e) {
      log('❌ fetchLatestPromptId failed:', e.message);
      return null;
    }
  }

  // INJECT HEARTBEAT: POST a new prompt message via /add_relative_
  // so the AI sees it and responds — same pattern as solveit-voice send.js.
  async function injectHeartbeat() {
    log('injecting heartbeat prompt');
    try {
      const body = new URLSearchParams({
        dlg_name: _edVar('dlg_name'),
        content: HEARTBEAT_TEXT,
        msg_type: 'prompt',
        placement: 'add_before',
        id: window._anchorMsgId ? window._anchorMsgId() : '',
        run: 'true'
      });
      log('🎯 injecting before anchor ID:', window._anchorMsgId ? window._anchorMsgId() : 'none');
      const resp = await fetch('/add_relative_', { method: 'POST', body });
      if (resp.ok) log('✅ heartbeat prompt injected');
      else log('❌ inject failed, status:', resp.status);
    } catch (e) {
      log('❌ injectHeartbeat failed:', e.message);
    }
  }

  // ── COUNTDOWN CYCLE ───────────────────────────────────────────
  // START CYCLE: Clear any existing timers, reset the display,
  // start the 1-second tick, and set the 4-minute fire timer.
  function startCycle() {
    // Clear previous cycle cleanly
    clearInterval(countdownTimer);
    clearTimeout(fireTimer);

    secondsLeft = INTERVAL_MS / 1000;
    updateDisplay();

    // TICK: Decrement display every second — pure UI, no logic here.
    countdownTimer = setInterval(() => {
      secondsLeft--;
      updateDisplay();
    }, 1000);

    // FIRE: After exactly 4 minutes, check and act.
    fireTimer = setTimeout(onCountdownEnd, INTERVAL_MS);
    log('countdown started — fires in 4 minutes');
  }

  // ON COUNTDOWN END: The core decision point.
  // Compare current latest prompt ID with what we saved at cycle start.
  async function onCountdownEnd() {
    clearInterval(countdownTimer);
    log('countdown ended — checking for activity');

    const currentId = await fetchLatestPromptId();
    log('savedId:', savedId, '| currentId:', currentId);

    if (currentId !== savedId) {
      // USER WAS ACTIVE: They sent a prompt during the 4 minutes.
      // Update savedId to the new latest prompt, restart cleanly.
      log('✅ user was active — updating savedId and restarting');
      savedId = currentId;
    } else {
      // USER WAS IDLE: No new prompt in 4 minutes.
      // Inject heartbeat prompt, then update savedId after injection.
      log('⏰ user was idle — injecting heartbeat');
      await injectHeartbeat();
      // Re-fetch after injection so savedId points to the heartbeat prompt
      savedId = await fetchLatestPromptId();
    }

    // Either way, start the next 4-minute cycle
    startCycle();
  }

  // ── INIT ──────────────────────────────────────────────────────
  // BOOT: Fetch the initial latest prompt ID, inject the label,
  // then kick off the first countdown cycle.
  async function init() {
    log('initializing — waiting for anchor...');
    injectLabel();
    window.addEventListener('anchorSet', async () => {
      savedId = await fetchLatestPromptId();
      log('initial savedId:', savedId);
      startCycle();
    }, { once: true });
  }

  // SELF-HEAL: If the container gets destroyed by HTMX and rebuilt,
  // re-inject the label. Shares the same MutationObserver pattern
  // used by token-bar.js for its own self-healing.
  const observer = new MutationObserver(() => {
    if (!document.getElementById('heartbeat-label')) {
      const container = document.getElementById('token-counter-container');
      if (container) injectLabel();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // START: Wait for the container to exist before booting.
  // token-bar.js runs first and creates the container, but there's
  // a small async gap — poll until it's ready.
  function waitAndInit() {
    if (document.getElementById('token-counter-container')) {
      init();
    } else {
      setTimeout(waitAndInit, 300);
    }
  }
  waitAndInit();

  log('✅ Heartbeat module registered');
})();
