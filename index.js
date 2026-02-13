let currentUser = null;
let config = null;
let appliedPromo = null;
let currentReceipt = null;

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
        
        // Display actual username, credits, and points
        updateUserDisplay();

        await loadConfig();
        await loadTransactions();
        setupEventListeners();
        
        // Auto-refresh user data every 30 seconds to catch approved transactions
        setInterval(async () => {
            await refreshUserData();
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
        await refreshUserData();
        await loadTransactions();
    }
});

function updateUserDisplay() {
    document.getElementById('username').textContent = `@${currentUser.username || 'User'}`;
    document.getElementById('creditsDisplay').textContent = `Credits: ${currentUser.credits || 0}`;
    
    // Add points display if element exists
    const pointsDisplay = document.getElementById('pointsDisplay');
    if (pointsDisplay) {
        pointsDisplay.textContent = `Points: ${currentUser.points || 0}`;
    }
}

async function refreshUserData() {
    try {
        const response = await fetch('/api/verify', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUserDisplay();
        }
    } catch (error) {
        console.error('Error refreshing user data:', error);
    }
}

function setupEventListeners() {
    const creditInput = document.getElementById('creditAmount');
    creditInput.addEventListener('input', calculatePrice);
}

async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        config = data;

        // Update max info if set
        if (config.maxPurchase) {
            document.getElementById('maxInfo').textContent = `Maximum: ${config.maxPurchase} credits`;
            document.getElementById('creditAmount').max = config.maxPurchase;
        } else {
            document.getElementById('maxInfo').textContent = 'Maximum: Unlimited';
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showNotification('Error loading purchase configuration', 'error');
    }
}

function calculatePrice() {
    const creditAmount = parseInt(document.getElementById('creditAmount').value) || 0;
    
    if (creditAmount < 100) {
        document.getElementById('totalPrice').textContent = '₦0.00';
        document.getElementById('priceBreakdown').textContent = '';
        return;
    }

    if (config.maxPurchase && creditAmount > config.maxPurchase) {
        document.getElementById('priceBreakdown').textContent = `Maximum purchase is ${config.maxPurchase} credits`;
        return;
    }

    // Calculate base price
    const rate = config.pricePerCredit || (800 / 20);
    let totalPrice = creditAmount * rate;

    // Apply promo if any
    if (appliedPromo) {
        const discount = (totalPrice * appliedPromo.discount) / 100;
        totalPrice -= discount;
        document.getElementById('priceBreakdown').textContent = 
            `${creditAmount} credits × ₦${rate.toFixed(2)} - ${appliedPromo.discount}% discount`;
    } else {
        document.getElementById('priceBreakdown').textContent = 
            `${creditAmount} credits × ₦${rate.toFixed(2)}`;
    }

    document.getElementById('totalPrice').textContent = `₦${totalPrice.toFixed(2)}`;
}

async function applyPromo() {
    const promoCode = document.getElementById('promoCode').value.trim();
    const promoMessage = document.getElementById('promoMessage');

    if (!promoCode) {
        promoMessage.textContent = 'Please enter a promo code';
        promoMessage.className = 'promo-message error';
        return;
    }

    try {
        const response = await fetch('/api/promo/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            },
            body: JSON.stringify({ code: promoCode })
        });

        const data = await response.json();

        if (data.valid) {
            appliedPromo = data.promo;
            promoMessage.textContent = `✓ ${data.promo.discount}% discount applied!`;
            promoMessage.className = 'promo-message success';
            showNotification(`Promo code applied! ${data.promo.discount}% discount`, 'success');
            calculatePrice();
        } else {
            appliedPromo = null;
            promoMessage.textContent = data.message || 'Invalid promo code';
            promoMessage.className = 'promo-message error';
            calculatePrice();
        }
    } catch (error) {
        console.error('Error applying promo:', error);
        promoMessage.textContent = 'Error validating promo code';
        promoMessage.className = 'promo-message error';
    }
}

async function initiatePurchase() {
    const creditAmount = parseInt(document.getElementById('creditAmount').value);

    if (!creditAmount || creditAmount < 100) {
        showNotification('Please enter at least 100 credits', 'error');
        return;
    }

    if (config.maxPurchase && creditAmount > config.maxPurchase) {
        showNotification(`Maximum purchase is ${config.maxPurchase} credits`, 'error');
        return;
    }

    // Calculate total
    const rate = config.pricePerCredit || (800 / 20);
    let totalPrice = creditAmount * rate;

    if (appliedPromo) {
        const discount = (totalPrice * appliedPromo.discount) / 100;
        totalPrice -= discount;
    }

    // Show payment modal
    document.getElementById('bankName').textContent = config.bankName || '-';
    document.getElementById('accountNumber').textContent = config.accountNumber || '-';
    document.getElementById('accountName').textContent = config.accountName || '-';
    document.getElementById('paymentAmount').textContent = `₦${totalPrice.toFixed(2)}`;

    document.getElementById('paymentModal').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
    currentReceipt = null;
    document.getElementById('receiptUpload').value = '';
    document.getElementById('uploadText').textContent = 'Upload Payment Receipt';
    document.getElementById('paymentNote').value = '';
    
    // Re-enable the confirm button when modal is closed
    const confirmButton = document.querySelector('.btn-confirm-payment');
    if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'I Have Sent Money';
    }
}

function handleReceiptUpload(event) {
    const file = event.target.files[0];
    if (file) {
        // Check file size (max 5MB before compression)
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Image too large. Please use an image under 5MB', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            // Compress the image
            compressImage(e.target.result, file.name);
        };
        reader.readAsDataURL(file);
    }
}

function compressImage(dataUrl, fileName) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions (max 1200px width/height)
        let width = img.width;
        let height = img.height;
        const maxSize = 1200;
        
        if (width > height && width > maxSize) {
            height = (height / width) * maxSize;
            width = maxSize;
        } else if (height > maxSize) {
            width = (width / height) * maxSize;
            height = maxSize;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with 0.7 quality (good balance of size/quality)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        // Check if compressed size is reasonable (should be under 500KB)
        const sizeInBytes = (compressedDataUrl.length * 3) / 4;
        if (sizeInBytes > 500 * 1024) {
            // Compress more aggressively
            currentReceipt = canvas.toDataURL('image/jpeg', 0.5);
        } else {
            currentReceipt = compressedDataUrl;
        }
        
        document.getElementById('uploadText').textContent = `✓ ${fileName} (compressed)`;
        showNotification('Receipt uploaded and compressed', 'success');
    };
    
    img.onerror = function() {
        showNotification('Error loading image. Please try another file.', 'error');
        document.getElementById('receiptUpload').value = '';
    };
    
    img.src = dataUrl;
}

async function confirmPayment() {
    if (!currentReceipt) {
        showNotification('Please upload a payment receipt', 'error');
        return;
    }

    // Get the button and prevent duplicate clicks
    const confirmButton = document.querySelector('.btn-confirm-payment');
    if (confirmButton.disabled) {
        return; // Already processing
    }
    
    // Disable button and change text
    confirmButton.disabled = true;
    const originalText = confirmButton.textContent;
    confirmButton.textContent = 'Processing...';

    const creditAmount = parseInt(document.getElementById('creditAmount').value);
    const rate = config.pricePerCredit || (800 / 20);
    let totalPrice = creditAmount * rate;

    if (appliedPromo) {
        const discount = (totalPrice * appliedPromo.discount) / 100;
        totalPrice -= discount;
    }

    const transactionData = {
        credits: creditAmount,
        amount: totalPrice,
        promoCode: appliedPromo ? appliedPromo.code : null,
        receipt: currentReceipt,
        note: document.getElementById('paymentNote').value
    };

    try {
        const response = await fetch('/api/transaction/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            },
            body: JSON.stringify(transactionData)
        });

        // Handle non-JSON responses (like HTML error pages)
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            // Server returned HTML or other non-JSON (usually an error page)
            const text = await response.text();
            console.error('Non-JSON response:', text);
            
            if (response.status === 413) {
                throw new Error('Receipt image is too large. Please try a smaller image.');
            } else {
                throw new Error(`Server error: ${response.status}`);
            }
        }

        if (response.ok) {
            // Show success message
            showNotification('Transaction submitted successfully! Awaiting approval.', 'success');
            closePaymentModal();
            
            // Reset form
            document.getElementById('creditAmount').value = '';
            document.getElementById('promoCode').value = '';
            document.getElementById('promoMessage').textContent = '';
            appliedPromo = null;
            calculatePrice();
            
            await loadTransactions();
        } else {
            showNotification(data.error || 'Error creating transaction', 'error');
            // Re-enable button on error
            confirmButton.disabled = false;
            confirmButton.textContent = originalText;
        }
    } catch (error) {
        console.error('Error creating transaction:', error);
        showNotification(error.message || 'Error submitting transaction. Please try again.', 'error');
        // Re-enable button on error
        confirmButton.disabled = false;
        confirmButton.textContent = originalText;
    }
}

async function loadTransactions() {
    try {
        const response = await fetch('/api/transactions/user', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            }
        });

        const data = await response.json();
        displayTransactions(data.transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function displayTransactions(transactions) {
    const container = document.getElementById('transactionsList');

    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<p class="no-transactions">No transactions yet</p>';
        return;
    }

    container.innerHTML = transactions.map(tx => `
        <div class="transaction-item">
            <div class="transaction-header">
                <span class="transaction-id">#${tx._id.slice(-8)}</span>
                <span class="transaction-status ${tx.status}">${tx.status.toUpperCase()}</span>
            </div>
            <div class="transaction-details">
                <div class="transaction-detail">
                    <span class="detail-label">Credits:</span>
                    <span class="detail-value">${tx.credits}</span>
                </div>
                <div class="transaction-detail">
                    <span class="detail-label">Amount:</span>
                    <span class="detail-value">₦${tx.amount.toFixed(2)}</span>
                </div>
                <div class="transaction-detail">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${new Date(tx.createdAt).toLocaleDateString()}</span>
                </div>
                ${tx.promoCode ? `
                <div class="transaction-detail">
                    <span class="detail-label">Promo:</span>
                    <span class="detail-value">${tx.promoCode}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function copyToClipboard(element) {
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback handled by CSS
    });
}

function goToPoints() {
    window.location.href = '/points';
}

function logout() {
    localStorage.removeItem('userToken');
    window.location.href = '/login';
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.textContent = message;

    // Add to body
    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}