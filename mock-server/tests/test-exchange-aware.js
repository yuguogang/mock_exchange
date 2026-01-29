const axios = require('axios');

const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || 'http://localhost:3000';

async function testExchangeAwareness() {
    console.log('🧪 Testing Exchange-Aware Mock Server...\n');

    try {
        // Test 1: Create core positions for different exchanges
        console.log('1️⃣ Creating core positions for Binance and OKX...');
        
        // Binance position
        await axios.post(`${MOCK_SERVER_URL}/core/position`, {
            id: 'test_binance_trx_long',
            exchange: 'binance',
            symbol: 'TRXUSDT',
            side: 'LONG',
            quantity: 1000,
            entryPrice: 0.15,
            markPrice: 0.16,
            unrealizedPnl: 10,
            margin: 150,
            leverage: 10,
            timestamp: Date.now()
        });

        // OKX position
        await axios.post(`${MOCK_SERVER_URL}/core/position`, {
            id: 'test_okx_trx_short',
            exchange: 'okx',
            symbol: 'TRX-USDT-SWAP',
            side: 'SHORT',
            quantity: -500,
            entryPrice: 0.14,
            markPrice: 0.13,
            unrealizedPnl: 5,
            margin: 70,
            leverage: 10,
            timestamp: Date.now()
        });

        console.log('✅ Core positions created\n');

        // Test 2: Verify exchange filtering in core endpoints
        console.log('2️⃣ Testing core endpoint exchange filtering...');
        
        const binancePositions = await axios.get(`${MOCK_SERVER_URL}/core/positions?exchange=binance`);
        const okxPositions = await axios.get(`${MOCK_SERVER_URL}/core/positions?exchange=okx`);
        const allPositions = await axios.get(`${MOCK_SERVER_URL}/core/positions`);

        console.log(`   Binance positions: ${binancePositions.data.count}`);
        console.log(`   OKX positions: ${okxPositions.data.count}`);
        console.log(`   All positions: ${allPositions.data.count}`);

        if (binancePositions.data.count === 1 && okxPositions.data.count === 1) {
            console.log('✅ Exchange filtering works correctly\n');
        } else {
            throw new Error('Exchange filtering failed');
        }

        // Test 3: Create orders and trades for different exchanges
        console.log('3️⃣ Creating orders and trades...');
        
        // Binance order and trade
        const binanceOrder = await axios.post(`${MOCK_SERVER_URL}/core/order`, {
            id: 'test_binance_order_1',
            exchange: 'binance',
            symbol: 'TRXUSDT',
            side: 'BUY',
            quantity: 1000,
            price: 0.15,
            status: 'FILLED',
            timestamp: Date.now()
        });

        await axios.post(`${MOCK_SERVER_URL}/core/trade`, {
            id: 'test_binance_trade_1',
            orderId: 'test_binance_order_1',
            exchange: 'binance',
            symbol: 'TRXUSDT',
            side: 'BUY',
            price: 0.15,
            quantity: 1000,
            fee: 0.6,
            feeAsset: 'USDT',
            timestamp: Date.now()
        });

        // OKX order and trade
        const okxOrder = await axios.post(`${MOCK_SERVER_URL}/core/order`, {
            id: 'test_okx_order_1',
            exchange: 'okx',
            symbol: 'TRX-USDT-SWAP',
            side: 'SELL',
            quantity: 500,
            price: 0.14,
            status: 'FILLED',
            timestamp: Date.now()
        });

        await axios.post(`${MOCK_SERVER_URL}/core/trade`, {
            id: 'test_okx_trade_1',
            orderId: 'test_okx_order_1',
            exchange: 'okx',
            symbol: 'TRX-USDT-SWAP',
            side: 'SELL',
            price: 0.14,
            quantity: 500,
            fee: 0.28,
            feeAsset: 'USDT',
            timestamp: Date.now()
        });

        console.log('✅ Orders and trades created\n');

        // Test 4: Create transactions for different exchanges
        console.log('4️⃣ Creating transactions...');
        
        // Binance funding fee
        await axios.post(`${MOCK_SERVER_URL}/core/transaction`, {
            id: 'test_binance_funding_1',
            exchange: 'binance',
            type: 'FUNDING_FEE',
            symbol: 'TRXUSDT',
            asset: 'USDT',
            amount: 10,
            timestamp: Date.now(),
            info: 'Funding fee for TRXUSDT'
        });

        // OKX trading fee
        await axios.post(`${MOCK_SERVER_URL}/core/transaction`, {
            id: 'test_okx_fee_1',
            exchange: 'okx',
            type: 'TRADING_FEE',
            symbol: 'TRX-USDT-SWAP',
            asset: 'USDT',
            amount: -0.28,
            timestamp: Date.now(),
            info: 'Trading fee for TRX-USDT-SWAP'
        });

        console.log('✅ Transactions created\n');

        // Test 5: Verify Binance API returns only Binance data
        console.log('5️⃣ Testing Binance API exchange filtering...');
        
        const binancePositionsAPI = await axios.get(`${MOCK_SERVER_URL}/fapi/v2/positionRisk`, {
            params: { symbol: 'TRXUSDT', timestamp: Date.now() }
        });
        
        const binanceTradesAPI = await axios.get(`${MOCK_SERVER_URL}/fapi/v1/userTrades`, {
            params: { symbol: 'TRXUSDT', limit: 10 }
        });
        
        const binanceIncomeAPI = await axios.get(`${MOCK_SERVER_URL}/fapi/v1/income`, {
            params: { symbol: 'TRXUSDT', incomeType: 'FUNDING_FEE' }
        });

        console.log(`   Binance positions API: ${binancePositionsAPI.data.length}`);
        console.log(`   Binance trades API: ${binanceTradesAPI.data.length}`);
        console.log(`   Binance income API: ${binanceIncomeAPI.data.length}`);

        if (binancePositionsAPI.data.length === 1 && 
            binanceTradesAPI.data.length === 1 && 
            binanceIncomeAPI.data.length === 1) {
            console.log('✅ Binance API returns only Binance data\n');
        } else {
            throw new Error('Binance API filtering failed');
        }

        // Test 6: Verify OKX API returns only OKX data
        console.log('6️⃣ Testing OKX API exchange filtering...');
        
        const okxPositionsAPI = await axios.get(`${MOCK_SERVER_URL}/api/v5/account/positions`);
        
        const okxTradesAPI = await axios.get(`${MOCK_SERVER_URL}/api/v5/trade/fills`, {
            params: { limit: 10 }
        });
        
        const okxBillsAPI = await axios.get(`${MOCK_SERVER_URL}/api/v5/account/bills`, {
            params: { type: 'fee', limit: 10 }
        });

        console.log(`   OKX positions API: ${okxPositionsAPI.data.data.length}`);
        console.log(`   OKX trades API: ${okxTradesAPI.data.data.length}`);
        console.log(`   OKX bills API: ${okxBillsAPI.data.data.length}`);

        if (okxPositionsAPI.data.data.length === 1 && 
            okxTradesAPI.data.data.length === 1 && 
            okxBillsAPI.data.data.length === 1) {
            console.log('✅ OKX API returns only OKX data\n');
        } else {
            throw new Error('OKX API filtering failed');
        }

        // Test 7: Verify data isolation
        console.log('7️⃣ Testing data isolation...');
        
        // Check that Binance data doesn't contain OKX symbols
        const binanceData = binancePositionsAPI.data[0];
        const okxData = okxPositionsAPI.data.data[0];
        
        console.log(`   Binance symbol: ${binanceData.symbol}`);
        console.log(`   OKX symbol: ${okxData.instId}`);
        
        if (binanceData.symbol === 'TRXUSDT' && okxData.instId === 'TRX-USDT') {
            console.log('✅ Data correctly isolated by exchange\n');
        } else {
            throw new Error('Data isolation failed');
        }

        // Test 8: Statistics endpoint
        console.log('8️⃣ Testing statistics endpoint...');
        
        const stats = await axios.get(`${MOCK_SERVER_URL}/core/statistics`);
        console.log('   Exchange statistics:', JSON.stringify(stats.data, null, 2));
        
        if (stats.data.success && stats.data.data.binance && stats.data.data.okx) {
            console.log('✅ Statistics endpoint working correctly\n');
        } else {
            throw new Error('Statistics endpoint failed');
        }

        console.log('🎉 All exchange-aware tests passed!');
        console.log('\n📊 Summary:');
        console.log('- ✅ Core schema supports exchange field');
        console.log('- ✅ Exchange filtering works in core endpoints');
        console.log('- ✅ Binance API returns only Binance data');
        console.log('- ✅ OKX API returns only OKX data');
        console.log('- ✅ Data isolation is maintained');
        console.log('- ✅ Statistics show exchange distribution');
        
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testExchangeAwareness().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = { testExchangeAwareness };