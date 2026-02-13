document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('adminToken'); // Use adminToken
    if (token) {
        verifyAndRedirect(token);
    }

    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAdminLogin);
    }
});

async function verifyAndRedirect(token) {
    try {
        const response = await fetch('/api/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.user.role === 'admin') {
                window.location.href = '/admin';
            } else {
                localStorage.removeItem('adminToken');
            }
        } else {
            localStorage.removeItem('adminToken');
        }
    } catch (error) {
        console.error('Verification error:', error);
        localStorage.removeItem('adminToken');
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorMessage = document.getElementById('errorMessage');
    const btnLogin = document.querySelector('.btn-login');

    errorMessage.textContent = '';

    if (!username || !password) {
        errorMessage.textContent = 'Please enter username and password';
        return;
    }

    btnLogin.disabled = true;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('adminToken', data.token); // Use adminToken
            window.location.href = '/admin';
        } else {
            errorMessage.textContent = data.error || 'Invalid credentials';
            btnLogin.disabled = false;
        }
    } catch (error) {
        console.error('Admin login error:', error);
        errorMessage.textContent = 'Connection error. Please try again.';
        btnLogin.disabled = false;
    }
}