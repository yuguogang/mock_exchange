const fs = require('fs');
const path = require('path');

class ConfigLoader {
    constructor(basePath = '../replay-bot') {
        this.basePath = path.resolve(__dirname, basePath);
    }

    loadHedgeConfig(hedgeName) {
        const filePath = path.join(this.basePath, 'config/hedge', `${hedgeName}.json`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Hedge config not found: ${filePath}`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    loadStrategyConfig(strategyName) {
        const filePath = path.join(this.basePath, 'config/strategy', `${strategyName}.json`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Strategy config not found: ${filePath}`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    loadExchangeRules(exchange, symbol) {
        // Binance: config/binance/rules_TRXUSDT.json
        // OKX: config/okx/rules_TRX-USDT-SWAP.json
        const exDir = exchange.toLowerCase();
        const filePath = path.join(this.basePath, 'config', exDir, `rules_${symbol}.json`);

        if (!fs.existsSync(filePath)) {
            console.warn(`[ConfigLoader] Exchange rules not found: ${filePath}`);
            return null;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    loadFundingTimeline(exchange, symbol) {
        const exDir = exchange.toLowerCase();
        const filePath = path.join(this.basePath, 'config', exDir, `funding_timeline_${symbol}.json`);

        if (!fs.existsSync(filePath)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    /**
     * Load full configuration for a hedge strategy
     */
    loadFullConfig(hedgeName, strategyName) {
        const hedge = this.loadHedgeConfig(hedgeName);
        const strategy = this.loadStrategyConfig(strategyName);
        const exchanges = {};
        const funding = {};

        for (const leg of hedge.legs) {
            const exKey = leg.exchange.toLowerCase();
            exchanges[exKey] = this.loadExchangeRules(leg.exchange, leg.symbol);
            funding[exKey] = this.loadFundingTimeline(leg.exchange, leg.symbol);
        }

        return { hedge, strategy, exchanges, funding };
    }
}

module.exports = ConfigLoader;
