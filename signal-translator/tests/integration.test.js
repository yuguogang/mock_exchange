const axios = require('axios');
const ConfigLoader = require('../config-loader');
const TranslationEngine = require('../translation-engine');
const FundingRateService = require('../funding-rate-service');
const assert = require('assert');

const MOCK_SERVER_URL = 'http://localhost:3000';

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyIntegration() {
    console.log('🚀 Starting Module Integration Test...');

    // 1. Initial health check of Mock Server
    try {
        await axios.get(`${MOCK_SERVER_URL}/health`);
    } catch (e) {
        console.error('❌ Mock Server is not running! Please start it with `node index.js` in code/mock_plugin/service/mock-server');
        process.exit(1);
    }

    // 2. Setup Components
    const loader = new ConfigLoader();
    const fundingService = new FundingRateService();
    const config = loader.loadFullConfig('demo_hedge_trx_binance_okx', 'demo_strategy_funding_trx');
    const engine = new TranslationEngine(config, fundingService);

    const sessionId = `INTEGRATION_TEST_${Date.now()}`;
    const symbolBN = 'TRXUSDT';
    const symbolOK = 'TRX-USDT-SWAP';

    // 3. Set initial prices and CLEAR existing positions in Mock Server
    console.log('Setting prices and clearing positions in Mock Server...');
    await axios.post(`${MOCK_SERVER_URL}/mock/price`, { symbol: symbolBN, price: 0.3 });
    await axios.post(`${MOCK_SERVER_URL}/mock/price`, { symbol: symbolOK, price: 0.301 });

    // Clear any existing positions for these symbols to ensure clean test
    await axios.post(`${MOCK_SERVER_URL}/mock/position`, { symbol: symbolBN, size: 0, margin: 0, entryPrice: 0, side: 'LONG' });
    await axios.post(`${MOCK_SERVER_URL}/mock/position`, { symbol: symbolOK, size: 0, margin: 0, entryPrice: 0, side: 'LONG' });

    // 4. Translate and Post OPEN signal
    console.log('Testing OPEN signal...');
    const openSignal = {
        strategy: 'HEDGE',
        type: 'OPEN',
        sessionId: sessionId,
        action: 'SELL_BINANCE_BUY_OKX',
        legA_price: 0.3,
        legB_price: 0.301,
        timestamp: Date.now() - (10 * 60 * 60 * 1000) // 10 hours ago
    };

    const openResults = await engine.translate(openSignal);
    for (const item of openResults) {
        if (item.type === 'ORDER') {
            console.log(`Posting OPEN order: ${item.exchange} ${item.data.symbol} ${item.data.side} qty=${item.data.quantity}`);
        }
        await axios.post(`${MOCK_SERVER_URL}${item.type === 'ORDER' ? '/mock/order' : '/mock/income'}`, item.data);
    }

    // Verify positions in Mock Server
    const positions = (await axios.get(`${MOCK_SERVER_URL}/mock/positions`)).data;
    const posBN = positions.find(p => p.symbol === symbolBN);
    const posOK = positions.find(p => p.symbol === symbolOK);

    assert(posBN, 'Binance position should exist');
    assert(posOK, 'OKX position should exist');
    console.log('✅ OPEN signal verified: Positions created successfully.');

    // 5. Testing CLOSE signal (should trigger auto-settlement for 10h duration)
    console.log('Testing CLOSE signal and Auto-Settlement...');
    const closeSignal = {
        strategy: 'HEDGE',
        type: 'CLOSE',
        sessionId: sessionId,
        action: 'BUY_BINANCE_SELL_OKX',
        legA_price: 0.305,
        legB_price: 0.306,
        timestamp: Date.now()
    };

    const closeResults = await engine.translate(closeSignal);

    // Verify auto-settlement generated (10 hours > 8 hour cycle)
    const incomeItems = closeResults.filter(r => r.type === 'INCOME');
    assert(incomeItems.length >= 2, 'Should generate at least 2 settlement records (one for each leg)');

    for (const item of closeResults) {
        if (item.type === 'ORDER') {
            console.log(`Posting CLOSE order: ${item.exchange} ${item.data.symbol} ${item.data.side} qty=${item.data.quantity}`);
        }
        await axios.post(`${MOCK_SERVER_URL}${item.type === 'ORDER' ? '/mock/order' : '/mock/income'}`, item.data);
    }

    // Verify positions closed
    const postClosePositions = (await axios.get(`${MOCK_SERVER_URL}/mock/positions`)).data;
    const closedBN = postClosePositions.find(p => p.symbol === symbolBN);
    const closedOK = postClosePositions.find(p => p.symbol === symbolOK);

    assert(!closedBN, 'Binance position should be closed');
    assert(!closedOK, 'OKX position should be closed');
    console.log('✅ CLOSE signal verified: Positions closed successfully.');

    // Verify Income records
    const incomeHistory = (await axios.get(`${MOCK_SERVER_URL}/fapi/v1/income`)).data;
    const fundingRecords = incomeHistory.filter(i => i.incomeType === 'FUNDING_FEE' && i.info.includes(sessionId));
    assert(fundingRecords.length > 0, 'Funding fee records should exist in mock history');
    console.log(`✅ Auto-Settlement verified: ${fundingRecords.length} funding records found.`);

    console.log('🎉 Module Integration Test PASSED!');
}

verifyIntegration().catch(err => {
    console.error('❌ Integration Test FAILED:', err.response ? err.response.data : err.message);
    process.exit(1);
});
