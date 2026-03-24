// ═══════════════════════════════════════════════════════════════
// SolveIt Context Token Counter — CRAFT Discovery Module (Module 1)
//
// PURPOSE: Given a dialog name, walk UP the folder tree and find
// every CRAFT dialog that solveit would combine into AI context.
//
// WHY WALK UPWARD? Solveit's CRAFT hierarchy means a dialog inherits
// CRAFTs from its own folder and every parent up to root. All get
// merged root-first into AI context.
//
// EXAMPLE: For "myGems/buildCurationSystem/balance_life/controller":
//   Candidates checked (root first):
//     CRAFT                                            ← root
//     myGems/CRAFT                                     ← workspace
//     myGems/buildCurationSystem/CRAFT                 ← project
//     myGems/buildCurationSystem/balance_life/CRAFT    ← folder
//
// VERIFICATION: We CHECK each candidate by fetching /find_msgs_.
// If it returns messages, the CRAFT is real. If 404 or empty, skip.
//
// EXPORT: window.discoverCrafts — called by Module 2 (craft-count).
// ═══════════════════════════════════════════════════════════════

(function () {
  // DUPLICATE GUARD: Prevent re-initialization on double injection.
  if (window.__initCraftDiscover) return;
  window.__initCraftDiscover = true;

  const log = (...args) => console.log('[craft-discover]', ...args);

  async function discoverCrafts(dlgName) {
    console.group('[craft-discover] 🔍 Starting CRAFT discovery for: ' + dlgName);

    // STEP 1: Split dialog path into folder segments.
    // "myGems/.../controller" → folders = ["myGems", "buildCurationSystem", "balance_life"]
    // Drop the last segment (dialog name itself) to get the folder path.
    const parts = dlgName.split('/');
    const folders = parts.slice(0, -1);
    log('📂 Step 1: Folder path →', folders.join('/') || '(root)',
        '| depth:', folders.length, 'levels');

    // STEP 2: Build candidate paths from root → deepest (solveit's merge order).
    // Root CRAFT is always first — universal foundation.
    // Each folder level adds its own, most specific last.
    const candidates = ['CRAFT'];
    for (let i = 1; i <= folders.length; i++) {
      candidates.push(folders.slice(0, i).join('/') + '/CRAFT');
    }
    log('📋 Step 2: Candidates (' + candidates.length + '):', candidates);

    // STEP 3: Verify each candidate exists by fetching its messages.
    // A real CRAFT has messages. A non-existent one returns 404 or empty.
    // Independent try/catch — one failure doesn't block the rest.
    const found = [];

    for (const candidate of candidates) {
      try {
        const resp = await fetch('/find_msgs_', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          body: new URLSearchParams({
            dlg_name: candidate,
            include_meta: 1,
            include_output: 0,
            trunc_in: 1
          })
        });

        // HTTP error → CRAFT doesn't exist at this folder level
        if (!resp.ok) {
          log('❌', candidate, '→ HTTP', resp.status, '(not found)');
          continue;
        }

        const data = await resp.json();
        const msgs = data.msgs || [];

        // Empty dialog → exists but contributes nothing
        if (msgs.length === 0) {
          log('⚪', candidate, '→ exists but empty (0 messages)');
          continue;
        }

        // LABEL EXTRACTION: Human-readable name from path.
        // "CRAFT" → "root", "myGems/CRAFT" → "myGems",
        // "myGems/buildCurationSystem/CRAFT" → "buildCurationSystem"
        const pathParts = candidate.split('/');
        const label = pathParts.length === 1 ? 'root' : pathParts[pathParts.length - 2];

        found.push({ name: candidate, label: label, msgCount: msgs.length });
        log('✅', candidate, '→ found!', msgs.length, 'messages | label:', label);

      } catch (e) {
        // Network error, JSON parse error — log and skip
        console.warn('[craft-discover] ⚠️ Failed to check', candidate, '→', e.message);
      }
    }

    // SUMMARY: One-line overview of discovery results
    log('📊 Summary:', found.length, 'of', candidates.length, 'candidates exist');
    if (found.length > 0) {
      log('📊 Found:', found.map(f => f.label + ' (' + f.msgCount + ' msgs)').join(', '));
    }
    console.groupEnd();

    return found;
  }

  // EXPORT: Module 2 calls this to start the chain.
  // We don't run it here — Module 2 triggers discovery.
  window.discoverCrafts = discoverCrafts;
  log('✅ discoverCrafts exported to window');
})();
