
const axios = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function verifyAdapter() {
    console.log('=== Verifying Binance Adapter ===\n');

    try {
        // 1. Verify Position Risk
        console.log('1. Checking GET /fapi/v2/positionRisk...');
        const posRes = await axios.get(`${BASE_URL}/fapi/v2/positionRisk`);
        const positions = posRes.data;
        console.log(`   Response status: ${posRes.status}`);
        console.log(`   Positions count: ${positions.length}`);

        if (positions.length > 0) {
            const pos = positions[0];
            console.log(`   Sample Position: ${pos.symbol} ${pos.positionSide}Amt=${pos.positionAmt} UnPnl=${pos.unRealizedProfit}`);
            assert.ok(pos.symbol, 'Symbol missing');
            assert.ok(pos.positionAmt, 'PositionAmt missing');
            assert.ok(pos.unRealizedProfit, 'UnRealizedProfit missing');
            assert.ok(pos.entryPrice, 'EntryPrice missing');
        } else {
            console.log('   ⚠️ No positions found to verify structure fully');
        }
        console.log('   ✓ Format looks correct (Array)\n');

        // 2. Verify User Trades
        console.log('2. Checking GET /fapi/v1/userTrades...');
        const tradeRes = await axios.get(`${BASE_URL}/fapi/v1/userTrades`);
        const trades = tradeRes.data;
        console.log(`   Response status: ${tradeRes.status}`);
        console.log(`   Trades count: ${trades.length}`);

        if (trades.length > 0) {
            const trade = trades[0];
            console.log(`   Sample Trade: ${trade.symbol} ${trade.side} P=${trade.price} Q=${trade.qty}`);
            assert.ok(trade.symbol, 'Symbol missing');
            assert.ok(trade.orderId, 'OrderId missing');
            assert.ok(trade.commission, 'Commission missing');
        }
        console.log('   ✓ Format looks correct (Array)\n');

        // 3. Verify Balance
        console.log('3. Checking GET /fapi/v2/balance...');
        const balRes = await axios.get(`${BASE_URL}/fapi/v2/balance`);
        const balance = balRes.data;
        console.log(`   Response status: ${balRes.status}`);

        assert.ok(balance.assets, 'Assets array missing');
        assert.ok(balance.totalWalletBalance, 'TotalWalletBalance missing');

        const usdt = balance.assets.find(a => a.asset === 'USDT');
        if (usdt) {
            console.log(`   USDT Wallet Balance: ${usdt.walletBalance}`);
            console.log(`   USDT Unrealized PnL: ${usdt.unRealizedProfit}`);
            console.log(`   USDT Margin Balance: ${usdt.marginBalance}`);
            console.log(`   USDT Available:      ${usdt.availableBalance}`);

            assert.strictEqual(parseFloat(usdt.walletBalance), 10000.00, 'Initial wallet balance should be 10000');
        } else {
            console.error('   ❌ USDT asset not found');
            process.exit(1);
        }
        console.log('   ✓ Balance structure correct\n');

        // 4. Verify Timestamp Consistency
        console.log('4. Checking Timestamp Consistency...');
        const posRes1 = await axios.get(`${BASE_URL}/fapi/v2/positionRisk`);
        const ts1 = posRes1.data[0].updateTime;

        await new Promise(r => setTimeout(r, 1000)); // Wait 1s

        const posRes2 = await axios.get(`${BASE_URL}/fapi/v2/positionRisk`);
        const ts2 = posRes2.data[0].updateTime;

        console.log(`   Timestamp 1: ${ts1}`);
        console.log(`   Timestamp 2: ${ts2}`);

        assert.strictEqual(ts1, ts2, 'Timestamp should be consistent (persisted), not dynamic');
        console.log('   ✓ Timestamps are consistent (persisted)\n');

        console.log('✅ Adapter verification passed!');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        if (error.response) {
            console.error('   Response data:', error.response.data);
        }
        process.exit(1);
    }
}

verifyAdapter();
