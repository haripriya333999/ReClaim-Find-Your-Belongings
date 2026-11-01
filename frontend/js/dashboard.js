document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;
  const user = JSON.parse(localStorage.getItem('reclaimUser') || '{}');
  document.getElementById('welcomeTitle').textContent = user.name ? `Welcome, ${user.name}` : 'Your dashboard';
  const container = document.getElementById('recentReports');
  try {
    const result = await API.request('/api/items/my-reports');
    container.innerHTML = result.items.length ? result.items.slice(0, 3).map(itemCard).join('') : '<p class="muted">You have not submitted any reports yet.</p>';
  } catch (error) { container.textContent = error.message; }
});
