import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { convertToINR } from '../utils/currencyUtils.js';
import { sendAlert } from '../utils/alerting.js';

export const createOrder = async (req, res) => {
    try {
        let { currency, items, clientInfo, orderType, customDesignId } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid request data' });
        }

        const traceId = crypto.randomUUID();
        const customDesignPrice = parseFloat(process.env.CUSTOM_DESIGN_PRICE) || 5.99;
        const displayCurrency = currency === 'INR' ? 'INR' : 'USD'; // Validate currency
        let calculatedAmountUSD = 0;

        // Idempotency: Check for existing pending orders to prevent duplicates
        if (orderType === 'Custom' && customDesignId) {
            const existingOrder = await Order.findOne({ customDesignId, userId: req.user.id, status: 'Pending' });
            if (existingOrder && existingOrder.razorpayOrderId) {
                console.log(JSON.stringify({ type: "payment_idempotency_hit", orderId: existingOrder.razorpayOrderId, message: "Returning existing custom order" }));
                return res.json({
                    success: true,
                    orderId: existingOrder.razorpayOrderId,
                    amount: Math.round(existingOrder.totalAmount * 100),
                    currency: existingOrder.currency
                });
            }
        } else if (orderType !== 'Custom') {
            const productIds = items.map(i => i.productId).sort().join(',');
            const recentTime = new Date(Date.now() - 30 * 60000); // 30 mins
            const existingOrders = await Order.find({ 
                userId: req.user.id, 
                orderType: 'Product', 
                status: 'Pending',
                createdAt: { $gte: recentTime }
            });
            const duplicateOrder = existingOrders.find(o => {
                const oIds = o.items.map(i => i.productId.toString()).sort().join(',');
                return oIds === productIds && o.displayCurrency === displayCurrency; // Match items and currency request
            });
            if (duplicateOrder && duplicateOrder.razorpayOrderId) {
                console.log(JSON.stringify({ type: "payment_idempotency_hit", orderId: duplicateOrder.razorpayOrderId, message: "Returning existing product order" }));
                return res.json({
                    success: true,
                    orderId: duplicateOrder.razorpayOrderId,
                    amount: Math.round(duplicateOrder.totalAmount * 100),
                    currency: duplicateOrder.currency
                });
            }
        }

        if (orderType === 'Custom') {
            calculatedAmountUSD = customDesignPrice; // Use config base USD price
            if (items[0]) items[0].price = customDesignPrice;
        } else {
            // Fetch products to verify price and existence
            for (let item of items) {
                if (!item.productId) {
                    return res.status(400).json({ success: false, message: 'Product ID missing in items' });
                }
                const product = await Product.findById(item.productId);
                if (!product) {
                    return res.status(404).json({ success: false, message: `Product not found: ${item.productId}` });
                }
                // Overwrite the price from frontend with the DB price (USD)
                item.price = product.price;
                item.title = product.title;
                calculatedAmountUSD += product.price * (item.quantity || 1);
            }
        }

        if (calculatedAmountUSD <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid total amount' });
        }

        let orderAmount;
        let orderCurrency;
        let totalAmountPaid;
        let exchangeRateUsed = 1;

        if (displayCurrency === 'INR') {
            const amountINR = await convertToINR(calculatedAmountUSD);
            orderAmount = Math.round(amountINR * 100); // amount in paise
            orderCurrency = 'INR';
            totalAmountPaid = amountINR;
            exchangeRateUsed = amountINR / calculatedAmountUSD;
            console.log(JSON.stringify({ type: "payment_conversion", traceId, baseUSD: calculatedAmountUSD, convertedINR: amountINR, rate: exchangeRateUsed }));
        } else {
            orderAmount = Math.round(calculatedAmountUSD * 100); // amount in cents
            orderCurrency = 'USD';
            totalAmountPaid = calculatedAmountUSD;
            console.log(JSON.stringify({ type: "payment_processing", traceId, baseUSD: calculatedAmountUSD, currency: 'USD' }));
        }

        const instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const options = {
            amount: orderAmount,
            currency: orderCurrency,
            receipt: `receipt_order_${Date.now()}`,
        };

        let order;
        try {
            order = await instance.orders.create(options);
        } catch (err) {
            console.error(JSON.stringify({ type: "payment_create_error", traceId, error: err.message, description: err.description }));
            // Fallback for USD error if Razorpay rejects international payment
            if (err.description && err.description.toLowerCase().includes("currency") && orderCurrency === 'USD') {
                console.log(JSON.stringify({ type: "payment_fallback", traceId, message: "Razorpay rejected USD. Falling back to INR." }));
                const amountINR = await convertToINR(calculatedAmountUSD);
                orderAmount = Math.round(amountINR * 100);
                orderCurrency = 'INR';
                totalAmountPaid = amountINR;
                exchangeRateUsed = amountINR / calculatedAmountUSD;
                options.amount = orderAmount;
                options.currency = orderCurrency;
                order = await instance.orders.create(options);
            } else {
                throw err;
            }
        }

        if (!order) {
            return res.status(500).json({ success: false, message: 'Some error occurred with Razorpay' });
        }

        console.log(JSON.stringify({ type: "payment_order_created", traceId, orderId: order.id, userId: req.user.id, amount: order.amount, currency: order.currency }));

        // Save pending order to DB
        const newOrder = new Order({
            traceId,
            userId: req.user.id,
            items,
            totalAmount: totalAmountPaid, // Store the actual amount paid in the order currency
            currency: orderCurrency,
            displayAmount: calculatedAmountUSD, // Base USD amount
            displayCurrency: 'USD',
            originalCurrency: displayCurrency,
            finalCurrency: orderCurrency,
            exchangeRateUsed: exchangeRateUsed,
            razorpayOrderId: order.id,
            status: 'Pending',
            orderType: orderType || 'Product',
            clientInfo,
            customDesignId
        });

        await newOrder.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.error(JSON.stringify({ type: "payment_unhandled_error", error: err.message, stack: err.stack }));
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
            // First check if order exists and is already completed to prevent duplicate processing
            let orderRecord = await Order.findOne({ razorpayOrderId: razorpay_order_id });
            
            if (!orderRecord) {
                return res.status(404).json({ success: false, message: 'Order not found in database' });
            }

            if (orderRecord.status === 'Completed') {
                console.log(JSON.stringify({ type: "payment_duplicate_verify", orderId: razorpay_order_id, message: "Order already marked as completed." }));
                const populatedOrder = await Order.findById(orderRecord._id).populate({
                    path: 'items.productId',
                    select: '+file'
                });
                
                const orderObj = populatedOrder.toObject();
                orderObj.items = orderObj.items.map(item => {
                    if (item.productId) {
                        item.hasFile = !!item.productId.file;
                        delete item.productId.file;
                    }
                    return item;
                });
                return res.json({ success: true, message: 'Payment verified successfully', order: orderObj });
            }

            // Update order status in DB safely with status check
            const order = await Order.findOneAndUpdate(
                { razorpayOrderId: razorpay_order_id, status: { $ne: 'Completed' } },
                {
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    status: 'Completed'
                },
                { new: true }
            );

            if (!order) {
                return res.json({ success: true, message: 'Payment already processed concurrently' });
            }

            console.log(JSON.stringify({ type: "payment_verified_success", traceId: order.traceId, orderId: razorpay_order_id, userId: order.userId }));

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

            // Post-payment updates (non-blocking delivery logic)
            try {
                // Ensure delivery runs strictly once
                const deliveryLock = await Order.findOneAndUpdate(
                    { _id: order._id, deliveryProcessed: false },
                    { deliveryProcessed: true }
                );

                if (deliveryLock) {
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
                            downloadedAt: new Date() // UTC via mongoose
                        }));
                        await User.findByIdAndUpdate(order.userId, {
                            $push: { downloadHistory: { $each: downloadRecords } }
                        });
                    }
                } else {
                    console.log(JSON.stringify({ type: "delivery_already_processed", traceId: order.traceId, orderId: order.razorpayOrderId }));
                }
            } catch (postErr) {
                console.error(JSON.stringify({ type: "payment_post_update_error", traceId: order?.traceId, error: postErr.message }));
            }
        } else {
            console.warn(JSON.stringify({ type: "payment_signature_invalid", orderId: razorpay_order_id }));
            await sendAlert("Invalid Payment Signature", { orderId: razorpay_order_id, expected: expectedSignature, received: razorpay_signature });
            res.status(400).json({ success: false, message: 'Invalid signature' });
        }
    } catch (err) {
        console.error(JSON.stringify({ type: "payment_verify_error", error: err.message, stack: err.stack }));
        res.status(500).json({ success: false, message: err.message });
    }
};

export const webhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return res.status(200).send('Webhook secret not configured, skipping');

        const signature = req.headers['x-razorpay-signature'];
        const bodyStr = JSON.stringify(req.body);
        
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(bodyStr)
            .digest('hex');

        if (expectedSignature !== signature) {
            console.error(JSON.stringify({ type: "payment_webhook_error", message: "Invalid webhook signature" }));
            return res.status(400).send('Invalid signature');
        }

        const { event, payload } = req.body;
        const webhookEventId = req.headers['x-razorpay-event-id'];

        if (event === 'payment.captured' || event === 'order.paid') {
            const payment = payload.payment.entity;
            const orderId = payment.order_id;
            
            // Replay protection & status update
            const order = await Order.findOneAndUpdate(
                { 
                    razorpayOrderId: orderId, 
                    status: { $ne: 'Completed' },
                    processedWebhooks: { $ne: webhookEventId } // Check if event is not already processed
                },
                {
                    razorpayPaymentId: payment.id,
                    status: 'Completed',
                    $push: { processedWebhooks: webhookEventId }
                },
                { new: true }
            );

            if (order) {
                console.log(JSON.stringify({
                    type: "payment_webhook_success",
                    traceId: order.traceId,
                    orderId,
                    paymentId: payment.id,
                    amount: payment.amount,
                    currency: payment.currency,
                    message: "Webhook automatically captured and completed order."
                }));
                
                try {
                    // Delivery logic with deliveryProcessed idempotency lock
                    const deliveryLock = await Order.findOneAndUpdate(
                        { _id: order._id, deliveryProcessed: false },
                        { deliveryProcessed: true }
                    );

                    if (deliveryLock) {
                        // Increment downloads
                    for (const item of order.items) {
                        if (item.productId) {
                            await Product.findByIdAndUpdate(item.productId, { $inc: { downloads: 1 } });
                        }
                    }

                    // Add download history
                    if (order.userId) {
                        const downloadRecords = order.items.map(item => ({
                            productId: item.productId,
                            productTitle: item.title,
                            paymentId: payment.id,
                            downloadedAt: new Date() // UTC via mongoose
                        }));
                        await User.findByIdAndUpdate(order.userId, {
                            $push: { downloadHistory: { $each: downloadRecords } }
                        });
                    }
                }
            } catch (postErr) {
                console.error(JSON.stringify({ type: "payment_webhook_post_update_error", traceId: order.traceId, error: postErr.message }));
            }
            } else {
                console.log(JSON.stringify({ type: "payment_webhook_skip", orderId, message: "Order already completed, event replayed, or not found." }));
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error(JSON.stringify({ type: "payment_webhook_fatal", error: error.message }));
        await sendAlert("Webhook Fatal Error", { error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};
