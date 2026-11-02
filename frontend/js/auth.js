document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const message = document.getElementById('formMessage');

  if (registerForm) registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'Creating your account…'; message.className = 'message';
    const form = new FormData(registerForm);
    try {
      const result = await API.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') }) });
      message.textContent = result.message + ' Redirecting to login…'; message.className = 'message success';
      setTimeout(() => location.href = '/login.html', 1000);
    } catch (error) { message.textContent = error.message; message.className = 'message error'; }
  });

  if (loginForm) loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'Signing in…'; message.className = 'message';
    const form = new FormData(loginForm);
    try {
      const result = await API.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      localStorage.setItem('reclaimToken', result.token);
      localStorage.setItem('reclaimUser', JSON.stringify(result.user));
      location.href = '/dashboard.html';
    } catch (error) { message.textContent = error.message; message.className = 'message error'; }
  });
});
