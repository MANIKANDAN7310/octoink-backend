import Redis from "ioredis";
import logger from "./logger.js";

const redisUrl = process.env.REDIS_URL;

let redis;

if (redisUrl) {
    redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });

    redis.on("connect", () => {
        logger.info("✅ Redis connected");
    });

    redis.on("error", (err) => {
        logger.error("❌ Redis error:", { message: err.message });
    });
} else {
    logger.warn("⚠️ REDIS_URL not provided. Redis caching will be disabled.");
    // Mock redis for safety if not strictly required to fail
    redis = {
        get: async () => null,
        set: async () => null,
        del: async () => null,
        on: () => {}
    };
}

export default redis;
