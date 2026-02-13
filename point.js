let currentUser = null;
let currentReward = null;
let pointsConfig = null;
let availableRewards = [];

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('userToken');
    if (!token) {
        window.location.href = '/login';
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
        
        if (data.user.role === 'admin') {
            localStorage.removeItem('userToken');
            window.location.href = '/admin-login';
            return;
        }
        
        currentUser = data.user;
        
        // Display user info
        document.getElementById('username').textContent = `@${currentUser.username || 'User'}`;
        document.getElementById('creditsDisplay').textContent = `Credits: ${currentUser.credits || 0}`;
        
        await loadPointsData();
        
        // Auto-refresh points data every 30 seconds to catch approved transactions
        setInterval(async () => {
            await loadPointsData();
        }, 30000);
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('userToken');
        window.location.href = '/login';
    }
});

// Also refresh when page becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
        await loadPointsData();
    }
});

async function loadPointsData() {
    try {
        // Load user points
        const userResponse = await fetch('/api/points/balance', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
        });
        const userData = await userResponse.json();
        
        const points = userData.points || 0;
        document.getElementById('pointsDisplay').textContent = `Points: ${points}`;
        document.getElementById('pointsBalance').textContent = points;

        // Load points config
        const configResponse = await fetch('/api/points/config');
        const configData = await configResponse.json();
        pointsConfig = configData;

        // Load available rewards
        const rewardsResponse = await fetch('/api/points/rewards');
        const rewardsData = await rewardsResponse.json();
        availableRewards = rewardsData.rewards || [];
        
        displayRewards(availableRewards, points);
        
        // Load points history
        await loadPointsHistory();
        
        // Load redemption history
        await loadRedemptionHistory();
    } catch (error) {
        console.error('Error loading points data:', error);
        showNotification('Error loading points data', 'error');
    }
}

function displayRewards(rewards, userPoints) {
    const container = document.getElementById('rewardsGrid');
    
    if (!rewards || rewards.length === 0) {
        container.innerHTML = '<p class="no-rewards">No rewards available at the moment</p>';
        return;
    }

    container.innerHTML = rewards.filter(r => r.active).map(reward => {
        const canRedeem = userPoints >= reward.pointsCost;
        const rewardIcon = getRewardIcon(reward.type);
        
        return `
            <div class="reward-card ${canRedeem ? '' : 'locked'}">
                <div class="reward-icon">${rewardIcon}</div>
                <h4 class="reward-title">${reward.name}</h4>
                <p class="reward-description">${reward.description}</p>
                <div class="reward-cost">
                    <span class="cost-label">Cost:</span>
                    <span class="cost-value">${reward.pointsCost} points</span>
                </div>
                <button 
                    class="btn-redeem ${canRedeem ? '' : 'disabled'}" 
                    onclick="initiateRedemption('${reward._id}')"
                    ${canRedeem ? '' : 'disabled'}
                >
                    ${canRedeem ? 'Redeem' : 'Insufficient Points'}
                </button>
            </div>
        `;
    }).join('');
}

function getRewardIcon(type) {
    const icons = {
        'credits': '💳',
        'password_reset': '🔐',
        'referral': '👥',
        'cash': '💰',
        'custom': '🎁'
    };
    return icons[type] || '🎁';
}

function initiateRedemption(rewardId) {
    currentReward = availableRewards.find(r => r._id === rewardId);
    if (!currentReward) return;

    document.getElementById('modalTitle').textContent = `Redeem: ${currentReward.name}`;
    
    // Display reward details
    const detailsHtml = `
        <div class="reward-detail-item">
            <span class="detail-label">Reward:</span>
            <span class="detail-value">${currentReward.name}</span>
        </div>
        <div class="reward-detail-item">
            <span class="detail-label">Cost:</span>
            <span class="detail-value">${currentReward.pointsCost} points</span>
        </div>
        <div class="reward-detail-item">
            <span class="detail-label">Description:</span>
            <span class="detail-value">${currentReward.description}</span>
        </div>
    `;
    document.getElementById('rewardDetails').innerHTML = detailsHtml;

    // Build redemption form based on reward type
    const formHtml = buildRedemptionForm(currentReward);
    document.getElementById('redemptionForm').innerHTML = formHtml;

    document.getElementById('redemptionModal').classList.add('active');
}

function buildRedemptionForm(reward) {
    switch(reward.type) {
        case 'password_reset':
            return `
                
            `;
        
        case 'referral':
            return `
                <div class="form-section">
                    <p class="form-info">Refer a friend and they'll get ${reward.value} free credits!</p>
                    <div class="form-group">
                        <label>Friend's Chat ID <span class="required">*</span></label>
                        <input type="number" id="referralChatId" placeholder="Enter friend's Telegram Chat ID" required />
                    </div>
                </div>
            `;
        
        case 'cash':
            return `
                <div class="form-section">
                    <p class="form-info">Receive ₦${reward.value} directly to your bank account</p>
                    <div class="form-group">
                        <label>Bank Name <span class="required">*</span></label>
                        <input type="text" id="bankName" placeholder="Enter bank name" required />
                    </div>
                    <div class="form-group">
                        <label>Account Number <span class="required">*</span></label>
                        <input type="text" id="accountNumber" placeholder="Enter account number" required />
                    </div>
                    <div class="form-group">
                        <label>Account Name <span class="required">*</span></label>
                        <input type="text" id="accountName" placeholder="Enter account name" required />
                    </div>
                </div>
            `;
        
        case 'credits':
            return `
                <div class="form-section">
                    <p class="form-info">Receive ${reward.value} credits added to your account</p>
                    <p class="confirmation-text">Click "Redeem Now" to confirm</p>
                </div>
            `;
        
        default:
            return `
                <div class="form-section">
                    <p class="form-info">${reward.description}</p>
                    <div class="form-group">
                        <label>Additional Information (Optional)</label>
                        <textarea id="customInfo" rows="3" placeholder="Add any relevant details"></textarea>
                    </div>
                </div>
            `;
    }
}

async function confirmRedemption() {
    if (!currentReward) return;

    // Get the button and prevent duplicate clicks
    const confirmButton = document.getElementById('confirmRedemptionBtn');
    if (confirmButton.disabled) return;
    
    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = 'Processing...';

    // Validate and collect form data based on reward type
    let formData = {};
    let valid = true;

    switch(currentReward.type) {
        case 'password_reset':
            formData.username = document.getElementById('resetUsername')?.value || '';
            break;
        
        case 'referral':
            const chatId = document.getElementById('referralChatId')?.value;
            if (!chatId) {
                showNotification('Please enter your friend\'s Chat ID', 'error');
                valid = false;
            } else {
                formData.referralChatId = parseInt(chatId);
            }
            break;
        
        case 'cash':
            const bankName = document.getElementById('bankName')?.value;
            const accountNumber = document.getElementById('accountNumber')?.value;
            const accountName = document.getElementById('accountName')?.value;
            
            if (!bankName || !accountNumber || !accountName) {
                showNotification('Please fill in all account details', 'error');
                valid = false;
            } else {
                formData.bankDetails = { bankName, accountNumber, accountName };
            }
            break;
        
        case 'credits':
            // No additional data needed
            break;
        
        default:
            formData.customInfo = document.getElementById('customInfo')?.value || '';
            break;
    }

    if (!valid) {
        confirmButton.disabled = false;
        confirmButton.textContent = originalText;
        return;
    }

    // Submit redemption request
    try {
        const response = await fetch('/api/points/redeem', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            },
            body: JSON.stringify({
                rewardId: currentReward._id,
                formData
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message || '🎉 Reward redeemed successfully! Your request is being processed.', 'success');
            closeRedemptionModal();
            await loadPointsData();
        } else {
            showNotification(data.error || 'Error redeeming reward', 'error');
            confirmButton.disabled = false;
            confirmButton.textContent = originalText;
        }
    } catch (error) {
        console.error('Error redeeming reward:', error);
        showNotification('Error processing redemption', 'error');
        confirmButton.disabled = false;
        confirmButton.textContent = originalText;
    }
}

function closeRedemptionModal() {
    document.getElementById('redemptionModal').classList.remove('active');
    currentReward = null;
    
    // Re-enable the button
    const confirmButton = document.getElementById('confirmRedemptionBtn');
    if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Redeem Now';
    }
}

async function loadPointsHistory() {
    try {
        const response = await fetch('/api/points/history', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
        });
        const data = await response.json();
        
        displayPointsHistory(data.history || []);
    } catch (error) {
        console.error('Error loading points history:', error);
    }
}

function displayPointsHistory(history) {
    const container = document.getElementById('pointsHistoryList');
    
    if (!history || history.length === 0) {
        container.innerHTML = '<p class="no-history">No points history yet</p>';
        return;
    }

    container.innerHTML = history.map(item => `
        <div class="history-item ${item.type}">
            <div class="history-icon">${item.type === 'earned' ? '➕' : '➖'}</div>
            <div class="history-details">
                <div class="history-title">${item.description}</div>
                <div class="history-date">${new Date(item.createdAt).toLocaleString()}</div>
            </div>
            <div class="history-points ${item.type}">${item.type === 'earned' ? '+' : '-'}${item.points}</div>
        </div>
    `).join('');
}

async function loadRedemptionHistory() {
    try {
        const response = await fetch('/api/points/redemptions', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
        });
        const data = await response.json();
        
        displayRedemptionHistory(data.redemptions || []);
    } catch (error) {
        console.error('Error loading redemption history:', error);
    }
}

function displayRedemptionHistory(redemptions) {
    const container = document.getElementById('redemptionHistoryList');
    
    if (!redemptions || redemptions.length === 0) {
        container.innerHTML = '<p class="no-history">No redemptions yet</p>';
        return;
    }

    container.innerHTML = redemptions.map(redemption => `
        <div class="redemption-item">
            <div class="redemption-header">
                <span class="redemption-reward">${redemption.rewardName}</span>
                <span class="redemption-status ${redemption.status}">${redemption.status.toUpperCase()}</span>
            </div>
            <div class="redemption-details">
                <div class="redemption-detail">
                    <span class="detail-label">Points Used:</span>
                    <span class="detail-value">${redemption.pointsUsed}</span>
                </div>
                <div class="redemption-detail">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${new Date(redemption.createdAt).toLocaleString()}</span>
                </div>
                ${redemption.completedAt ? `
                <div class="redemption-detail">
                    <span class="detail-label">Completed:</span>
                    <span class="detail-value">${new Date(redemption.completedAt).toLocaleString()}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function goBack() {
    window.location.href = '/';
}

// Notification system
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}