const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ConfigLoader = require('./config-loader');
const TranslationEngine = require('./translation-engine');
const FundingRateService = require('./funding-rate-service');

const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || 'http://localhost:3000';

/**
 * Exchange-aware signal translator
 * Converts signals to core schema and posts to exchange-aware mock server
 */
async function main() {
    const args = process.argv.slice(2);
    const hedgeName = args[0] || 'demo_hedge_trx_binance_okx';
    const strategyName = args[1] || 'demo_strategy_funding_trx';
    const signalsFile = args[2] || 'indexed_history_TRX.json';

    console.log(`[ExchangeAwareTranslator] Starting translation for ${hedgeName}...`);

    const loader = new ConfigLoader();
    const fundingRateService = new FundingRateService();
    let config;

    try {
        config = loader.loadFullConfig(hedgeName, strategyName);
    } catch (e) {
        console.error(`Error loading configs: ${e.message}`);
        process.exit(1);
    }

    const engine = new TranslationEngine(config, fundingRateService);

    const signalsPath = path.resolve(__dirname, '../replay-bot/signals', signalsFile);
    if (!fs.existsSync(signalsPath)) {
        console.error(`Signals file not found: ${signalsPath}`);
        process.exit(1);
    }

    const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    console.log(`[ExchangeAwareTranslator] Loaded ${signals.length} signals.`);

    let processedOrders = 0;
    let processedTransactions = 0;

    for (const signal of signals) {
        const translations = await engine.translate(signal);
        if (!translations) continue;

        for (const item of translations) {
            try {
                if (item.type === 'ORDER') {
                    // Convert to core schema with exchange info
                    const coreOrder = {
                        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        exchange: item.exchange,
                        symbol: item.data.symbol,
                        side: item.data.side,
                        type: 'MARKET', // Default to market order
                        quantity: item.data.quantity,
                        price: item.data.price || 0,
                        status: 'FILLED',
                        clientOrderId: item.data.clientOrderId || `client_${Date.now()}`,
                        timestamp: Date.now(),
                        createdAt: Date.now()
                    };

                    console.log(`[ExchangeAwareTranslator] Posting Order to ${item.exchange}: ${item.data.symbol} ${item.data.side} ${item.data.quantity}`);
                    await axios.post(`${MOCK_SERVER_URL}/core/order`, coreOrder);
                    processedOrders++;

                } else if (item.type === 'INCOME') {
                    // Convert to core transaction with exchange info
                    const coreTransaction = {
                        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        exchange: item.exchange,
                        type: item.data.incomeType,
                        symbol: item.data.symbol,
                        asset: item.data.asset || 'USDT',
                        amount: parseFloat(item.data.income),
                        timestamp: Date.now(),
                        info: item.data.info || `${item.data.incomeType} for ${item.data.symbol}`,
                        createdAt: Date.now()
                    };

                    console.log(`[ExchangeAwareTranslator] Posting Transaction: ${item.exchange} ${item.data.incomeType} ${item.data.amount}`);
                    await axios.post(`${MOCK_SERVER_URL}/core/transaction`, coreTransaction);
                    processedTransactions++;
                }
            } catch (e) {
                console.error(`[ExchangeAwareTranslator] Error posting to mock-server: ${e.message}`);
                // Continue despite errors
            }
        }
    }

    console.log(`[ExchangeAwareTranslator] Translation completed. Orders: ${processedOrders}, Transactions: ${processedTransactions}`);
    
    // Show statistics
    try {
        const statsResponse = await axios.get(`${MOCK_SERVER_URL}/core/statistics`);
        console.log(`[ExchangeAwareTranslator] Current statistics:`, statsResponse.data);
    } catch (e) {
        console.warn(`[ExchangeAwareTranslator] Could not fetch statistics: ${e.message}`);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('[ExchangeAwareTranslator] Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { main };