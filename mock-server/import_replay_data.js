#!/usr/bin/env node

/**
 * Import replay-bot generated data into Mock Server
 * 
 * This script loads the simulated trades and positions from
 * replay-bot/mock_data and imports them into the running Mock Server
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const DATA_DIR = path.join(__dirname, '..', 'replay-bot', 'mock_data');

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

function loadJSON(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        throw new Error(`File not found: ${filepath}`);
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

async function importData() {
    console.log('=== Importing Replay Data to Mock Server ===\n');

    try {
        // Load data
        console.log('Loading data files...');
        const binanceTrades = loadJSON('binance_trades.json');
        const binancePosition = loadJSON('binance_position.json');
        console.log(`✓ Loaded ${binanceTrades.length} Binance trades`);
        console.log(`✓ Loaded ${binancePosition.length} Binance position(s)\n`);

        // Set initial price (use first trade price)
        if (binanceTrades.length > 0) {
            const firstTrade = binanceTrades[0];
            console.log(`Setting initial price: ${firstTrade.symbol} = ${firstTrade.price}...`);
            await request('POST', '/mock/price', {
                symbol: firstTrade.symbol,
                price: String(firstTrade.price)
            });
            console.log('✓ Price set\n');
        }

        // Import trades as orders
        console.log(`Importing ${binanceTrades.length} trades...`);
        let imported = 0;
        for (const trade of binanceTrades) {
            try {
                await request('POST', '/mock/order', {
                    symbol: trade.symbol,
                    side: trade.side,
                    quantity: String(trade.qty),
                    clientOrderId: trade.orderId
                });
                imported++;

                if (imported % 50 === 0) {
                    console.log(`  Imported ${imported}/${binanceTrades.length}...`);
                }
            } catch (error) {
                console.error(`  Error importing trade ${trade.id}:`, error.message);
            }
        }
        console.log(`✓ Imported ${imported} trades\n`);

        // Update final price (use last trade price)
        if (binanceTrades.length > 0) {
            const lastTrade = binanceTrades[binanceTrades.length - 1];
            console.log(`Updating final price: ${lastTrade.symbol} = ${lastTrade.price}...`);
            await request('POST', '/mock/price', {
                symbol: lastTrade.symbol,
                price: String(lastTrade.price)
            });
            console.log('✓ Price updated\n');
        }

        // Verify import
        console.log('Verifying import...');
        const orders = await request('GET', '/mock/orders');
        const trades = await request('GET', '/mock/trades');
        const positions = await request('GET', '/mock/positions');

        console.log(`✓ Orders in server: ${orders.length}`);
        console.log(`✓ Trades in server: ${trades.length}`);
        console.log(`✓ Positions in server: ${positions.length}\n`);

        if (positions.length > 0) {
            console.log('--- Current Position ---');
            const pos = positions[0];
            console.log(`Symbol: ${pos.symbol}`);
            console.log(`Side: ${pos.side}`);
            console.log(`Size: ${pos.size}`);
            console.log(`Entry Price: ${pos.entryPrice}`);
            console.log(`Current Price: ${pos.currentPrice}`);
            console.log(`Unrealized PnL: ${pos.unRealizedProfit} USDT`);
            console.log(`ROE: ${pos.roe}`);
        }

        console.log('\n✅ Import completed successfully!');
        console.log('\nMock Server is ready. You can now:');
        console.log('1. Update Chrome extension to use Mock Server');
        console.log('2. Visit Binance Futures page');
        console.log('3. See the simulated trades and positions');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\nMake sure:');
        console.error('1. Mock Server is running: cd service/mock-server && node index.js');
        console.error('2. Replay data exists: node service/replay-bot/strategy.js');
        process.exit(1);
    }
}

importData();
