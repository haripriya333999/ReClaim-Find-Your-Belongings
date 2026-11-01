document.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;
  const form = document.getElementById('itemForm');
  const message = document.getElementById('formMessage');
  const dateInput = form.elements.date;
  dateInput.max = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const isLost = form.querySelector('[name="reportType"]').value === 'LOST';
    button.disabled = true;
    button.textContent = 'Submitting…';
    message.textContent = 'Uploading report and running auto-match engine…';
    message.className = 'message';
    try {
      const result = await API.request('/api/items', { method: 'POST', body: new FormData(form) });
      const matchesCount = result.matchesDetected || 0;
      if (matchesCount > 0) {
        message.textContent = `${result.message} Redirecting to View Matches…`;
        message.className = 'message success';
        form.reset();
        setTimeout(() => location.href = '/view-matches.html', 1200);
      } else {
        message.textContent = result.message;
        message.className = 'message success';
        form.reset();
        setTimeout(() => location.href = '/my-reports.html', 1000);
      }
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    } finally {
      button.disabled = false;
      button.textContent = isLost ? 'Submit lost report' : 'Submit found report';
    }
  });
});
