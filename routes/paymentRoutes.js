// Payment API Routes
const express = require('express');
const router = express.Router();
const {
    createOrder,
    verifyPayment,
    processRefund,
    getPaymentDetails,
    PLANS,
    RAZORPAY_KEY_ID
} = require('../services/paymentService');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/payment/plans
 * Get available subscription plans
 */
router.get('/plans', (req, res) => {
    res.json({
        success: true,
        plans: Object.values(PLANS).map(plan => ({
            id: plan.id,
            name: plan.name,
            amount: plan.amount / 100,
            currency: plan.currency,
            period: plan.period,
            description: plan.description
        }))
    });
});

/**
 * POST /api/payment/create-order
 * Create payment order
 */
router.post('/create-order', authMiddleware, async (req, res) => {
    try {
        const { planId } = req.body;

        if (!planId) {
            return res.status(400).json({ success: false, error: 'Plan ID required' });
        }

        const order = await createOrder(planId, req.user._id.toString());

        res.json({
            success: true,
            ...order
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/payment/verify
 * Verify payment after completion
 */
router.post('/verify', authMiddleware, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Missing payment details' });
        }

        const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (isValid) {
            // Update user's subscription status
            const plan = PLANS[planId] || PLANS.premium_bimonthly;
            const premiumExpiry = new Date();
            premiumExpiry.setDate(premiumExpiry.getDate() + (plan.durationDays || 60));

            await User.findByIdAndUpdate(req.user._id, {
                isPremium: true,
                premiumExpiry: premiumExpiry
            });

            res.json({
                success: true,
                message: 'Payment verified successfully!',
                paymentId: razorpay_payment_id,
                premiumExpiry: premiumExpiry.toISOString()
            });
        } else {
            res.status(400).json({ success: false, error: 'Payment verification failed' });
        }

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/payment/refund
 * Request refund
 */
router.post('/refund', authMiddleware, async (req, res) => {
    try {
        const { paymentId, amount, reason } = req.body;

        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'Payment ID required' });
        }

        const amountInPaise = amount ? Math.round(amount * 100) : null;
        const refund = await processRefund(paymentId, amountInPaise, reason);

        // Remove premium status on full refund
        if (!amount) {
            await User.findByIdAndUpdate(req.user._id, {
                isPremium: false,
                premiumExpiry: null
            });
        }

        res.json({
            success: true,
            ...refund
        });

    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/payment/status/:paymentId
 * Get payment status
 */
router.get('/status/:paymentId', authMiddleware, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const payment = await getPaymentDetails(paymentId);

        res.json({
            success: true,
            payment
        });

    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/payment/key
 * Get public Razorpay key for frontend
 */
router.get('/key', (req, res) => {
    res.json({
        success: true,
        keyId: RAZORPAY_KEY_ID
    });
});

module.exports = router;
