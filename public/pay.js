// API base URL
const API_BASE = 'http://localhost:3001/api';

// Payment data
let paymentData = {};

// DOM elements
const paymentAmount = document.getElementById('paymentAmount');
const paymentToken = document.getElementById('paymentToken');
const paymentTo = document.getElementById('paymentTo');
const paymentMemo = document.getElementById('paymentMemo');
const paymentMemoContainer = document.getElementById('paymentMemoContainer');
const payButton = document.getElementById('payButton');
const loading = document.getElementById('loading');
const success = document.getElementById('success');
const error = document.getElementById('error');
const transactionResult = document.getElementById('transactionResult');
const errorMessage = document.getElementById('errorMessage');

// Initialize payment page
document.addEventListener('DOMContentLoaded', () => {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    paymentData = {
        to: urlParams.get('to'),
        amount: urlParams.get('amount'),
        token: urlParams.get('token') || 'AVAX',
        memo: urlParams.get('memo') || ''
    };

    // Validate required parameters
    if (!paymentData.to || !paymentData.amount) {
        showError('Invalid payment parameters');
        return;
    }

    // Display payment details
    displayPaymentDetails();
});

// Display payment details
function displayPaymentDetails() {
    paymentAmount.textContent = `${paymentData.amount} ${paymentData.token}`;
    paymentToken.textContent = paymentData.token;
    paymentTo.textContent = paymentData.to;
    
    if (paymentData.memo) {
        paymentMemo.textContent = paymentData.memo;
        paymentMemoContainer.classList.remove('hidden');
    } else {
        paymentMemoContainer.classList.add('hidden');
    }
}

// Execute payment
async function executePayment() {
    try {
        // Show loading
        showLoading();
        
        // Execute payment via API
        const response = await fetch(`${API_BASE}/checkout/pay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Payment failed');
        }

        const data = await response.json();
        showSuccess(data);
        
    } catch (error) {
        console.error('Payment error:', error);
        showError(error.message);
    }
}

// Show loading state
function showLoading() {
    payButton.classList.add('hidden');
    loading.classList.remove('hidden');
    success.classList.add('hidden');
    error.classList.add('hidden');
}

// Show success state
function showSuccess(data) {
    loading.classList.add('hidden');
    success.classList.remove('hidden');
    
    // Display transaction result
    transactionResult.innerHTML = `
        <div class="space-y-2">
            <div class="flex justify-between">
                <span class="text-gray-600">Status:</span>
                <span class="text-green-600 font-semibold">Success</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-600">Amount:</span>
                <span class="font-semibold">${paymentData.amount} ${paymentData.token}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-600">To:</span>
                <span class="font-mono text-sm">${paymentData.to}</span>
            </div>
            ${paymentData.memo ? `
            <div class="flex justify-between">
                <span class="text-gray-600">Memo:</span>
                <span>${paymentData.memo}</span>
            </div>
            ` : ''}
            <div class="mt-4 p-3 bg-blue-50 rounded text-sm">
                <strong>Transaction Details:</strong><br>
                <pre class="text-xs mt-2 overflow-auto">${JSON.stringify(data.transaction, null, 2)}</pre>
            </div>
        </div>
    `;
}

// Show error state
function showError(message) {
    loading.classList.add('hidden');
    success.classList.add('hidden');
    error.classList.remove('hidden');
    
    errorMessage.textContent = message;
}

// Cancel payment
function cancelPayment() {
    if (confirm('Are you sure you want to cancel this payment?')) {
        window.close();
    }
}

// Retry payment
function retryPayment() {
    error.classList.add('hidden');
    payButton.classList.remove('hidden');
}

// Handle back button
window.addEventListener('beforeunload', (e) => {
    if (loading.classList.contains('hidden') && success.classList.contains('hidden') && error.classList.contains('hidden')) {
        // Payment not completed, show warning
        e.preventDefault();
        e.returnValue = '';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cancelPayment();
    }
});

console.log('Payment page initialized');
