// Currency utility for INR-base pricing system
// All prices are stored in INR. This utility fetches live exchange rates
// for display-only conversion (INR → USD) on the frontend.

let cachedRate = null;
let lastFetched = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

const DEFAULT_RATE = 83;

function getSafeRate(fetchedRate) {
    return fetchedRate && fetchedRate > 0 ? fetchedRate : DEFAULT_RATE;
}

/**
 * Get the current INR to USD exchange rate.
 * Returns how many INR = 1 USD (e.g., 83.5)
 * Used by frontend to convert INR prices to USD for display.
 */
export const getExchangeRate = async () => {
    const now = Date.now();
    if (cachedRate && (now - lastFetched < CACHE_DURATION)) {
        return cachedRate;
    }

    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data && data.rates && data.rates.INR) {
            cachedRate = getSafeRate(data.rates.INR); // e.g., 83.5 means 1 USD = 83.5 INR
            lastFetched = now;
            console.log(`[Currency] Updated exchange rate: 1 USD = ${cachedRate} INR`);
            return cachedRate;
        }
        throw new Error('Invalid response from exchange rate API');
    } catch (error) {
        console.error('[Currency] Error fetching exchange rate:', error.message);
        // Fallback rate if API fails
        return getSafeRate(cachedRate);
    }
};

/**
 * Convert INR amount to USD for display purposes only.
 * @param {number} amountInINR - The amount in INR
 * @returns {number} - The equivalent amount in USD
 */
export const convertToUSD = async (amountInINR) => {
    const rate = await getExchangeRate();
    return Number((amountInINR / rate).toFixed(2));
};
