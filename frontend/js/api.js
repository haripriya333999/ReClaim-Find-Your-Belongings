const API = {
  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem('reclaimToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers });
    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: false, message: 'The server returned an invalid response.' };
    }
    if (response.status === 401 && token) {
      localStorage.removeItem('reclaimToken');
      localStorage.removeItem('reclaimUser');
      if (!location.pathname.endsWith('/login.html')) location.href = '/login.html';
    }
    if (!response.ok) {
      const err = new Error(data.message || `Request failed (${response.status}).`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
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

async function updateDbStatusBanner() {
  const bar = document.getElementById('dbStatusBar');
  const dot = document.getElementById('dbStatusDot');
  const label = document.getElementById('dbStatusLabel');
  const detail = document.getElementById('dbStatusDetail');
  if (!bar || !dot || !label) return;

  try {
    const res = await fetch('/api/health').then(r => r.json());
    if (res.database && res.database.connected) {
      dot.style.background = '#10b981';
      bar.style.background = '#ecfdf5';
      bar.style.borderColor = '#a7f3d0';
      bar.style.color = '#065f46';
      label.innerHTML = `<strong>MongoDB Atlas: Connected</strong> (Ping: ${res.database.latencyMs}ms, DB: ${res.database.databaseName})`;
      if (detail) detail.textContent = `Cluster: ${res.database.cluster}`;
    } else {
      dot.style.background = '#0284c7';
      bar.style.background = '#f0f9ff';
      bar.style.borderColor = '#bae6fd';
      bar.style.color = '#0369a1';
      label.innerHTML = `<strong>Database: Operational (Local Storage Active)</strong>`;
      if (detail) detail.innerHTML = `<span>To sync with Cloud Atlas, configure IP in <a href="https://cloud.mongodb.com" target="_blank" style="color:#0284c7;text-decoration:underline;font-weight:600">MongoDB Atlas Network Access ↗</a></span>`;
    }
  } catch {
    dot.style.background = '#ef4444';
    label.textContent = 'Server health check unavailable';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#logoutButton').forEach(button => button.addEventListener('click', logout));
  updateDbStatusBanner();
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
