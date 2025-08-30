// API base URL
const API_BASE = 'http://localhost:3001/api';

// DOM elements
const form = document.getElementById('checkoutForm');
const loading = document.getElementById('loading');
const results = document.getElementById('results');

// Form elements
const recipientAddress = document.getElementById('recipientAddress');
const amount = document.getElementById('amount');
const token = document.getElementById('token');
const memo = document.getElementById('memo');

// Result elements
const qrCode = document.getElementById('qrCode');
const resultTo = document.getElementById('resultTo');
const resultAmount = document.getElementById('resultAmount');
const resultToken = document.getElementById('resultToken');
const resultMemo = document.getElementById('resultMemo');
const resultMemoContainer = document.getElementById('resultMemoContainer');
const checkoutUrl = document.getElementById('checkoutUrl');

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Show loading
    showLoading();
    
    try {
        const formData = {
            to: recipientAddress.value.trim(),
            amount: amount.value,
            token: token.value,
            memo: memo.value.trim()
        };

        // Validate address
        if (!isValidAddress(formData.to)) {
            throw new Error('Invalid recipient address');
        }

        // Create checkout
        const response = await fetch(`${API_BASE}/checkout/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create checkout');
        }

        const data = await response.json();
        showResults(data);
        
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
});

// Show loading state
function showLoading() {
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    form.classList.add('hidden');
}

// Show results
function showResults(data) {
    loading.classList.add('hidden');
    results.classList.remove('hidden');
    
    // Set QR code
    qrCode.innerHTML = `<img src="${data.qrCode}" alt="QR Code" class="w-48 h-48">`;
    
    // Set payment details
    resultTo.textContent = data.paymentDetails.to;
    resultAmount.textContent = `${data.paymentDetails.amount} ${data.paymentDetails.token}`;
    resultToken.textContent = data.paymentDetails.token;
    
    // Handle memo
    if (data.paymentDetails.memo) {
        resultMemo.textContent = data.paymentDetails.memo;
        resultMemoContainer.classList.remove('hidden');
    } else {
        resultMemoContainer.classList.add('hidden');
    }
    
    // Set checkout URL
    checkoutUrl.value = data.checkoutUrl;
}

// Show error
function showError(message) {
    loading.classList.add('hidden');
    results.classList.add('hidden');
    form.classList.remove('hidden');
    
    // Show error notification
    showNotification(message, 'error');
}

// Copy to clipboard
function copyToClipboard() {
    checkoutUrl.select();
    checkoutUrl.setSelectionRange(0, 99999);
    document.execCommand('copy');
    
    showNotification('Checkout URL copied to clipboard!', 'success');
}

// Test payment
function testPayment() {
    const url = checkoutUrl.value;
    if (url) {
        window.open(url, '_blank');
    }
}

// Reset form
function resetForm() {
    form.reset();
    results.classList.add('hidden');
    form.classList.remove('hidden');
}

// Validate Ethereum address
function isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-500 text-white' : 
        type === 'success' ? 'bg-green-500 text-white' : 
        'bg-blue-500 text-white'
    }`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    // Set default recipient for testing
    recipientAddress.value = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
    
    // Add some example amounts
    amount.value = '0.001';
    
    console.log('0xGasless Checkout initialized');
});
