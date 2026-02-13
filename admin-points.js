// Admin Points Management Functions

async function loadPointsSection() {
    await loadPointsConfig();
    await loadRewards();
    await loadRedemptions();
}

async function loadPointsConfig() {
    try {
        const response = await fetch('/api/admin/config', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const config = await response.json();
        
        const pointsConfig = config.pointsPerCredit || {
            threshold1: { minCredits: 200, pointsPerCredit: 0.1 },
            threshold2: { minCredits: 100, pointsPerCredit: 0.05 }
        };
        
        document.getElementById('threshold1Credits').value = pointsConfig.threshold1.minCredits;
        document.getElementById('threshold1Points').value = pointsConfig.threshold1.pointsPerCredit;
        document.getElementById('threshold2Credits').value = pointsConfig.threshold2.minCredits;
        document.getElementById('threshold2Points').value = pointsConfig.threshold2.pointsPerCredit;
    } catch (error) {
        console.error('Error loading points config:', error);
    }
}

async function savePointsConfig() {
    const pointsPerCredit = {
        threshold1: {
            minCredits: parseInt(document.getElementById('threshold1Credits').value),
            pointsPerCredit: parseFloat(document.getElementById('threshold1Points').value)
        },
        threshold2: {
            minCredits: parseInt(document.getElementById('threshold2Credits').value),
            pointsPerCredit: parseFloat(document.getElementById('threshold2Points').value)
        }
    };
    
    try {
        const response = await fetch('/api/admin/config/points', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ pointsPerCredit })
        });
        
        if (response.ok) {
            alert('Points configuration saved!');
        } else {
            alert('Error saving configuration');
        }
    } catch (error) {
        console.error('Error saving points config:', error);
        alert('Error saving configuration');
    }
}

async function loadRewards() {
    try {
        const response = await fetch('/api/admin/rewards', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        displayRewards(data.rewards);
    } catch (error) {
        console.error('Error loading rewards:', error);
    }
}

function displayRewards(rewards) {
    const container = document.getElementById('rewardsList');
    
    if (!rewards || rewards.length === 0) {
        container.innerHTML = '<p>No rewards yet</p>';
        return;
    }

    container.innerHTML = rewards.map(reward => `
        <div class="reward-admin-item">
            <div class="reward-admin-info">
                <div class="reward-admin-header">
                    <strong>${reward.name}</strong>
                    <span class="reward-type-badge">${reward.type}</span>
                </div>
                <p class="reward-description">${reward.description}</p>
                <div class="reward-admin-details">
                    <span>Cost: ${reward.pointsCost} points</span>
                    ${reward.value ? `<span>Value: ${reward.type === 'cash' ? '₦' : ''}${reward.value}${reward.type === 'credits' || reward.type === 'referral' ? ' credits' : ''}</span>` : ''}
                </div>
            </div>
            <div class="reward-admin-actions">
                <label class="toggle">
                    <input type="checkbox" ${reward.active ? 'checked' : ''} 
                        onchange="toggleReward('${reward._id}', this.checked)" />
                    <span class="toggle-slider"></span>
                </label>
                <button class="btn-edit" onclick="editReward('${reward._id}')">Edit</button>
                <button class="btn-delete" onclick="deleteReward('${reward._id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function createReward() {
    const name = document.getElementById('newRewardName').value.trim();
    const description = document.getElementById('newRewardDescription').value.trim();
    const type = document.getElementById('newRewardType').value;
    const pointsCost = parseInt(document.getElementById('newRewardPoints').value);
    const value = parseFloat(document.getElementById('newRewardValue').value) || 0;
    const active = document.getElementById('newRewardActive').checked;
    
    if (!name || !type || !pointsCost) {
        alert('Please fill in all required fields');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/reward/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ name, description, type, pointsCost, value, active })
        });
        
        if (response.ok) {
            alert('Reward created!');
            document.getElementById('newRewardName').value = '';
            document.getElementById('newRewardDescription').value = '';
            document.getElementById('newRewardType').value = 'credits';
            document.getElementById('newRewardPoints').value = '';
            document.getElementById('newRewardValue').value = '';
            document.getElementById('newRewardActive').checked = true;
            await loadRewards();
        } else {
            const data = await response.json();
            alert(data.error || 'Error creating reward');
        }
    } catch (error) {
        console.error('Error creating reward:', error);
        alert('Error creating reward');
    }
}

async function toggleReward(id, active) {
    try {
        const response = await fetch(`/api/admin/reward/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ active })
        });
        
        if (!response.ok) {
            alert('Error updating reward');
            await loadRewards();
        }
    } catch (error) {
        console.error('Error toggling reward:', error);
        alert('Error updating reward');
    }
}

async function deleteReward(id) {
    if (!confirm('Delete this reward? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`/api/admin/reward/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Reward deleted!');
            await loadRewards();
        } else {
            alert('Error deleting reward');
        }
    } catch (error) {
        console.error('Error deleting reward:', error);
        alert('Error deleting reward');
    }
}

async function loadRedemptions() {
    try {
        const response = await fetch('/api/admin/redemptions', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        displayRedemptions(data.redemptions);
    } catch (error) {
        console.error('Error loading redemptions:', error);
    }
}

function displayRedemptions(redemptions) {
    const container = document.getElementById('redemptionsList');
    
    if (!redemptions || redemptions.length === 0) {
        container.innerHTML = '<p>No redemptions yet</p>';
        return;
    }

    container.innerHTML = redemptions.map(redemption => `
        <div class="redemption-admin-row" onclick="viewRedemption('${redemption._id}')">
            <div class="redemption-admin-info">
                <span class="redemption-id">#${redemption._id.slice(-8)}</span>
                <span class="redemption-user">@${redemption.username}</span>
                <span class="redemption-reward">${redemption.rewardName}</span>
            </div>
            <div class="redemption-admin-details">
                <span class="redemption-points">${redemption.pointsUsed} pts</span>
                <span class="redemption-date">${new Date(redemption.createdAt).toLocaleDateString()}</span>
            </div>
            <span class="redemption-status ${redemption.status}">${redemption.status}</span>
        </div>
    `).join('');
}

async function viewRedemption(id) {
    try {
        const response = await fetch(`/api/admin/redemption/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        const data = await response.json();
        
        currentRedemptionId = id;
        showRedemptionModal(data.redemption);
    } catch (error) {
        console.error('Error loading redemption:', error);
    }
}

let currentRedemptionId = null;

function showRedemptionModal(redemption) {
    const modal = document.getElementById('redemptionModal');
    const details = document.getElementById('redemptionModalDetails');
    
    let formDataHtml = '';
    if (redemption.rewardType === 'password_reset') {
        formDataHtml = redemption.formData.username ? 
            `<div class="detail-row"><strong>IG Username:</strong> <span>@${redemption.formData.username}</span></div>` : '';
    } else if (redemption.rewardType === 'referral') {
        formDataHtml = `<div class="detail-row"><strong>Referred Chat ID:</strong> <span>${redemption.formData.referralChatId}</span></div>`;
    } else if (redemption.rewardType === 'cash') {
        formDataHtml = `
            <div class="detail-row"><strong>Bank:</strong> <span>${redemption.formData.bankDetails.bankName}</span></div>
            <div class="detail-row"><strong>Account Number:</strong> <span>${redemption.formData.bankDetails.accountNumber}</span></div>
            <div class="detail-row"><strong>Account Name:</strong> <span>${redemption.formData.bankDetails.accountName}</span></div>
        `;
    } else if (redemption.formData.customInfo) {
        formDataHtml = `<div class="detail-row"><strong>Additional Info:</strong> <span>${redemption.formData.customInfo}</span></div>`;
    }
    
    details.innerHTML = `
        <div class="detail-row">
            <strong>Redemption ID:</strong>
            <span>#${redemption._id}</span>
        </div>
        <div class="detail-row">
            <strong>Username:</strong>
            <span>@${redemption.username}</span>
        </div>
        <div class="detail-row">
            <strong>Chat ID:</strong>
            <span>${redemption.chatId}</span>
        </div>
        <div class="detail-row">
            <strong>Reward:</strong>
            <span>${redemption.rewardName}</span>
        </div>
        <div class="detail-row">
            <strong>Type:</strong>
            <span>${redemption.rewardType}</span>
        </div>
        <div class="detail-row">
            <strong>Points Used:</strong>
            <span>${redemption.pointsUsed}</span>
        </div>
        ${formDataHtml}
        <div class="detail-row">
            <strong>Status:</strong>
            <span class="status-badge ${redemption.status}">${redemption.status.toUpperCase()}</span>
        </div>
        <div class="detail-row">
            <strong>Date:</strong>
            <span>${new Date(redemption.createdAt).toLocaleString()}</span>
        </div>
        ${redemption.completedAt ? `
        <div class="detail-row">
            <strong>Completed:</strong>
            <span>${new Date(redemption.completedAt).toLocaleString()}</span>
        </div>
        ` : ''}
    `;
    
    // Hide action buttons if already processed
    const actions = modal.querySelector('.modal-actions');
    if (redemption.status !== 'pending') {
        actions.style.display = 'none';
    } else {
        actions.style.display = 'flex';
    }
    
    modal.classList.add('active');
}

function closeRedemptionAdminModal() {
    document.getElementById('redemptionModal').classList.remove('active');
    currentRedemptionId = null;
}

async function approveRedemption() {
    if (!currentRedemptionId) return;
    
    if (!confirm('Approve this redemption?')) return;
    
    try {
        const response = await fetch(`/api/admin/redemption/${currentRedemptionId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Redemption approved!');
            closeRedemptionAdminModal();
            await loadRedemptions();
            await loadDashboard();
        } else {
            const data = await response.json();
            alert(data.error || 'Error approving redemption');
        }
    } catch (error) {
        console.error('Error approving redemption:', error);
        alert('Error approving redemption');
    }
}

async function declineRedemption() {
    if (!currentRedemptionId) return;
    
    if (!confirm('Decline this redemption? Points will be refunded to the user.')) return;
    
    try {
        const response = await fetch(`/api/admin/redemption/${currentRedemptionId}/decline`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });
        
        if (response.ok) {
            alert('Redemption declined and points refunded!');
            closeRedemptionAdminModal();
            await loadRedemptions();
            await loadDashboard();
        } else {
            const data = await response.json();
            alert(data.error || 'Error declining redemption');
        }
    } catch (error) {
        console.error('Error declining redemption:', error);
        alert('Error declining redemption');
    }
}

// Update reward type help text
function updateRewardTypeHelp() {
    const type = document.getElementById('newRewardType').value;
    const helpTexts = {
        'credits': 'User will receive credits directly to their account',
        'password_reset': 'User can request a password reset link',
        'referral': 'User can refer a friend who will receive free credits',
        'cash': 'User will receive cash to their bank account',
        'custom': 'Custom reward type'
    };
    
    const helpElement = document.getElementById('rewardTypeHelp');
    if (helpElement) {
        helpElement.textContent = helpTexts[type] || '';
    }
}