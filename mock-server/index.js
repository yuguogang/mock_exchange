const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs');
const path = require('path');

// Register CORS
// Register CORS
fastify.register(cors, { origin: '*' });

// ========== Adapters ==========
const AdapterFactory = require('./adapters');
const BinanceAdapter = AdapterFactory.getAdapter('binance');


// ========== State Storage ==========
const db = require('./database');

// Current market prices (cached in memory for speed)
const currentPrices = new Map();

// Positions storage (cached in memory for speed)
const positions = new Map();

// Initialize data from database
function initializeFromDB() {
    // Load prices
    const dbPrices = db.getPrices();
    dbPrices.forEach(p => currentPrices.set(p.symbol, p.price));

    // Load positions
    const dbPositions = db.getPositions();
    dbPositions.forEach(p => {
        positions.set(p.symbol, {
            entryPrice: p.entry_price,
            size: p.size,
            margin: p.margin,
            side: p.side,
            updatedAt: p.updated_at // Store timestamp from DB
        });
    });

    console.log(`[DB] Initialized: ${currentPrices.size} prices, ${positions.size} positions loaded.`);
}

initializeFromDB();

// Orders storage
// let orderIdCounter = 1000000; (id managed by DB)
const getOrderIdCounter = () => {
    const allOrders = db.getOrders();
    return allOrders.length > 0 ? Math.max(...allOrders.map(o => o.id)) + 1 : 1000000;
};
let orderIdCounter = getOrderIdCounter();

// Trades storage
// let tradeIdCounter = 2000000; (id managed by DB)
const getTradeIdCounter = () => {
    const allTrades = db.getTrades();
    return allTrades.length > 0 ? Math.max(...allTrades.map(t => t.id)) + 1 : 2000000;
};
let tradeIdCounter = getTradeIdCounter();

// Custom Income storage (in-memory for now)
const customIncomes = [];

// ========== Helper Functions ==========

/**
 * Calculate unrealized PnL for a position
 */
function calculatePnL(position, currentPrice) {
    if (!position || !currentPrice) return { unRealizedProfit: 0, roe: 0 };

    const { entryPrice, size, margin, side } = position;
    const sideMultiplier = side === 'LONG' ? 1 : -1;

    const unRealizedProfit = (currentPrice - entryPrice) * size * sideMultiplier;
    const roe = margin > 0 ? (unRealizedProfit / margin) * 100 : 0;

    return { unRealizedProfit, roe };
}

// ========== API Endpoints ==========

/**
 * POST /mock/price
 * Update current market price
 */
fastify.post('/mock/price', async (request, reply) => {
    const { symbol, price } = request.body;

    if (!symbol || !price) {
        return reply.code(400).send({ error: 'Missing symbol or price' });
    }

    const priceVal = parseFloat(price);
    currentPrices.set(symbol, priceVal);
    db.upsertPrice(symbol, priceVal);

    fastify.log.info(`Price updated: ${symbol} = ${price}`);

    return {
        success: true,
        symbol,
        price: priceVal,
        timestamp: Date.now()
    };
});

/**
 * GET /mock/price/:symbol
 * Get current price for a symbol
 */
fastify.get('/mock/price/:symbol', async (request, reply) => {
    const { symbol } = request.params;
    const price = currentPrices.get(symbol);

    if (!price) {
        return reply.code(404).send({ error: 'Price not found' });
    }

    return { symbol, price };
});

/**
 * POST /mock/position
 * Create or update a position manually
 */
fastify.post('/mock/position', async (request, reply) => {
    const { symbol, size, margin, entryPrice, side } = request.body;

    if (!symbol || typeof size === 'undefined' || typeof margin === 'undefined' || typeof entryPrice === 'undefined' || !side) {
        return reply.code(400).send({ error: 'Missing required fields' });
    }

    if (Math.abs(parseFloat(size)) < 0.0001) {
        // Size 0 implies deleting the position
        positions.delete(symbol);
        db.deletePosition(symbol);
        return { success: true, message: `Position for ${symbol} deleted/cleared` };
    }

    const pos = {
        symbol: symbol, // Ensure symbol is stored in the value object
        entryPrice: parseFloat(entryPrice),
        size: parseFloat(size),
        margin: parseFloat(margin),
        side: side,
        updatedAt: Date.now()
    };

    // Use provided id as key to allow multiple positions for same symbol (if needed for testing)
    // or default to symbol for standard behavior
    const key = request.body.id || symbol;
    positions.set(key, pos);
    db.upsertPosition(symbol, pos.entryPrice, pos.size, pos.margin, pos.side);

    return { success: true, symbol, id: key };
});

/**
 * GET /mock/positions
 * Get all positions with real-time PnL
 */
fastify.get('/mock/positions', async (request, reply) => {
    const result = [];

    for (const [symbol, position] of positions.entries()) {
        const currentPrice = currentPrices.get(symbol);
        const { unRealizedProfit, roe } = calculatePnL(position, currentPrice);

        result.push({
            symbol,
            ...position,
            currentPrice: currentPrice || 0,
            unRealizedProfit: unRealizedProfit.toFixed(4),
            roe: roe.toFixed(2) + '%'
        });
    }

    return result;
});

/**
 * POST /mock/order
 * Place an order (market order, immediate fill)
 */
fastify.post('/mock/order', async (request, reply) => {
    const { symbol, side, quantity, clientOrderId, status } = request.body;

    if (!symbol || !side || !quantity) {
        return reply.code(400).send({ error: 'Missing required fields' });
    }

    const currentPrice = currentPrices.get(symbol);
    if (!currentPrice) {
        return reply.code(400).send({ error: 'No price available for symbol' });
    }

    const orderId = orderIdCounter++;
    const qty = parseFloat(quantity);
    const price = currentPrice;
    const orderStatus = status || 'FILLED';

    // Create order
    const order = {
        id: orderId,
        symbol,
        side: side.toUpperCase(),
        quantity: qty,
        price,
        status: orderStatus,
        clientOrderId: clientOrderId || `order_${orderId}`,
        timestamp: Date.now()
    };
    // orders.push(order);
    db.insertOrder(order);

    let tradeId = null;

    if (orderStatus === 'FILLED') {
        tradeId = tradeIdCounter++;
        // Create trade (immediate fill)
        const trade = {
            id: tradeId,
            orderId,
            symbol,
            side: side.toUpperCase(),
            price,
            qty,
            commission: (price * qty * 0.0004).toFixed(4), // 0.04% fee
            commissionAsset: 'USDT',
            timestamp: Date.now()
        };
        // trades.push(trade);
        db.insertTrade(trade);

        // Update position
        const existingPosition = positions.get(symbol);
        if (existingPosition) {
            // Update existing position
            const sideMultiplier = side.toUpperCase() === 'BUY' ? 1 : -1;
            const newSize = existingPosition.size + (qty * sideMultiplier);

            if (Math.abs(newSize) < 0.0001) {
                // Position closed
                positions.delete(symbol);
                db.deletePosition(symbol);
            } else {
                // Recalculate margin (simplified: full value / leverage)
                // Assuming 10x leverage for all positions
                const leverage = 10;

                // Wait, calculate weighted average entry price?
                // For now, let's keep entry price same (simplified) or update if it's a position increase?
                // Simplified: update size and side, recalculate margin based on NEW size and OLD entry price (if increasing)
                // Ideally we need weighted average price logic for proper PnL, but for now fixed margin is priority.

                existingPosition.size = newSize;
                existingPosition.side = newSize > 0 ? 'LONG' : 'SHORT';

                // Fix: Margin should be Size * EntryPrice / Leverage
                existingPosition.margin = (Math.abs(newSize) * existingPosition.entryPrice) / 10;
                existingPosition.updatedAt = Date.now();

                db.upsertPosition(symbol, existingPosition.entryPrice, existingPosition.size, existingPosition.margin, existingPosition.side);
            }
        } else {
            // Create new position
            const sideMultiplier = side.toUpperCase() === 'BUY' ? 1 : -1;
            const pos = {
                entryPrice: price,
                size: qty * sideMultiplier,
                margin: (price * qty) / 10, // Assume 10x leverage
                side: side.toUpperCase() === 'BUY' ? 'LONG' : 'SHORT',
                updatedAt: Date.now()
            };
            positions.set(symbol, pos);
            db.upsertPosition(symbol, pos.entryPrice, pos.size, pos.margin, pos.side);
        }

        fastify.log.info(`Order filled: ${symbol} ${side} ${qty} @ ${price}`);
    } else {
        fastify.log.info(`Order placed (not filled): ${symbol} ${side} ${qty} @ ${price}`);
    }

    return {
        success: true,
        orderId,
        tradeId,
        symbol,
        side,
        quantity: qty,
        price
    };
});

/**
 * POST /capture
 * Persist captured network data from the extension into samples/binance/*
 * Body: { category, url, request, response, timestamp }
 */
fastify.post('/capture', async (request, reply) => {
    try {
        const { category, url, request: reqData, response: respData, timestamp } = request.body || {};
        if (!category || !url || typeof respData === 'undefined') {
            return reply.code(400).send({ success: false, error: 'Missing required fields: category, url, response' });
        }

        const baseDir = path.join(__dirname, '..', '..', 'samples', 'binance');
        const filenameMap = {
            positions: 'captures_positions.json',
            openOrders: 'captures_openOrders.json',
            orderHistory: 'captures_orderHistory.json',
            trades: 'captures_userTrades.json',
            income: 'captures_income.json',
            balance: 'captures_balance.json',
            account: 'captures_account.json',
            assets: 'captures_assets.json'
        };
        const filename = filenameMap[category] || `captures_${category}.json`;
        const filePath = path.join(baseDir, filename);

        const entry = {
            url,
            request: reqData || null,
            response: respData,
            timestamp: timestamp || Date.now()
        };

        let data = [];
        if (fs.existsSync(filePath)) {
            try {
                const raw = fs.readFileSync(filePath, 'utf8');
                data = JSON.parse(raw);
                if (!Array.isArray(data)) data = [];
            } catch (_) {
                data = [];
            }
        }
        data.push(entry);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

        fastify.log.info(`[Capture] Saved ${category} -> ${filename} (${url})`);
        return { success: true, file: filename, count: data.length };
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ success: false, error: err.message });
    }
});

/**
 * GET /mock/orders
 * Get all orders
 */
fastify.get('/mock/orders', async (request, reply) => {
    return db.getOrders();
});

// Dual API Route: Core
fastify.get('/core/positionRisk', async (request, reply) => {
    return db.getPositions();
});

// Dual API Route: Binance
fastify.get('/fapi/v2/positionRisk/binance', async (request, reply) => {
    const adapter = AdapterFactory.getAdapter('binance');
    // Use in-memory positions directly to support multiple positions per symbol (via different IDs)
    // db.getPositions() flattens by symbol due to DB schema, so we skip it for this specific flexibility requirement
    return adapter.getPositionRisk(positions, currentPrices);
});

// Dual API Route: OKX (Placeholder for now)
fastify.get('/fapi/v2/positionRisk/okx', async (request, reply) => {
    // const adapter = AdapterFactory.getAdapter('okx');
    // return adapter.getPositionRisk(...);
    return { msg: "OKX adapter not fully implemented yet, but route exists." };
});

/**
 * GET /mock/trades
 * Get all trades
 */
fastify.get('/mock/trades', async (request, reply) => {
    return db.getTrades();
});

/**
 * GET /health
 * Health check
 */
fastify.get('/health', async (request, reply) => {
    const ordersTotal = db.getOrders().length;
    const tradesTotal = db.getTrades().length;
    return {
        status: 'ok',
        pricesCount: currentPrices.size,
        positionsCount: positions.size,
        ordersCount: ordersTotal,
        tradesCount: tradesTotal
    };
});

// ========== Exchange API Adapters ==========

/**
 * GET /fapi/v1/openOrders
 * Binance compatible open orders endpoint
 */
fastify.get('/fapi/v1/openOrders', async (request, reply) => {
    const adapter = AdapterFactory.getAdapter('binance');
    if (adapter) {
        // Fetch all orders from DB
        const allOrders = db.getOrders();
        // Filter for open orders (NEW or PARTIALLY_FILLED)
        // Also filter by symbol if provided
        const symbol = request.query.symbol;
        
        const openOrders = allOrders.filter(o => {
            const isSymbolMatch = symbol ? o.symbol === symbol : true;
            const isOpen = o.status === 'NEW' || o.status === 'PARTIALLY_FILLED';
            return isSymbolMatch && isOpen;
        });

        return adapter.getOpenOrders(openOrders);
    }
    return []; // Default empty
});

/**
 * GET /fapi/v1/allOrders
 * Binance compatible all orders endpoint
 */
fastify.get('/fapi/v1/allOrders', async (request, reply) => {
    const adapter = AdapterFactory.getAdapter('binance');
    if (adapter) {
        // Fetch all orders from DB
        const allOrders = db.getOrders();
        // Filter by symbol if query param exists (Binance API usually requires symbol)
        const symbol = request.query.symbol;
        const filteredOrders = symbol ? allOrders.filter(o => o.symbol === symbol) : allOrders;
        return adapter.getAllOrders(filteredOrders);
    }
    return []; // Default empty
});

/**
 * GET /fapi/v2/positionRisk
 * Binance compatible position endpoint
 */
fastify.get('/fapi/v2/positionRisk', async (request, reply) => {
    return BinanceAdapter.getPositionRisk(positions, currentPrices);
});

/**
 * GET /fapi/v1/userTrades
 * Binance compatible trades endpoint
 */
fastify.get('/fapi/v1/userTrades', async (request, reply) => {
    const trades = db.getTrades();
    const sorted = trades.sort((a, b) => b.timestamp - a.timestamp);
    return BinanceAdapter.getUserTrades(sorted.slice(0, 50));
});

/**
 * GET /fapi/v2/balance
 * Binance compatible balance endpoint
 */
fastify.get('/fapi/v2/balance', async (request, reply) => {
    return BinanceAdapter.getBalance(positions, currentPrices);
});


fastify.get('/fapi/v1/income', async (request, reply) => {
    // Basic income history mock based on trades
    const trades = db.getTrades();
    // In a real scenario, we'd map trades to income types (commission, pnl, etc)
    // For now, let's just return commission entries for each trade
    
    const income = [];

    // Add Commission from trades
    trades.forEach(t => {
        income.push({
            symbol: t.symbol,
            incomeType: "COMMISSION",
            income: "-" + t.commission,
            asset: t.commissionAsset,
            time: t.timestamp,
            info: "Commission for trade",
            tranId: t.id * 10, // Mock tranId
            tradeId: t.id
        });
    });

    // Add Custom Incomes (Funding Fees etc)
    customIncomes.forEach(inc => {
        income.push(inc);
    });

    // Sort by time desc
    const sorted = income.sort((a, b) => b.time - a.time);

    // Limit to 50 items to prevent message passing timeout
    return sorted.slice(0, 50);
});

/**
 * POST /mock/income
 * Inject a custom income record (e.g., FUNDING_FEE)
 */
fastify.post('/mock/income', async (request, reply) => {
    const { symbol, incomeType, income, asset, time, info, tradeId } = request.body;
    
    if (!symbol || !incomeType || !income) {
        return reply.code(400).send({ error: 'Missing required fields' });
    }

    const newIncome = {
        symbol,
        incomeType,
        income,
        asset: asset || 'USDT',
        time: time || Date.now(),
        info: info || '',
        tranId: Date.now(), // Simple mock ID
        tradeId: tradeId || ''
    };

    customIncomes.push(newIncome);
    return { success: true, income: newIncome };
});

// ========== Server Start ==========
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
        console.log('🚀 Mock Server running on http://localhost:3000');
        console.log('\nAvailable endpoints:');
        console.log('  POST /mock/price          - Update market price');
        console.log('  GET  /mock/price/:symbol  - Get current price');
        console.log('  POST /mock/position       - Create/update position');
        console.log('  GET  /mock/positions      - Get all positions with PnL');
        console.log('  POST /mock/order          - Place an order');
        console.log('  GET  /mock/orders         - Get all orders');
        console.log('  GET  /mock/trades         - Get all trades');
        console.log('  POST /mock/income         - Inject custom income');
        console.log('  GET  /fapi/v1/income      - Get income history');
        console.log('  GET  /health              - Health check');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
