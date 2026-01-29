const ExchangeAwareAdapterFactory = require('../adapters/exchange-aware-factory');
const db = require('../database-exchange-aware');

/**
 * Exchange-aware API routes for mock server
 * Provides exchange-specific endpoints that filter data by exchange
 */
async function exchangeAwareRoutes(fastify, options) {
    
    // ========== Core Schema Operations ==========
    
    /**
     * POST /core/position
     * Create or update a core position
     */
    fastify.post('/core/position', async (request, reply) => {
        try {
            const position = {
                ...request.body,
                id: request.body.id || `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                updatedAt: Date.now()
            };
            
            db.upsertCorePosition(position);
            
            return {
                success: true,
                data: position,
                message: 'Position created/updated successfully'
            };
        } catch (error) {
            fastify.log.error(`[Core Position Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /core/positions
     * Get core positions with optional filtering
     */
    fastify.get('/core/positions', async (request, reply) => {
        try {
            const filters = {
                exchange: request.query.exchange,
                symbol: request.query.symbol,
                side: request.query.side,
                limit: request.query.limit ? parseInt(request.query.limit) : undefined
            };
            
            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });
            
            const positions = db.getCorePositions(filters);
            
            return {
                success: true,
                data: positions,
                count: positions.length
            };
        } catch (error) {
            fastify.log.error(`[Core Positions Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /core/order
     * Create a core order
     */
    fastify.post('/core/order', async (request, reply) => {
        try {
            const order = {
                ...request.body,
                id: request.body.id || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: Date.now()
            };
            
            db.insertCoreOrder(order);

            // Auto-create trade and trading fee transaction when price is known
            const effectivePrice = order.price || db.getExchangePrice(order.exchange, order.symbol) || 0;
            if (effectivePrice > 0 && order.status === 'FILLED') {
                const trade = {
                    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    orderId: order.id,
                    exchange: order.exchange,
                    symbol: order.symbol,
                    side: order.side,
                    price: effectivePrice,
                    quantity: order.quantity,
                    fee: parseFloat((effectivePrice * order.quantity * 0.0004).toFixed(8)),
                    feeAsset: 'USDT',
                    realizedPnl: 0,
                    timestamp: Date.now(),
                    createdAt: Date.now()
                };
                db.insertCoreTrade(trade);

                const feeTx = {
                    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    exchange: order.exchange,
                    type: 'TRADING_FEE',
                    symbol: order.symbol,
                    asset: 'USDT',
                    amount: trade.fee,
                    timestamp: Date.now(),
                    info: `Trading fee for ${order.symbol} ${order.side} ${order.quantity}`,
                    createdAt: Date.now()
                };
                db.insertCoreTransaction(feeTx);
            }

            return {
                success: true,
                data: order,
                message: 'Order created successfully'
            };
        } catch (error) {
            fastify.log.error(`[Core Order Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /core/price
     * Upsert exchange price for a symbol
     */
    fastify.post('/core/price', async (request, reply) => {
        try {
            const { exchange, symbol, price } = request.body || {};
            if (!exchange || !symbol || typeof price === 'undefined') {
                return reply.code(400).send({ success: false, error: 'Missing exchange/symbol/price' });
            }
            db.upsertExchangePrice(exchange, symbol, parseFloat(price));
            return { success: true };
        } catch (error) {
            fastify.log.error(`[Core Price Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /core/orders
     * Get core orders with optional filtering
     */
    fastify.get('/core/orders', async (request, reply) => {
        try {
            const filters = {
                exchange: request.query.exchange,
                symbol: request.query.symbol,
                side: request.query.side,
                status: request.query.status,
                limit: request.query.limit ? parseInt(request.query.limit) : undefined
            };
            
            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });
            
            const orders = db.getCoreOrders(filters);
            
            return {
                success: true,
                data: orders,
                count: orders.length
            };
        } catch (error) {
            fastify.log.error(`[Core Orders Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /core/trade
     * Create a core trade
     */
    fastify.post('/core/trade', async (request, reply) => {
        try {
            const trade = {
                ...request.body,
                id: request.body.id || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: Date.now()
            };
            
            db.insertCoreTrade(trade);
            
            return {
                success: true,
                data: trade,
                message: 'Trade created successfully'
            };
        } catch (error) {
            fastify.log.error(`[Core Trade Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /core/trades
     * Get core trades with optional filtering
     */
    fastify.get('/core/trades', async (request, reply) => {
        try {
            const filters = {
                exchange: request.query.exchange,
                symbol: request.query.symbol,
                side: request.query.side,
                orderId: request.query.orderId,
                limit: request.query.limit ? parseInt(request.query.limit) : undefined
            };
            
            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });
            
            const trades = db.getCoreTrades(filters);
            
            return {
                success: true,
                data: trades,
                count: trades.length
            };
        } catch (error) {
            fastify.log.error(`[Core Trades Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /core/transaction
     * Create a core transaction
     */
    fastify.post('/core/transaction', async (request, reply) => {
        try {
            const transaction = {
                ...request.body,
                id: request.body.id || `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: Date.now()
            };
            
            db.insertCoreTransaction(transaction);
            
            return {
                success: true,
                data: transaction,
                message: 'Transaction created successfully'
            };
        } catch (error) {
            fastify.log.error(`[Core Transaction Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /core/transactions
     * Get core transactions with optional filtering
     */
    fastify.get('/core/transactions', async (request, reply) => {
        try {
            const filters = {
                exchange: request.query.exchange,
                type: request.query.type,
                symbol: request.query.symbol,
                startTime: request.query.startTime ? parseInt(request.query.startTime) : undefined,
                endTime: request.query.endTime ? parseInt(request.query.endTime) : undefined,
                limit: request.query.limit ? parseInt(request.query.limit) : undefined
            };
            
            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });
            
            const transactions = db.getCoreTransactions(filters);
            
            return {
                success: true,
                data: transactions,
                count: transactions.length
            };
        } catch (error) {
            fastify.log.error(`[Core Transactions Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========== Exchange-Specific API Endpoints ==========

    /**
     * GET /fapi/v2/positionRisk
     * Binance compatible position endpoint with exchange filtering
     */
    fastify.get('/fapi/v2/positionRisk', async (request, reply) => {
        try {
            const result = options.parameterFilter.validateParameters('binance', '/fapi/v2/positionRisk', request.query || {});
            if (!result.valid) {
                return reply.code(400).send({ success: false, errors: result.errors });
            }

            const filters = {
                exchange: 'binance',
                symbol: result.filtered.symbol,
                limit: result.filtered.limit
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });

            const corePositions = db.getCorePositions(filters);
            const factory = new ExchangeAwareAdapterFactory();
            const binancePositions = corePositions.map(pos => factory.toExchangePosition(pos, 'binance'));

            return binancePositions; // Return array directly for Binance compatibility
        } catch (error) {
            fastify.log.error(`[Binance PositionRisk Error] ${error.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: error.message,
                success: false
            });
        }
    });

    /**
     * GET /fapi/v1/userTrades
     * Binance compatible trades endpoint with exchange filtering
     */
    fastify.get('/fapi/v1/userTrades', async (request, reply) => {
        try {
            const result = options.parameterFilter.validateParameters('binance', '/fapi/v1/userTrades', request.query || {});
            if (!result.valid) {
                return reply.code(400).send({ success: false, errors: result.errors });
            }

            const filters = {
                exchange: 'binance',
                symbol: result.filtered.symbol,
                limit: result.filtered.limit
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });

            const coreTrades = db.getCoreTrades(filters);
            const factory = new ExchangeAwareAdapterFactory();
            const binanceTrades = coreTrades.map(trade => factory.toExchangeTrade(trade, 'binance'));

            return binanceTrades; // Return array directly for Binance compatibility
        } catch (error) {
            fastify.log.error(`[Binance UserTrades Error] ${error.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: error.message,
                success: false
            });
        }
    });

    /**
     * GET /fapi/v1/income
     * Binance compatible income endpoint with exchange filtering
     */
    fastify.get('/fapi/v1/income', async (request, reply) => {
        try {
            const result = options.parameterFilter.validateParameters('binance', '/fapi/v1/income', request.query || {});
            if (!result.valid) {
                return reply.code(400).send({ success: false, errors: result.errors });
            }

            const filters = {
                exchange: 'binance',
                type: result.filtered.incomeType,
                symbol: result.filtered.symbol,
                startTime: result.filtered.startTime,
                endTime: result.filtered.endTime,
                limit: result.filtered.limit
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) delete filters[key];
            });

            const coreTransactions = db.getCoreTransactions(filters);
            const factory = new ExchangeAwareAdapterFactory();
            const binanceIncome = coreTransactions.map(tx => factory.toExchangeTransaction(tx, 'binance'));

            return binanceIncome; // Return array directly for Binance compatibility
        } catch (error) {
            fastify.log.error(`[Binance Income Error] ${error.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: error.message,
                success: false
            });
        }
    });

    /**
     * GET /fapi/v2/balance
     * Binance compatible balance endpoint
     */
    fastify.get('/fapi/v2/balance', async (request, reply) => {
        try {
            const corePositions = db.getCorePositions({ exchange: 'binance' });
            const adapter = new ExchangeAwareAdapterFactory().getAdapter('binance');
            
            return adapter.getBalance(corePositions);
        } catch (error) {
            fastify.log.error(`[Binance Balance Error] ${error.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: error.message,
                success: false
            });
        }
    });

    // ========== OKX API Endpoints ==========

    /**
     * GET /api/v5/account/balance
     * OKX compatible balance endpoint
     */
    fastify.get('/api/v5/account/balance', async (request, reply) => {
        try {
            const corePositions = db.getCorePositions({ exchange: 'okx' });
            const adapter = new ExchangeAwareAdapterFactory().getAdapter('okx');
            
            return adapter.getBalance(corePositions);
        } catch (error) {
            fastify.log.error(`[OKX Balance Error] ${error.message}`);
            return reply.code(500).send({
                code: '500',
                msg: error.message,
                data: null
            });
        }
    });

    /**
     * GET /api/v5/account/positions
     * OKX compatible positions endpoint
     */
    fastify.get('/api/v5/account/positions', async (request, reply) => {
        try {
            const filters = {
                exchange: 'okx'
            };

            if (request.query.instType) {
                // Filter by instrument type if provided
                // This would require additional logic based on OKX's instType values
            }

            const corePositions = db.getCorePositions(filters);
            const adapter = new ExchangeAwareAdapterFactory().getAdapter('okx');
            
            const okxPositions = corePositions.map(pos => adapter.formatPosition(pos));

            return {
                code: '0',
                msg: '',
                data: okxPositions
            };
        } catch (error) {
            fastify.log.error(`[OKX Positions Error] ${error.message}`);
            return reply.code(500).send({
                code: '500',
                msg: error.message,
                data: null
            });
        }
    });

    /**
     * GET /api/v5/trade/fills
     * OKX compatible trades endpoint
     */
    fastify.get('/api/v5/trade/fills', async (request, reply) => {
        try {
            const filters = {
                exchange: 'okx',
                limit: request.query.limit ? parseInt(request.query.limit) : 100
            };

            if (request.query.instId) {
                filters.symbol = request.query.instId;
            }

            const coreTrades = db.getCoreTrades(filters);
            const adapter = new ExchangeAwareAdapterFactory().getAdapter('okx');
            
            const okxTrades = coreTrades.map(trade => adapter.formatTrade(trade));

            return {
                code: '0',
                msg: '',
                data: okxTrades
            };
        } catch (error) {
            fastify.log.error(`[OKX Trades Error] ${error.message}`);
            return reply.code(500).send({
                code: '500',
                msg: error.message,
                data: null
            });
        }
    });

    /**
     * GET /api/v5/account/bills
     * OKX compatible bills/transactions endpoint
     */
    fastify.get('/api/v5/account/bills', async (request, reply) => {
        try {
            const filters = {
                exchange: 'okx',
                limit: request.query.limit ? parseInt(request.query.limit) : 100
            };

            if (request.query.type) {
                // Map OKX bill types to core transaction types
                const typeMapping = {
                    'funding_fee': 'FUNDING_FEE',
                    'fee': 'TRADING_FEE',
                    'realized_pnl': 'REALIZED_PNL'
                };
                filters.type = typeMapping[request.query.type] || request.query.type;
            }

            const coreTransactions = db.getCoreTransactions(filters);
            const adapter = new ExchangeAwareAdapterFactory().getAdapter('okx');
            
            const okxBills = coreTransactions.map(tx => adapter.formatTransaction(tx));

            return {
                code: '0',
                msg: '',
                data: okxBills
            };
        } catch (error) {
            fastify.log.error(`[OKX Bills Error] ${error.message}`);
            return reply.code(500).send({
                code: '500',
                msg: error.message,
                data: null
            });
        }
    });

    // ========== Statistics and Health ==========

    /**
     * GET /core/statistics
     * Get exchange-aware statistics
     */
    fastify.get('/core/statistics', async (request, reply) => {
        try {
            const stats = db.getStatistics();
            
            return {
                success: true,
                data: stats,
                timestamp: Date.now()
            };
        } catch (error) {
            fastify.log.error(`[Core Statistics Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /core/migrate
     * Migrate from legacy schema to exchange-aware schema
     */
    fastify.post('/core/migrate', async (request, reply) => {
        try {
            db.migrateFromLegacySchema();
            
            return {
                success: true,
                message: 'Migration completed successfully'
            };
        } catch (error) {
            fastify.log.error(`[Core Migration Error] ${error.message}`);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = exchangeAwareRoutes;
