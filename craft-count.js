// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — CRAFT Token Counter (Module 2)
//
// PURPOSE: Take discovered CRAFTs from Module 1 and count how many
// tokens each contributes to AI context.
//
// WHY SEPARATE FROM DISCOVERY? Module 1 answers "which CRAFTs exist?"
// Module 2 answers "how many tokens does each cost?" Separating them
// means we can re-count without re-discovering (e.g. after a CRAFT edit).
//
// TOKEN COUNTING: For each non-skipped message, sum input_tokens +
// output_tokens. Skipped messages don't enter AI context, so they
// don't count.
//
// CHAIN: Calls window.discoverCrafts (Module 1) → counts tokens →
// stores result in window._craftTokens for Module 3 (craft-bar).
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization on double injection.
  if (window.__initCraftCount) return;
  window.__initCraftCount = true;

  const log = (...args) => console.log('[craft-count]', ...args);

  async function countCraftTokens(craftList) {
    console.group('[craft-count] 📊 Counting tokens for ' + craftList.length + ' CRAFT(s)');

    const results = [];

    for (const craft of craftList) {
      try {
        // FETCH: Same /find_msgs_ endpoint — now we care about
        // token counts in metadata, not just existence.
        const resp = await fetch('/find_msgs_', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            dlg_name: craft.name,
            include_meta: 1,
            include_output: 0,
            trunc_in: 1
          })
        });

        if (!resp.ok) {
          console.warn('[craft-count] ⚠️', craft.label, '→ HTTP', resp.status);
          results.push({ ...craft, tokens: 0 });
          continue;
        }

        const data = await resp.json();
        const msgs = data.msgs || [];

        // SUM: Only non-skipped messages contribute to AI context.
        // input_tokens = message content cost.
        // output_tokens = code output cost.
        let tokens = 0;
        let counted = 0;
        let skipped = 0;
        for (const m of msgs) {
          if (m.skipped) { skipped++; continue; }
          tokens += (m.input_tokens || 0) + (m.output_tokens || 0);
          counted++;
        }

        results.push({ ...craft, tokens: tokens });
        log('✅', craft.label, '→', (tokens / 1000).toFixed(1) + 'K tokens',
            '| counted:', counted, 'msgs | skipped:', skipped);

      } catch (e) {
        console.warn('[craft-count] ⚠️ Failed to count', craft.label, '→', e.message);
        results.push({ ...craft, tokens: 0 });
      }
    }

    // TOTAL: Sum all CRAFT tokens — this is what's invisible in the main bar.
    const total = results.reduce((sum, r) => sum + r.tokens, 0);
    log('📊 Total CRAFT tokens:', (total / 1000).toFixed(1) + 'K across', results.length, 'CRAFT(s)');
    log('📊 Breakdown:', results.map(r => r.label + '=' + (r.tokens / 1000).toFixed(1) + 'K').join(', '));
    console.groupEnd();

    return { crafts: results, total: total };
  }

  // CHAIN: Module 1 exports discoverCrafts() to window.
  // We call it, wait for results, then count tokens.
  // Direct call — no polling, no race conditions.
  if (!window.discoverCrafts) {
    console.warn('[craft-count] ⚠️ Module 1 not loaded — discoverCrafts not found');
    return;
  }

  // KICKOFF: Discover CRAFTs for current dialog, then count their tokens.
  // Results stored on window for Module 3 (craft-bar) to consume.
  window.discoverCrafts(_edVar('dlg_name')).then(crafts => {
    window._craftList = crafts;
    return countCraftTokens(crafts);
  }).then(result => {
    log('🎯 Final result stored in window._craftTokens');
    window._craftTokens = result;
    document.dispatchEvent(new CustomEvent('craft-tokens-ready'));
  });
})();
