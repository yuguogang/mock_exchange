const fastify = require('fastify')({ logger: false });
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'replay-bot', 'mock_data');

// Enable CORS
fastify.register(require('@fastify/cors'), {
    origin: '*'
});

// Load mock data
function loadJSON(filename) {
    const p = path.join(DATA_DIR, filename);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Binance endpoints
fastify.get('/fapi/v2/positionRisk', async (request, reply) => {
    console.log('[Mock] GET /fapi/v2/positionRisk');
    const positions = loadJSON('binance_position.json') || [];
    return positions;
});

fastify.get('/fapi/v1/userTrades', async (request, reply) => {
    console.log('[Mock] GET /fapi/v1/userTrades');
    const trades = loadJSON('binance_trades.json') || [];
    // Return last 50 trades
    return trades.slice(-50);
});

fastify.get('/fapi/v1/openOrders', async (request, reply) => {
    console.log('[Mock] GET /fapi/v1/openOrders');
    return []; // No open orders for now
});

fastify.get('/fapi/v1/income', async (request, reply) => {
    console.log('[Mock] GET /fapi/v1/income');
    // Generate mock funding fee records
    const position = loadJSON('binance_position.json');
    if (!position || position.length === 0) return [];

    const fundingRecords = [];
    const now = Date.now();
    // Simulate 3 funding payments (every 8 hours)
    for (let i = 0; i < 3; i++) {
        fundingRecords.push({
            symbol: 'TRXUSDT',
            incomeType: 'FUNDING_FEE',
            income: (Math.random() * 0.5 - 0.25).toFixed(4), // Random fee
            asset: 'USDT',
            time: now - (i * 8 * 3600 * 1000),
            tranId: String(1000000 + i),
            tradeId: ''
        });
    }
    return fundingRecords;
});

// OKX endpoints
fastify.get('/api/v5/account/positions', async (request, reply) => {
    console.log('[Mock] GET /api/v5/account/positions');
    const data = loadJSON('okx_position.json');
    return data || { code: '0', msg: '', data: [] };
});

fastify.get('/api/v5/trade/fills', async (request, reply) => {
    console.log('[Mock] GET /api/v5/trade/fills');
    const trades = loadJSON('okx_trades.json') || [];
    return {
        code: '0',
        msg: '',
        data: trades.slice(-50)
    };
});

// Health check
fastify.get('/health', async (request, reply) => {
    return { status: 'ok', dataDir: DATA_DIR };
});

// Start server
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log('🚀 Mock Server running on http://localhost:3000');
        console.log('📁 Data directory:', DATA_DIR);
        console.log('\nAvailable endpoints:');
        console.log('  Binance:');
        console.log('    GET /fapi/v2/positionRisk');
        console.log('    GET /fapi/v1/userTrades');
        console.log('    GET /fapi/v1/openOrders');
        console.log('    GET /fapi/v1/income');
        console.log('  OKX:');
        console.log('    GET /api/v5/account/positions');
        console.log('    GET /api/v5/trade/fills');
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
