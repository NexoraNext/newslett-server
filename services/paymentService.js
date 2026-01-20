// Razorpay Payment Service
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Razorpay Keys
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXX';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'XXXXXXXXXXXXXXXXXX';

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

// Subscription Plans
const PLANS = {
    premium_bimonthly: {
        id: 'premium_bimonthly',
        name: 'Newslet Premium',
        amount: 9900, // Amount in paise (₹99)
        currency: 'INR',
        period: 'bimonthly',
        durationDays: 60,
        description: 'Premium subscription - ₹99 for 2 months'
    }
};

/**
 * Create a Razorpay order for subscription
 */
async function createOrder(planId, userId = null) {
    const plan = PLANS[planId];
    if (!plan) {
        throw new Error('Invalid plan ID');
    }

    const options = {
        amount: plan.amount,
        currency: plan.currency,
        receipt: `receipt_${Date.now()}`,
        notes: {
            plan_id: planId,
            user_id: userId,
            plan_name: plan.name
        }
    };

    const order = await razorpay.orders.create(options);
    console.log(`✅ Order created: ${order.id} for ₹${plan.amount / 100}`);

    return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: RAZORPAY_KEY_ID,
        planName: plan.name,
        planDescription: plan.description
    };
}

/**
 * Verify payment signature
 */
function verifyPayment(orderId, paymentId, signature) {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    return expectedSignature === signature;
}

/**
 * Process refund request
 */
async function processRefund(paymentId, amount = null, reason = 'Customer requested') {
    const refundOptions = {
        speed: 'normal',
        notes: {
            reason: reason,
            requested_at: new Date().toISOString()
        }
    };

    if (amount) {
        refundOptions.amount = amount;
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    return {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount / 100,
        status: refund.status,
        message: 'Refund initiated. Will be processed in 5-7 business days.'
    };
}

/**
 * Get payment details
 */
async function getPaymentDetails(paymentId) {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
        id: payment.id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        createdAt: new Date(payment.created_at * 1000).toISOString()
    };
}

module.exports = {
    createOrder,
    verifyPayment,
    processRefund,
    getPaymentDetails,
    PLANS,
    RAZORPAY_KEY_ID
};
