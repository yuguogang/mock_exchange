class FundingCalculator {
    constructor(config) {
        this.config = config;
    }

    /**
     * Calculate funding fee for a given position and rate
     * @param {Object} position - { symbol, size, entryPrice }
     * @param {number} rate - funding rate (decimal, e.g. 0.0001)
     * @returns {number} - funding fee amount
     */
    calculateFee(position, rate) {
        const notional = Math.abs(position.size) * (position.markPrice || position.entryPrice);
        // Fee = Notional * Rate
        // For long position: if rate > 0, pay; if rate < 0, receive.
        // For short position: if rate > 0, receive; if rate < 0, pay.
        // Side multiplier: Long = 1, Short = -1
        const sideMultiplier = position.side === 'LONG' ? 1 : -1;

        // Income = - (Notional * Rate * SideMultiplier) 
        // If result is negative, it's a payment. If positive, it's a receipt.
        return -(notional * rate * sideMultiplier);
    }

    /**
     * Generate income record for mock-server
     */
    generateIncomeRecord(symbol, amount, timestamp, sessionId) {
        return {
            symbol: symbol,
            incomeType: 'FUNDING_FEE',
            income: amount.toFixed(8),
            asset: 'USDT',
            time: timestamp,
            info: `Funding Fee | Session: ${sessionId}`
        };
    }
}

module.exports = FundingCalculator;
