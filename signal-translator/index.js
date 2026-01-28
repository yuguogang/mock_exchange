const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ConfigLoader = require('./config-loader');
const TranslationEngine = require('./translation-engine');
const FundingRateService = require('./funding-rate-service');

const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || 'http://localhost:3000';

async function main() {
    const args = process.argv.slice(2);
    const hedgeName = args[0] || 'demo_hedge_trx_binance_okx';
    const strategyName = args[1] || 'demo_strategy_funding_trx';
    const signalsFile = args[2] || 'indexed_history_TRX.json';

    console.log(`[SignalTranslator] Starting translation for ${hedgeName}...`);

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
    console.log(`[SignalTranslator] Loaded ${signals.length} signals.`);

    for (const signal of signals) {
        const translations = await engine.translate(signal);
        if (!translations) continue;

        for (const item of translations) {
            try {
                if (item.type === 'ORDER') {
                    console.log(`[SignalTranslator] Posting Order to ${item.exchange}: ${item.data.symbol} ${item.data.side} ${item.data.quantity}`);
                    await axios.post(`${MOCK_SERVER_URL}/mock/order`, item.data);
                } else if (item.type === 'INCOME') {
                    console.log(`[SignalTranslator] Posting Income: ${item.data.symbol} ${item.data.incomeType} ${item.data.income}`);
                    await axios.post(`${MOCK_SERVER_URL}/mock/income`, item.data);
                }
            } catch (e) {
                console.error(`Error posting to mock-server: ${e.message}`);
                // Continue despite errors
            }
        }
    }

    console.log(`[SignalTranslator] Translation completed.`);
}

if (require.main === module) {
    main();
}
