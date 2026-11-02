/**
 * ReClaim - Member 2: In-App Notifications Controller
 * Handles automatic notifications for potential matches, unread counter badge,
 * and dropdown notification center across all authenticated screens.
 */

const Notifications = {
  unreadCount: 0,
  items: [],
  timerId: null,

  async init() {
    if (!localStorage.getItem('reclaimToken')) return;
    this.renderHeaderBell();
    await this.fetchUnreadCount();
    await this.fetchNotifications();

    // Prevent duplicate polling intervals
    if (this.timerId) {
      clearInterval(this.timerId);
    }

    // Auto-refresh notifications and unread count every 25 seconds
    this.timerId = setInterval(() => {
      this.fetchUnreadCount();
      if (this.dropdownOpen) {
        this.fetchNotifications();
      }
    }, 25000);
  },

  renderHeaderBell() {
    const nav = document.querySelector('.topbar nav');
    if (!nav || document.getElementById('notifContainer')) return;

    // Create notification container
    const container = document.createElement('div');
    container.id = 'notifContainer';
    container.className = 'notif-container';
    container.innerHTML = `
      <button class="notif-trigger" id="notifBellBtn" title="Notifications" aria-label="Notifications">
        🔔
        <span class="notif-badge" id="notifBadge" style="display: none;">0</span>
      </button>
      <div class="notif-dropdown" id="notifDropdown" role="menu">
        <div class="notif-header">
          <h3>Notifications</h3>
          <button id="markAllReadBtn" type="button">Mark all read</button>
        </div>
        <div class="notif-list" id="notifList">
          <div class="notif-empty">Loading notifications…</div>
        </div>
      </div>
    `;

    // Insert before logout button if present, else append
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
      nav.insertBefore(container, logoutBtn);
    } else {
      nav.appendChild(container);
    }

    // Event listeners
    const bellBtn = document.getElementById('notifBellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const markAllBtn = document.getElementById('markAllReadBtn');

    bellBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dropdownOpen = !this.dropdownOpen;
      dropdown.classList.toggle('show', this.dropdownOpen);
      if (this.dropdownOpen) {
        this.fetchNotifications();
      }
    });

    markAllBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.markAllAsRead();
    });

    document.addEventListener('click', (e) => {
      if (this.dropdownOpen && !container.contains(e.target)) {
        this.dropdownOpen = false;
        dropdown.classList.remove('show');
      }
    });
  },

  async fetchUnreadCount() {
    try {
      const res = await API.request('/api/notifications/unread-count');
      this.unreadCount = res.count || 0;
      this.updateBadge();
    } catch {
      // silently ignore if offline/token issue
    }
  },

  updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  },

  async fetchNotifications() {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;

    try {
      const res = await API.request('/api/notifications');
      this.items = res.notifications || [];
      this.renderList();
    } catch (err) {
      listEl.innerHTML = `<div class="notif-empty">Failed to load: ${escapeHTML(err.message)}</div>`;
    }
  },

  renderList() {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;

    if (!this.items.length) {
      listEl.innerHTML = `<div class="notif-empty">No notifications yet.<br><small style="color:#94a3b8">When the matching engine identifies a potential match for your items, you will be notified here.</small></div>`;
      return;
    }

    listEl.innerHTML = this.items.map(notif => {
      const timeAgo = this.formatTimeAgo(notif.createdAt);
      return `
        <div class="notif-item ${notif.isRead ? '' : 'unread'}" data-notif-id="${escapeHTML(notif._id)}" data-match-id="${escapeHTML(notif.matchId)}">
          <div class="notif-title">
            <span>${escapeHTML(notif.title)}</span>
            ${!notif.isRead ? '<span style="color:var(--green);font-size:0.75rem;font-weight:700">NEW</span>' : ''}
          </div>
          <p class="notif-desc">${escapeHTML(notif.message)}</p>
          <div class="notif-time">${escapeHTML(timeAgo)} · Click to view match details →</div>
        </div>
      `;
    }).join('');

    // Attach click events
    listEl.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.getAttribute('data-notif-id');
        const matchId = item.getAttribute('data-match-id');
        try {
          await API.request(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
          item.classList.remove('unread');
          if (this.unreadCount > 0) {
            this.unreadCount--;
            this.updateBadge();
          }
        } catch {
          // ignore
        }
        location.href = `/view-matches.html?matchId=${encodeURIComponent(matchId)}`;
      });
    });
  },

  async markAllAsRead() {
    try {
      await API.request('/api/notifications/mark-all-read', { method: 'PATCH' });
      this.unreadCount = 0;
      this.updateBadge();
      this.items.forEach(i => i.isRead = true);
      this.renderList();
    } catch (err) {
      alert('Could not mark all as read: ' + err.message);
    }
  },

  formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Recently';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Notifications.init();
});
