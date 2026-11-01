const API = {
  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem('reclaimToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers });
    let data;
    try { data = await response.json(); } catch { data = { success: false, message: 'The server returned an invalid response.' }; }
    if (response.status === 401 && token) {
      localStorage.removeItem('reclaimToken');
      localStorage.removeItem('reclaimUser');
      if (!location.pathname.endsWith('/login.html')) location.href = '/login.html';
    }
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }
};

function requireLogin() {
  if (!localStorage.getItem('reclaimToken')) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('reclaimToken');
  localStorage.removeItem('reclaimUser');
  location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#logoutButton').forEach(button => button.addEventListener('click', logout));
});

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
}

function itemCard(item) {
  const image = item.imageUrl ? `<img src="${escapeHTML(item.imageUrl)}" alt="${escapeHTML(item.itemName)}" loading="lazy">` : '<div class="no-image">No image</div>';
  return `<article class="item-card"><div class="item-image">${image}<span class="type-tag ${item.reportType === 'LOST' ? 'tag-lost' : 'tag-found'}">${escapeHTML(item.reportType)}</span></div><div class="item-content"><div class="item-title-row"><h3>${escapeHTML(item.itemName)}</h3><span class="status">${escapeHTML(item.status)}</span></div><p>${escapeHTML(item.description)}</p><div class="item-meta"><span>Category: ${escapeHTML(item.category)}</span><span>Colour: ${escapeHTML(item.color)}</span><span>Location: ${escapeHTML(item.location)}</span><span>Date: ${escapeHTML(formatDate(item.date))}</span></div></div></article>`;
}
