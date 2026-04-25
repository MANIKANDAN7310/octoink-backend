import Razorpay from 'razorpay';
import Order from '../models/Order.js';
import { sendAlert } from '../utils/alerting.js';

let isReconciling = false;

export const reconcilePendingPayments = async () => {
    if (isReconciling) return;
    
    // We don't want this running without Razorpay credentials
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return;

    try {
        isReconciling = true;
        
        const instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const fifteenMinsAgo = new Date(Date.now() - 15 * 60000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60000);

        // Find pending orders between 15 mins and 7 days old
        const pendingOrders = await Order.find({
            status: 'Pending',
            createdAt: { $lt: fifteenMinsAgo, $gte: sevenDaysAgo },
            razorpayOrderId: { $exists: true, $ne: null }
        }).limit(50); // Process in batches of 50

        if (pendingOrders.length === 0) {
            isReconciling = false;
            return;
        }

        console.log(JSON.stringify({ type: "payment_reconciliation_start", count: pendingOrders.length }));

        for (const order of pendingOrders) {
            try {
                // Fetch order details from Razorpay
                const rzpOrder = await instance.orders.fetch(order.razorpayOrderId);
                
                if (rzpOrder && rzpOrder.status === 'paid') {
                    // Order is paid but our DB says Pending. Webhook/callback must have failed!
                    // Fetch the payments for this order to get the payment ID
                    const payments = await instance.orders.fetchPayments(order.razorpayOrderId);
                    const capturedPayment = payments.items.find(p => p.status === 'captured');
                    
                    if (capturedPayment) {
                        const updatedOrder = await Order.findOneAndUpdate(
                            { _id: order._id, status: 'Pending' },
                            { 
                                status: 'Completed',
                                razorpayPaymentId: capturedPayment.id
                            },
                            { new: true }
                        );

                        if (updatedOrder) {
                            console.log(JSON.stringify({
                                type: "payment_reconciled",
                                orderId: order.razorpayOrderId,
                                message: "Successfully reconciled and completed missed payment."
                            }));
                            await sendAlert("Payment Reconciled (Auto-Fix)", { orderId: order.razorpayOrderId, paymentId: capturedPayment.id, traceId: order.traceId });

                            // Post-payment updates
                            try {
                                const deliveryLock = await Order.findOneAndUpdate(
                                    { _id: order._id, deliveryProcessed: false },
                                    { deliveryProcessed: true }
                                );

                                if (deliveryLock) {
                                    const Product = (await import('../models/Product.js')).default;
                                    const User = (await import('../models/User.js')).default;

                                for (const item of updatedOrder.items) {
                                    if (item.productId) {
                                        await Product.findByIdAndUpdate(item.productId, { $inc: { downloads: 1 } });
                                    }
                                }

                                if (updatedOrder.userId) {
                                    const downloadRecords = updatedOrder.items.map(item => ({
                                        productId: item.productId,
                                        productTitle: item.title,
                                        paymentId: capturedPayment.id,
                                        downloadedAt: new Date()
                                    }));
                                    await User.findByIdAndUpdate(updatedOrder.userId, {
                                        $push: { downloadHistory: { $each: downloadRecords } }
                                    });
                                }
                                }
                            } catch (postErr) {
                                console.error(JSON.stringify({ type: "payment_reconcile_post_update_error", traceId: order.traceId, error: postErr.message }));
                            }
                        }
                    }
                } else if (rzpOrder && (rzpOrder.status === 'expired' || rzpOrder.status === 'failed')) {
                    // We can mark as failed/expired
                    await Order.findByIdAndUpdate(order._id, { status: 'Failed' });
                    console.log(JSON.stringify({ type: "payment_reconciled_failed", traceId: order.traceId, orderId: order.razorpayOrderId, status: rzpOrder.status }));
                }
            } catch (err) {
                console.error(JSON.stringify({ type: "payment_reconcile_item_error", traceId: order.traceId, orderId: order.razorpayOrderId, error: err.message }));
                await sendAlert("Reconciliation Item Error", { orderId: order.razorpayOrderId, error: err.message });
            }
        }
    } catch (globalErr) {
        console.error(JSON.stringify({ type: "payment_reconcile_global_error", error: globalErr.message }));
        await sendAlert("Reconciliation Global Error", { error: globalErr.message, stack: globalErr.stack });
    } finally {
        isReconciling = false;
    }
};
