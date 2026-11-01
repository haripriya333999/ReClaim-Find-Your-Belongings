document.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;
  const form = document.getElementById('itemForm');
  const message = document.getElementById('formMessage');
  const dateInput = form.elements.date;
  dateInput.max = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Submitting…';
    message.textContent = 'Uploading your report and photograph…'; message.className = 'message';
    try {
      const result = await API.request('/api/items', { method: 'POST', body: new FormData(form) });
      message.textContent = result.message; message.className = 'message success';
      form.reset();
      setTimeout(() => location.href = '/my-reports.html', 900);
    } catch (error) { message.textContent = error.message; message.className = 'message error'; }
    finally { button.disabled = false; button.textContent = form.querySelector('[name="reportType"]').value === 'LOST' ? 'Submit lost report' : 'Submit found report'; }
  });
});
