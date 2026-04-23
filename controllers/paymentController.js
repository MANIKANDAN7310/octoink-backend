import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';

export const createOrder = async (req, res) => {
    try {
        const { amount, currency, items, clientInfo, orderType } = req.body;

        if (!amount || !items) {
            return res.status(400).json({ success: false, message: 'Invalid request data' });
        }

        const instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const options = {
            amount: Math.round(amount * 100), // amount in smallest currency unit
            currency: currency || "INR",
            receipt: `receipt_order_${Date.now()}`,
        };

        const order = await instance.orders.create(options);

        if (!order) {
            return res.status(500).json({ success: false, message: 'Some error occurred with Razorpay' });
        }

        // Save pending order to DB
        const newOrder = new Order({
            userId: req.user.id,
            items,
            totalAmount: amount,
            currency: currency || "INR",
            razorpayOrderId: order.id,
            status: 'Pending',
            orderType: orderType || 'Product',
            clientInfo
        });

        await newOrder.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.error("Razorpay Create Order Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Update order status in DB
            const order = await Order.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id },
                {
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    status: 'Completed'
                },
                { new: true }
            );

            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found in database' });
            }

            // Populate product details to help the frontend identify digital files
            const populatedOrder = await Order.findById(order._id).populate({
                path: 'items.productId',
                select: '+file'
            });

            const orderObj = populatedOrder.toObject();
            orderObj.items = orderObj.items.map(item => {
                if (item.productId) {
                    item.hasFile = !!item.productId.file;
                    delete item.productId.file; // Still hide the raw URL
                }
                return item;
            });

            res.json({
                success: true,
                message: 'Payment verified successfully',
                order: orderObj
            });

            // Post-payment updates (non-blocking)
            try {
                const Product = (await import('../models/Product.js')).default;
                const User = (await import('../models/User.js')).default;

                // 1. Increment product download counts
                for (const item of order.items) {
                    if (item.productId) {
                        await Product.findByIdAndUpdate(item.productId, { $inc: { downloads: 1 } });
                    }
                }

                // 2. Add to User download history
                if (order.userId) {
                    const downloadRecords = order.items.map(item => ({
                        productId: item.productId,
                        productTitle: item.title,
                        paymentId: razorpay_payment_id,
                        downloadedAt: new Date()
                    }));
                    await User.findByIdAndUpdate(order.userId, {
                        $push: { downloadHistory: { $each: downloadRecords } }
                    });
                }
            } catch (postErr) {
                console.error("Post-payment update error:", postErr);
            }
        } else {
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }
    } catch (err) {
        console.error("Razorpay Verify Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
