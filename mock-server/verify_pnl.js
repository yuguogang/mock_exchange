#!/usr/bin/env node

/**
 * Verification script for PnL Engine (Task 01)
 * 
 * Test Steps:
 * 1. Send Price 0.10
 * 2. Open Long at 0.10
 * 3. Send Price 0.11
 * 4. Verify GET /mock/positions returns positive PnL
 */

const BASE_URL = 'http://localhost:3000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(method, path, body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    return response.json();
}

async function runTest() {
    console.log('=== PnL Engine Verification ===\n');

    try {
        // Step 1: Send Price 0.10
        console.log('Step 1: Setting initial price to 0.10...');
        const priceResp1 = await request('POST', '/mock/price', {
            symbol: 'TRXUSDT',
            price: '0.10'
        });
        console.log('✓ Price set:', priceResp1);
        console.log('');

        // Step 2: Open Long at 0.10
        console.log('Step 2: Opening LONG position (100 TRX @ 0.10)...');
        const posResp = await request('POST', '/mock/position', {
            symbol: 'TRXUSDT',
            entryPrice: '0.10',
            size: '100',
            margin: '1.0',  // 10x leverage
            side: 'LONG'
        });
        console.log('✓ Position created:', posResp);
        console.log('');

        // Step 3: Send Price 0.11
        console.log('Step 3: Updating price to 0.11...');
        const priceResp2 = await request('POST', '/mock/price', {
            symbol: 'TRXUSDT',
            price: '0.11'
        });
        console.log('✓ Price updated:', priceResp2);
        console.log('');

        // Step 4: Verify PnL
        console.log('Step 4: Checking positions with PnL...');
        const positions = await request('GET', '/mock/positions');
        console.log('✓ Positions:', JSON.stringify(positions, null, 2));
        console.log('');

        // Validation
        if (positions.length === 0) {
            console.error('❌ FAILED: No positions found');
            process.exit(1);
        }

        const position = positions[0];
        const pnl = parseFloat(position.unRealizedProfit);

        console.log('--- Verification Result ---');
        console.log(`Entry Price: ${position.entryPrice}`);
        console.log(`Current Price: ${position.currentPrice}`);
        console.log(`Unrealized PnL: ${position.unRealizedProfit} USDT`);
        console.log(`ROE: ${position.roe}`);

        if (pnl > 0) {
            console.log('\n✅ TEST PASSED: PnL is positive!');
            console.log(`Expected: (0.11 - 0.10) * 100 = 1.0 USDT`);
            console.log(`Actual: ${position.unRealizedProfit} USDT`);
        } else {
            console.error('\n❌ TEST FAILED: PnL should be positive');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nMake sure Mock Server is running:');
        console.error('  cd service/mock-server && node index.js');
        process.exit(1);
    }
}

runTest();
