// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
    // Create mobile menu toggle button if it doesn't exist
    if (!document.querySelector('.mobile-menu-toggle')) {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'mobile-menu-toggle';
        toggleButton.innerHTML = '<span></span><span></span><span></span>';
        document.body.appendChild(toggleButton);
        
        // Create mobile overlay
        const overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        document.body.appendChild(overlay);
        
        // Toggle menu
        toggleButton.addEventListener('click', function() {
            const sidebar = document.querySelector('.sidebar');
            toggleButton.classList.toggle('active');
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
        
        // Close menu when clicking overlay
        overlay.addEventListener('click', function() {
            const sidebar = document.querySelector('.sidebar');
            toggleButton.classList.remove('active');
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
        
        // Close menu when clicking nav item on mobile
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    const sidebar = document.querySelector('.sidebar');
                    toggleButton.classList.remove('active');
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            });
        });
    }
});

// Section Navigation
function showSection(sectionId) {
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.classList.add('active');
    }
    
    // Update active nav item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    // Find and activate the clicked nav item
    const clickedNavItem = event?.target?.closest('.nav-item');
    if (clickedNavItem) {
        clickedNavItem.classList.add('active');
    }
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Add your logout logic here
        window.location.href = 'login.html'; // or your login page
    }
}

// Transaction Modal
function closeTransactionModal() {
    const modal = document.getElementById('transactionModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('transactionModal');
    if (event.target === modal) {
        closeTransactionModal();
    }
});

// Placeholder functions - replace with your actual implementations
function filterTransactions() {
    console.log('Filter transactions');
    // Add your filter logic here
}

function saveTelegramSettings() {
    console.log('Save Telegram settings');
    // Add your save logic here
}

function setupWebhook() {
    console.log('Setup webhook');
    // Add your webhook setup logic here
}

function checkWebhook() {
    console.log('Check webhook');
    // Add your webhook check logic here
}

function savePricingSettings() {
    console.log('Save pricing settings');
    // Add your save logic here
}

function saveAccountDetails() {
    console.log('Save account details');
    // Add your save logic here
}

function createPromo() {
    console.log('Create promo');
    // Add your promo creation logic here
}

function approveTransaction() {
    console.log('Approve transaction');
    // Add your approve logic here
    closeTransactionModal();
}

function declineTransaction() {
    console.log('Decline transaction');
    // Add your decline logic here
    closeTransactionModal();
}