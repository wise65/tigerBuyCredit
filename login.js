// Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('userToken'); // CHANGED: use userToken
    if (token) {
        verifyAndRedirect(token);
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
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
                // Admin shouldn't be on user login page
                localStorage.removeItem('userToken');
                window.location.href = '/admin-login';
            } else {
                window.location.href = '/';
            }
        } else {
            localStorage.removeItem('userToken');
        }
    } catch (error) {
        console.error('Verification error:', error);
        localStorage.removeItem('userToken');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    console.log('Login form submitted');

    const chatId = document.getElementById('chatId').value.trim();
    const errorMessage = document.getElementById('errorMessage');
    const btnLogin = document.querySelector('.btn-login');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');

    errorMessage.textContent = '';

    if (!chatId) {
        errorMessage.textContent = 'Please enter your Chat ID';
        return;
    }

    btnLogin.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';

    try {
        console.log('Sending login request...');
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ chatId })
        });

        const data = await response.json();
        console.log('Login response:', data);

        if (response.ok) {
            localStorage.setItem('userToken', data.token); // CHANGED: use userToken
            console.log('Redirecting to home...');
            window.location.href = '/';
        } else {
            errorMessage.textContent = data.error || 'Invalid Chat ID';
            btnLogin.disabled = false;
            btnText.style.display = 'inline-block';
            btnLoader.style.display = 'none';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = 'Connection error. Please try again.';
        btnLogin.disabled = false;
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
    }
}