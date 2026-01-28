#!/usr/bin/env node

/**
 * Verification script for Order System (Task 02)
 * 
 * Test Steps:
 * 1. Set price
 * 2. Place an order
 * 3. Check orders and trades
 * 4. Verify position updated
 */

const BASE_URL = 'http://localhost:3000';

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
    console.log('=== Order System Verification ===\n');

    try {
        // Step 1: Set price
        console.log('Step 1: Setting price to 0.30...');
        await request('POST', '/mock/price', {
            symbol: 'TRXUSDT',
            price: '0.30'
        });
        console.log('✓ Price set\n');

        // Step 2: Place order
        console.log('Step 2: Placing BUY order (100 TRX)...');
        const orderResp = await request('POST', '/mock/order', {
            symbol: 'TRXUSDT',
            side: 'BUY',
            quantity: '100',
            clientOrderId: 'test_order_001'
        });
        console.log('✓ Order placed:', orderResp);
        console.log('');

        // Step 3: Check orders
        console.log('Step 3: Checking orders...');
        const orders = await request('GET', '/mock/orders');
        console.log(`✓ Found ${orders.length} order(s)`);
        console.log('');

        // Step 4: Check trades
        console.log('Step 4: Checking trades...');
        const trades = await request('GET', '/mock/trades');
        console.log(`✓ Found ${trades.length} trade(s)`);
        console.log('');

        // Step 5: Check positions
        console.log('Step 5: Checking positions...');
        const positions = await request('GET', '/mock/positions');
        console.log(`✓ Found ${positions.length} position(s)`);
        console.log('');

        // Validation
        console.log('--- Verification Result ---');

        if (orders.length === 0) {
            console.error('❌ FAILED: No orders found');
            process.exit(1);
        }

        if (trades.length === 0) {
            console.error('❌ FAILED: No trades found');
            process.exit(1);
        }

        if (positions.length === 0) {
            console.error('❌ FAILED: No positions found');
            process.exit(1);
        }

        const order = orders[0];
        const trade = trades[0];
        const position = positions[0];

        console.log('Order:', JSON.stringify(order, null, 2));
        console.log('\nTrade:', JSON.stringify(trade, null, 2));
        console.log('\nPosition:', JSON.stringify(position, null, 2));

        // Verify order
        if (order.status !== 'FILLED') {
            console.error('\n❌ FAILED: Order should be FILLED');
            process.exit(1);
        }

        // Verify position size
        if (Math.abs(position.size - 100) > 0.01) {
            console.error('\n❌ FAILED: Position size should be 100');
            process.exit(1);
        }

        console.log('\n✅ ALL TESTS PASSED!');
        console.log('✓ Order created and filled');
        console.log('✓ Trade recorded');
        console.log('✓ Position updated');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nMake sure Mock Server is running:');
        console.error('  cd service/mock-server && node index.js');
        process.exit(1);
    }
}

runTest();
