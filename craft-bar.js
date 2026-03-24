// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — CRAFT Bar Renderer (Module 3)
//
// PURPOSE: Take token counts from Module 2 (window._craftTokens)
// and render a segmented color bar showing each CRAFT's contribution.
//
// WHY SEGMENTED? Each CRAFT dialog adds tokens to AI context.
// A single bar wouldn't show WHERE the tokens come from.
// Segments show at a glance: "root CRAFT uses 10K, project CRAFT uses 4K."
//
// WIDTH LOGIC: The bar's total width is proportional to the token bar.
// Both share the same scale: 80ch = 200K tokens (the CAP).
// So if CRAFTs total 14K → bar is 80 * (14000 / 200000) = 5.6ch wide.
// Visually comparable — you see how much budget is dialog vs CRAFT.
//
// COLOR PALETTE: Each CRAFT level gets a distinct color.
// Ordered root → leaf (same order as solveit's merge):
// root = blue, level 2 = purple, level 3 = teal, level 4 = orange.
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization on double injection.
  if (window.__initCraftBar) return;
  window.__initCraftBar = true;

  const CAP = 200_000;
  const BAR_WIDTH_CH = 80;
  const COLORS = ['#7cb3ff', '#b07cff', '#7cdfdf', '#ffb07c'];
  const log = (...args) => console.log('[craft-bar]', ...args);

  function renderCraftBar(data) {
    console.group('[craft-bar] 🎨 Rendering CRAFT token bar');

    // GUARD: No CRAFTs found → don't render. Keeps UI clean for root dialogs.
    if (!data || !data.crafts || data.crafts.length === 0) {
      log('⚪ No CRAFTs to display — skipping bar');
      console.groupEnd();
      return;
    }

    // STEP 1: Calculate proportional bar width.
    // 80ch = 200K tokens. CRAFT total gets its proportional share.
    const totalTokens = data.total;
    const barWidthCh = BAR_WIDTH_CH * (totalTokens / CAP);
    log('📐 Step 1: Bar width →', barWidthCh.toFixed(1) + 'ch',
        '(' + (totalTokens / 1000).toFixed(1) + 'K / ' + (CAP / 1000) + 'K × ' + BAR_WIDTH_CH + 'ch)');

    // STEP 2: Remove existing bar if re-rendering.
    // Allows Module 3 to be re-run without duplicating bars.
    const existing = document.getElementById('craft-bar');
    if (existing) {
      existing.remove();
      log('🧹 Step 2: Removed previous CRAFT bar');
    }

    // STEP 3: Find the token bar — we inject right after it.
    const tokenBar = document.getElementById('token-bar');
    if (!tokenBar) {
      console.warn('[craft-bar] ⚠️ Step 3: token-bar not found — cannot inject');
      console.groupEnd();
      return;
    }
    log('📍 Step 3: Found token-bar → injecting after it');

    // STEP 4: Build segment HTML for each CRAFT.
    // Each segment's width = (craft.tokens / totalTokens) × 100% of the bar.
    // Segments fill proportionally — no gaps, no overflow.
    let segmentsHtml = '';
    data.crafts.forEach((craft, i) => {
      const pct = totalTokens > 0 ? (craft.tokens / totalTokens * 100) : 0;
      const color = COLORS[i % COLORS.length];
      // craft-segment class provides height/display from CSS; width/color are dynamic
      segmentsHtml +=
        '<div class="craft-segment" style="width:' + pct + '%; background:' + color + ';"' +
        ' title="' + craft.label + ': ' + (craft.tokens / 1000).toFixed(1) + 'K"></div>';
      log('🎨 Step 4: Segment', i, '→', craft.label, '=', pct.toFixed(1) + '%',
          '(' + (craft.tokens / 1000).toFixed(1) + 'K)', '| color:', color);
    });

    // STEP 5: Assemble bar — craft-track class provides the container layout.
    // The colored bar gets proportional width, label sits outside with fixed width.
    const totalK = (totalTokens / 1000).toFixed(0);
    const bar = document.createElement('div');
    bar.id = 'craft-bar';
    bar.innerHTML =
      '<div class="craft-track" style="width:' + barWidthCh.toFixed(1) + 'ch;">' +
        segmentsHtml +
      '</div>' +
      '<span class="craft-label">' + totalK + 'K craft</span>';

    // STEP 6: Inject after the token bar
    // SHARED CONTAINER: Append into the shared floating container so
    // craft-bar stays on the same line as token-bar and anchor-toggle.
    document.getElementById('token-counter-container').appendChild(bar);
    log('✅ Step 6: CRAFT bar injected →', data.crafts.length, 'segment(s),',
        barWidthCh.toFixed(1) + 'ch wide,', totalK + 'K total');

    console.groupEnd();
  }

  // CHAIN: Listen for Module 2's signal instead of polling.
  // Also handle token-bar appearing after tokens are ready.
  function tryRender() {
    if (window._craftTokens && document.getElementById('token-bar')) {
      renderCraftBar(window._craftTokens);
    }
  }

  // Event-driven: Module 2 dispatches 'craft-tokens-ready' when done
  document.addEventListener('craft-tokens-ready', tryRender);
  // In case both are already available (e.g. re-injection)
  tryRender();
})();
