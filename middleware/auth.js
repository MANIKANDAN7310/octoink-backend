import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token" });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        logger.error("JWT Verify Error:", { message: err.message, url: req.originalUrl });
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: "Token expired. Please login again." });
        }
        res.status(401).json({ success: false, message: "Invalid token" });
    }
};

export default verifyToken;
