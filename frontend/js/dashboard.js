document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;
  const user = JSON.parse(localStorage.getItem('reclaimUser') || '{}');
  document.getElementById('welcomeTitle').textContent = user.name ? `Welcome, ${user.name}` : 'Your dashboard';

  // 1. Load Member 2 Discovered Matches
  const matchesContainer = document.getElementById('dashboardMatches');
  if (matchesContainer) {
    try {
      const matchResult = await API.request('/api/matches');
      const matches = matchResult.matches || [];
      if (!matches.length) {
        matchesContainer.innerHTML = '<p class="muted">No matches detected yet. When matching belongings are reported, they will appear here with match scores.</p>';
      } else {
        matchesContainer.innerHTML = matches.slice(0, 2).map(m => {
          const lost = m.lostItem || {};
          const found = m.foundItem || {};
          const scoreClass = m.score >= 85 ? 'score-high' : (m.score >= 65 ? 'score-mid' : 'score-fair');
          return `
            <div class="match-card" style="padding:16px;">
              <div class="match-card-top" style="margin-bottom:12px;padding-bottom:10px;">
                <div class="score-badge-wrap">
                  <span class="score-pill ${scoreClass}" style="font-size:0.9rem;padding:4px 12px;">⚡ ${m.score}% Match</span>
                  <span class="match-status-tag status-pending" style="font-size:0.75rem;">${escapeHTML(m.status)}</span>
                </div>
                <a href="/view-matches.html?matchId=${encodeURIComponent(m._id)}" style="font-size:0.85rem;font-weight:700;color:var(--green)">View breakdown →</a>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.92rem;flex-wrap:wrap;gap:8px;">
                <div>
                  <strong>Lost:</strong> ${escapeHTML(lost.itemName || 'Item')} (${escapeHTML(lost.location || 'Location')})
                </div>
                <div style="color:var(--muted);font-weight:700">⟷</div>
                <div>
                  <strong>Found:</strong> ${escapeHTML(found.itemName || 'Item')} (${escapeHTML(found.location || 'Location')})
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      matchesContainer.innerHTML = `<p class="muted">Could not load matches: ${escapeHTML(err.message)}</p>`;
    }
  }

  // 2. Load Member 1 Personal Reports
  const container = document.getElementById('recentReports');
  try {
    const result = await API.request('/api/items/my-reports');
    container.innerHTML = result.items.length ? result.items.slice(0, 3).map(itemCard).join('') : '<p class="muted">You have not submitted any reports yet.</p>';
  } catch (error) {
    container.textContent = error.message;
  }
});
