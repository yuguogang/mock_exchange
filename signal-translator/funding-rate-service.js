const fs = require('fs');
const path = require('path');

class FundingRateService {
    constructor(basePath = '../replay-bot') {
        this.basePath = path.resolve(__dirname, basePath);
        this.dataCache = new Map();
    }

    /**
     * Build file name for funding data
     */
    getFileName(exchange, symbol) {
        // Based on replay-bot data naming convention
        if (exchange.toLowerCase() === 'binance') {
            return `binance_funding_${symbol}.json`;
        } else if (exchange.toLowerCase() === 'okx') {
            return `okx_funding_${symbol}.json`;
        }
        return `${exchange}_funding_${symbol}.json`;
    }

    /**
     * Load funding data for a specific exchange and symbol
     */
    async loadData(exchange, symbol) {
        const key = `${exchange}_${symbol}`;
        if (this.dataCache.has(key)) return this.dataCache.get(key);

        // Check common data directories in replay-bot
        const dataDirs = ['data_mixed/demo_mix_trx_okx_binance', 'data'];
        let filePath = null;
        const fileName = this.getFileName(exchange, symbol);

        for (const dir of dataDirs) {
            const checkPath = path.join(this.basePath, dir, fileName);
            if (fs.existsSync(checkPath)) {
                filePath = checkPath;
                break;
            }
        }

        if (!filePath) {
            console.warn(`[FundingRateService] Funding data file not found for ${exchange} ${symbol}`);
            return [];
        }

        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Ensure sorted by ts
            data.sort((a, b) => a.ts - b.ts);
            this.dataCache.set(key, data);
            return data;
        } catch (e) {
            console.error(`[FundingRateService] Error loading data from ${filePath}: ${e.message}`);
            return [];
        }
    }

    /**
     * Get the closest funding rate at or before the given timestamp
     */
    async getRate(exchange, symbol, timestamp) {
        const data = await this.loadData(exchange, symbol);
        if (!data || data.length === 0) return 0;

        // Binary search for the closest rate <= timestamp
        let left = 0;
        let right = data.length - 1;
        let result = 0;

        if (timestamp < data[0].ts) return data[0].rate;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (data[mid].ts <= timestamp) {
                result = data[mid].rate;
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return result;
    }
}

module.exports = FundingRateService;
