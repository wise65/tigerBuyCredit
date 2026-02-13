let currentAdmin = null;
let currentTransactionId = null;
let allTransactions = [];

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = '/admin-login';
        return;
    }

    try {
        const response = await fetch('/api/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        
        // Verify it's an admin
        if (data.user.role !== 'admin') {
            localStorage.removeItem('adminToken');
            window.location.href = '/admin-login';
            return;
        }
        
        currentAdmin = data.user;

        // Load admin dashboard
        await loadDashboard();
        await loadSettings();
        await loadPromos();
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('adminToken');
        window.location.href = '/admin-login';
    }
});

async function loadDashboard() {
    try {
        // Load stats
        const statsResponse = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const stats = await statsResponse.json();

        document.getElementById('pendingCount').textContent = stats.pending;
        document.getElementById('approvedCount').textContent = stats.approved;
        document.getElementById('declinedCount').textContent = stats.declined;
        document.getElementById('totalRevenue').textContent = `₦${stats.revenue.toFixed(2)}`;

        // Load recent transactions
        const txResponse = await fetch('/api/admin/transactions/recent', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const txData = await txResponse.json();
        displayRecentTransactions(txData.transactions);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function displayRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactionsList');
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p>No recent transactions</p>';
        return;
    }

    container.innerHTML = transactions.map(tx => `
        <div class="transaction-row" onclick="viewTransaction('${tx._id}')">
            <div class="tx-info">
                <span class="tx-id">#${tx._id.slice(-8)}</span>
                <span class="tx-user">${tx.username || 'Unknown'}</span>
            </div>
            <div class="tx-details">
                <span class="tx-credits">${tx.credits} credits</span>
                <span class="tx-amount">₦${tx.amount.toFixed(2)}</span>
            </div>
            <span class="tx-status ${tx.status}">${tx.status}</span>
        </div>
    `).join('');
}

async function loadAllTransactions() {
    try {
        const response = await fetch('/api/admin/transactions/all', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        allTransactions = data.transactions;
        filterTransactions();
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function filterTransactions() {
    const filter = document.getElementById('statusFilter').value;
    const filtered = filter === 'all' 
        ? allTransactions 
        : allTransactions.filter(tx => tx.status === filter);
    
    displayAllTransactions(filtered);
}

function displayAllTransactions(transactions) {
    const container = document.getElementById('allTransactionsList');
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p>No transactions found</p>';
        return;
    }

    container.innerHTML = transactions.map(tx => `
        <div class="transaction-row" onclick="viewTransaction('${tx._id}')">
            <div class="tx-info">
                <span class="tx-id">#${tx._id.slice(-8)}</span>
                <span class="tx-user">${tx.username || 'Unknown'}</span>
                <span class="tx-chat">Chat: ${tx.chatId || 'N/A'}</span>
            </div>
            <div class="tx-details">
                <span class="tx-credits">${tx.credits} credits</span>
                <span class="tx-amount">₦${tx.amount.toFixed(2)}</span>
                <span class="tx-date">${new Date(tx.createdAt).toLocaleDateString()}</span>
            </div>
            <span class="tx-status ${tx.status}">${tx.status}</span>
        </div>
    `).join('');
}

async function viewTransaction(id) {
    try {
        const response = await fetch(`/api/admin/transaction/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        
        currentTransactionId = id;
        showTransactionModal(data.transaction);
    } catch (error) {
        console.error('Error loading transaction:', error);
    }
}

function showTransactionModal(tx) {
    const modal = document.getElementById('transactionModal');
    const details = document.getElementById('transactionDetails');
    
    details.innerHTML = `
        <div class="detail-row">
            <strong>Transaction ID:</strong>
            <span>#${tx._id}</span>
        </div>
        <div class="detail-row">
            <strong>Username:</strong>
            <span>${tx.username || 'Unknown'}</span>
        </div>
        <div class="detail-row">
            <strong>Chat ID:</strong>
            <span>${tx.chatId || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <strong>Credits:</strong>
            <span>${tx.credits}</span>
        </div>
        <div class="detail-row">
            <strong>Amount:</strong>
            <span>₦${tx.amount.toFixed(2)}</span>
        </div>
        ${tx.promoCode ? `
        <div class="detail-row">
            <strong>Promo Code:</strong>
            <span>${tx.promoCode}</span>
        </div>
        ` : ''}
        <div class="detail-row">
            <strong>Status:</strong>
            <span class="status-badge ${tx.status}">${tx.status.toUpperCase()}</span>
        </div>
        <div class="detail-row">
            <strong>Date:</strong>
            <span>${new Date(tx.createdAt).toLocaleString()}</span>
        </div>
        ${tx.note ? `
        <div class="detail-row">
            <strong>Note:</strong>
            <span>${tx.note}</span>
        </div>
        ` : ''}
        ${tx.receipt ? `
        <div class="detail-row">
            <strong>Receipt:</strong>
            <img src="${tx.receipt}" alt="Receipt" style="max-width: 100%; margin-top: 10px;" />
        </div>
        ` : ''}
    `;
    
    // Hide action buttons if already processed
    const actions = modal.querySelector('.modal-actions');
    if (tx.status !== 'pending') {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'flex';
    }
    
    modal.classList.add('active');
}

function closeTransactionModal() {
    document.getElementById('transactionModal').classList.remove('active');
    currentTransactionId = null;
}

async function approveTransaction() {
    if (!currentTransactionId) return;
    
    if (!confirm('Approve this transaction?')) return;
    
    try {
        const response = await fetch(`/api/admin/transaction/${currentTransactionId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Transaction approved!');
            closeTransactionModal();
            await loadDashboard();
            await loadAllTransactions();
        } else {
            const data = await response.json();
            alert(data.error || 'Error approving transaction');
        }
    } catch (error) {
        console.error('Error approving transaction:', error);
        alert('Error approving transaction');
    }
}

async function declineTransaction() {
    if (!currentTransactionId) return;
    
    if (!confirm('Decline this transaction?')) return;
    
    try {
        const response = await fetch(`/api/admin/transaction/${currentTransactionId}/decline`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Transaction declined!');
            closeTransactionModal();
            await loadDashboard();
            await loadAllTransactions();
        } else {
            const data = await response.json();
            alert(data.error || 'Error declining transaction');
        }
    } catch (error) {
        console.error('Error declining transaction:', error);
        alert('Error declining transaction');
    }
}

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/config', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const config = await response.json();
        
        document.getElementById('botToken').value = config.botToken || '';
        document.getElementById('chatId').value = config.chatId || '';
        document.getElementById('pricePerCredit').value = config.pricePerCredit || '';
        document.getElementById('maxPurchase').value = config.maxPurchase || '';
        document.getElementById('bankName').value = config.bankName || '';
        document.getElementById('accountNumber').value = config.accountNumber || '';
        document.getElementById('accountName').value = config.accountName || '';
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveTelegramSettings() {
    const botToken = document.getElementById('botToken').value.trim();
    const chatId = document.getElementById('chatId').value.trim();
    
    try {
        const response = await fetch('/api/admin/config/telegram', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ botToken, chatId })
        });
        
        if (response.ok) {
            alert('Telegram settings saved!');
        } else {
            alert('Error saving settings');
        }
    } catch (error) {
        console.error('Error saving telegram settings:', error);
        alert('Error saving settings');
    }
}

async function savePricingSettings() {
    const pricePerCredit = parseFloat(document.getElementById('pricePerCredit').value);
    const maxPurchase = document.getElementById('maxPurchase').value ? 
        parseInt(document.getElementById('maxPurchase').value) : null;
    
    try {
        const response = await fetch('/api/admin/config/pricing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ pricePerCredit, maxPurchase })
        });
        
        if (response.ok) {
            alert('Pricing settings saved!');
        } else {
            alert('Error saving settings');
        }
    } catch (error) {
        console.error('Error saving pricing settings:', error);
        alert('Error saving settings');
    }
}

async function saveAccountDetails() {
    const bankName = document.getElementById('bankName').value.trim();
    const accountNumber = document.getElementById('accountNumber').value.trim();
    const accountName = document.getElementById('accountName').value.trim();
    
    try {
        const response = await fetch('/api/admin/config/account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ bankName, accountNumber, accountName })
        });
        
        if (response.ok) {
            alert('Account details saved!');
        } else {
            alert('Error saving details');
        }
    } catch (error) {
        console.error('Error saving account details:', error);
        alert('Error saving details');
    }
}

async function loadPromos() {
    try {
        const response = await fetch('/api/admin/promos', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        displayPromos(data.promos);
    } catch (error) {
        console.error('Error loading promos:', error);
    }
}

function displayPromos(promos) {
    const container = document.getElementById('promosList');
    
    if (!promos || promos.length === 0) {
        container.innerHTML = '<p>No promo codes yet</p>';
        return;
    }

    container.innerHTML = promos.map(promo => `
        <div class="promo-item">
            <div class="promo-info">
                <strong>${promo.code}</strong>
                <span>${promo.discount}% discount</span>
            </div>
            <div class="promo-actions">
                <label class="toggle">
                    <input type="checkbox" ${promo.active ? 'checked' : ''} 
                        onchange="togglePromo('${promo._id}', this.checked)" />
                    <span class="toggle-slider"></span>
                </label>
                <button class="btn-delete" onclick="deletePromo('${promo._id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function setupWebhook() {
    const webhookUrl = document.getElementById('webhookUrl').value.trim();
    const statusDiv = document.getElementById('webhookStatus');
    
    if (!webhookUrl) {
        alert('Please enter webhook URL');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/setup-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ webhookUrl })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            statusDiv.innerHTML = `<span style="color: green;">✅ ${data.message}</span>`;
        } else {
            statusDiv.innerHTML = `<span style="color: red;">❌ ${data.error}</span>`;
        }
    } catch (error) {
        console.error('Error setting webhook:', error);
        statusDiv.innerHTML = `<span style="color: red;">❌ Error setting webhook</span>`;
    }
}

async function checkWebhook() {
    const statusDiv = document.getElementById('webhookStatus');
    
    try {
        const response = await fetch('/api/admin/webhook-info', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.result) {
            const info = data.result;
            statusDiv.innerHTML = `
                <div style="
                background: #f8fafc;
                padding: 14px 16px;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                box-shadow: 0 2px 6px rgba(0,0,0,0.06);
                color: #111827;
                font-size: 14px;
                line-height: 1.6;
                ">
                <strong style="font-size: 15px;">🔗 Webhook Info</strong><br>
                URL: ${info.url || 'Not set'}<br>
                Pending Updates: ${info.pending_update_count || 0}<br>
                ${
                    info.last_error_date
                    ? `❌ Last Error: ${new Date(info.last_error_date * 1000).toLocaleString()}<br>
                        Error: ${info.last_error_message}`
                    : '✅ No errors'
                }
                </div>

            `;
        } else {
            statusDiv.innerHTML = `<span style="color: red;">❌ ${data.error}</span>`;
        }
    } catch (error) {
        console.error('Error checking webhook:', error);
        statusDiv.innerHTML = `<span style="color: red;">❌ Error checking webhook</span>`;
    }
}

async function createPromo() {
    const code = document.getElementById('newPromoCode').value.trim();
    const discount = parseInt(document.getElementById('newPromoDiscount').value);
    const active = document.getElementById('newPromoActive').checked;
    
    if (!code || !discount) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/promo/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ code, discount, active })
        });
        
        if (response.ok) {
            alert('Promo code created!');
            document.getElementById('newPromoCode').value = '';
            document.getElementById('newPromoDiscount').value = '';
            document.getElementById('newPromoActive').checked = true;
            await loadPromos();
        } else {
            const data = await response.json();
            alert(data.error || 'Error creating promo');
        }
    } catch (error) {
        console.error('Error creating promo:', error);
        alert('Error creating promo');
    }
}

async function togglePromo(id, active) {
    try {
        const response = await fetch(`/api/admin/promo/${id}/toggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ active })
        });
        
        if (!response.ok) {
            alert('Error updating promo');
            await loadPromos();
        }
    } catch (error) {
        console.error('Error toggling promo:', error);
        alert('Error updating promo');
    }
}

async function deletePromo(id) {
    if (!confirm('Delete this promo code?')) return;
    
    try {
        const response = await fetch(`/api/admin/promo/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Promo deleted!');
            await loadPromos();
        } else {
            alert('Error deleting promo');
        }
    } catch (error) {
        console.error('Error deleting promo:', error);
        alert('Error deleting promo');
    }
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Add active to clicked nav item
    event.target.closest('.nav-item').classList.add('active');
    
    // Load data for specific sections
    if (sectionId === 'transactions') {
        loadAllTransactions();
    } else if (sectionId === 'dashboard') {
        loadDashboard();
    } else if (sectionId === 'promos') {
        loadPromos();
    } else if (sectionId === 'points') {  // ADD THIS BLOCK
        loadPointsSection();
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = '/admin-login';
}