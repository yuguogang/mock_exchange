const assert = require('assert');
const TranslationEngine = require('../translation-engine');

// Mock FundingRateService
const mockFundingService = {
    getRate: async () => 0.0001
};

// Mock config
const mockConfig = {
    hedge: {
        legs: [
            { role: 'legA', exchange: 'binance', symbol: 'TRXUSDT', contract_profile: { contract_size: 1 } },
            { role: 'legB', exchange: 'okx', symbol: 'TRX-USDT-SWAP', contract_profile: { contract_size: 1000 } }
        ]
    },
    strategy: {
        params: {
            funding: {
                position_size_usdt: 1000,
                approx_price: 0.1
            }
        }
    },
    funding: {
        binance: [{ startTime: 0, intervalHours: 8 }],
        okx: [{ startTime: 0, intervalHours: 8 }]
    }
};

const engine = new TranslationEngine(mockConfig, mockFundingService);

async function runTests() {
    // Test 1: OPEN signal
    const openSignal = {
        strategy: 'HEDGE',
        type: 'OPEN',
        action: 'SELL_BINANCE_BUY_OKX',
        legA_price: 0.1,
        legB_price: 0.1,
        sessionId: 'test_session_1',
        timestamp: 1000000
    };

    const openResult = await engine.translate(openSignal);
    assert.strictEqual(openResult.length, 2);
    assert.strictEqual(openResult[0].exchange, 'binance');
    assert.strictEqual(openResult[0].data.side, 'SELL');
    assert.strictEqual(openResult[0].data.quantity, 10000);
    assert.strictEqual(openResult[1].exchange, 'okx');
    assert.strictEqual(openResult[1].data.side, 'BUY');
    assert.strictEqual(openResult[1].data.quantity, 10);

    // Test 2: CLOSE signal with auto-settlement
    const closeSignal = {
        strategy: 'HEDGE',
        type: 'CLOSE',
        action: 'BUY_BINANCE_SELL_OKX',
        legA_price: 0.1,
        legB_price: 0.1,
        sessionId: 'test_session_1',
        timestamp: 1000000 + (8 * 60 * 60 * 1000) + 1000 // Just after 8h mark
    };

    const closeResult = await engine.translate(closeSignal);
    // Should have: 2 settlements (BN/OKX) + 2 closing orders = 4 items
    assert.strictEqual(closeResult.length, 4);
    assert.strictEqual(closeResult.filter(r => r.type === 'INCOME').length, 2);

    console.log('✅ Advanced unit tests passed!');
}

runTests().catch(err => {
    console.error('❌ Tests failed:', err);
    process.exit(1);
});

console.log('✅ Unit tests passed!');
