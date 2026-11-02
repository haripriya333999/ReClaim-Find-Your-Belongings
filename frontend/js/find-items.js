document.addEventListener('DOMContentLoaded', async () => {
  if (!requireLogin()) return;
  const container = document.getElementById('itemsContainer');
  const type = document.getElementById('typeFilter');
  const search = document.getElementById('searchInput');
  let allItems = [];
  function render() {
    const term = search.value.trim().toLowerCase();
    const filtered = allItems.filter(item => (!type.value || item.reportType === type.value) && [item.itemName,item.category,item.color,item.location,item.description].some(value => String(value).toLowerCase().includes(term)));
    container.innerHTML = filtered.length ? filtered.map(itemCard).join('') : '<p class="muted">No reports match your search.</p>';
  }
  try {
    const result = await API.request('/api/items?status=OPEN');
    allItems = result.items; render();
  } catch (error) { container.textContent = error.message; }
  type.addEventListener('change', render); search.addEventListener('input', render);
});
