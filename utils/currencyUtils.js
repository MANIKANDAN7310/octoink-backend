// Using global fetch available in Node 18+

let cachedRate = null;
let lastFetched = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export const getExchangeRate = async () => {
    const now = Date.now();
    if (cachedRate && (now - lastFetched < CACHE_DURATION)) {
        return cachedRate;
    }

    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data && data.rates && data.rates.INR) {
            cachedRate = data.rates.INR;
            lastFetched = now;
            console.log(`[Currency] Updated exchange rate: 1 USD = ${cachedRate} INR`);
            return cachedRate;
        }
        throw new Error('Invalid response from exchange rate API');
    } catch (error) {
        console.error('[Currency] Error fetching exchange rate:', error.message);
        // Fallback rate if API fails
        return cachedRate || 83.5; 
    }
};

export const convertToINR = async (amountInUSD) => {
    const rate = await getExchangeRate();
    return Number((amountInUSD * rate).toFixed(2));
};
