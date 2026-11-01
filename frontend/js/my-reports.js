document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;
  const container = document.getElementById('myReportsContainer');
  try {
    const result = await API.request('/api/items/my-reports');
    container.innerHTML = result.items.length ? result.items.map(itemCard).join('') : '<p class="muted">You have not submitted any reports yet.</p>';
  } catch (error) { container.textContent = error.message; }
});
