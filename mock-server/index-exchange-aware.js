const fastify = require('fastify')({ logger: true });
const path = require('path');

// Import exchange-aware components
const ExchangeAwareAdapterFactory = require('./adapters/exchange-aware-factory');
const db = require('./database-exchange-aware');
const exchangeAwareRoutes = require('./routes/exchange-aware');
const ParameterFilter = require('./middleware/parameter-filter');

// Initialize parameter filter
const parameterFilter = new ParameterFilter();

// Create Fastify instance
const app = fastify;

// Register exchange-aware routes
app.register(exchangeAwareRoutes, { parameterFilter });

// ========== Legacy Compatibility Routes ==========
// Legacy Binance endpoints are implemented in routes/exchange-aware.js

/**
 * Health check endpoint
 */
app.get('/health', async (request, reply) => {
    try {
        const stats = db.getStatistics();
        return {
            status: 'healthy',
            timestamp: Date.now(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            exchanges: stats
        };
    } catch (error) {
        app.log.error(`Health check failed: ${error.message}`);
        return reply.code(500).send({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * Statistics endpoint
 */
app.get('/statistics', async (request, reply) => {
    try {
        const stats = db.getStatistics();
        return {
            success: true,
            data: stats,
            timestamp: Date.now()
        };
    } catch (error) {
        app.log.error(`Statistics error: ${error.message}`);
        return reply.code(500).send({
            success: false,
            error: error.message
        });
    }
});

/**
 * Database migration endpoint
 */
app.post('/migrate', async (request, reply) => {
    try {
        db.migrateFromLegacySchema();
        return {
            success: true,
            message: 'Database migration completed successfully'
        };
    } catch (error) {
        app.log.error(`Migration error: ${error.message}`);
        return reply.code(500).send({
            success: false,
            error: error.message
        });
    }
});

// Start server
const start = async () => {
    try {
        const port = parseInt(process.env.PORT || '3000', 10);
        await app.listen({ port, host: '0.0.0.0' });
        
        console.log(`🚀 Exchange-Aware Mock Server running on http://localhost:${port}`);
        console.log('\n📊 Available endpoints:');
        console.log('  Core Schema Endpoints:');
        console.log('    POST /core/position        - Create core position');
        console.log('    GET  /core/positions       - Get core positions');
        console.log('    POST /core/order           - Create core order');
        console.log('    GET  /core/orders          - Get core orders');
        console.log('    POST /core/trade           - Create core trade');
        console.log('    GET  /core/trades          - Get core trades');
        console.log('    POST /core/transaction     - Create core transaction');
        console.log('    GET  /core/transactions    - Get core transactions');
        console.log('    GET  /core/statistics      - Get exchange statistics');
        console.log('    POST /migrate              - Migrate from legacy schema');
        console.log('');
        console.log('  Exchange-Specific Endpoints:');
        console.log('    Binance:');
        console.log('      GET /fapi/v2/positionRisk  - Binance positions');
        console.log('      GET /fapi/v1/userTrades    - Binance trades');
        console.log('      GET /fapi/v1/income        - Binance income');
        console.log('      GET /fapi/v2/balance       - Binance balance');
        console.log('    OKX:');
        console.log('      GET /api/v5/account/balance     - OKX balance');
        console.log('      GET /api/v5/account/positions   - OKX positions');
        console.log('      GET /api/v5/trade/fills         - OKX trades');
        console.log('      GET /api/v5/account/bills       - OKX bills');
        console.log('');
        console.log('  Utility Endpoints:');
        console.log('    GET /health                - Health check');
        console.log('    GET /statistics            - System statistics');
        
        // Auto-migrate if legacy data exists
        setTimeout(() => {
            try {
                const legacyCheck = app.inject({
                    method: 'POST',
                    url: '/migrate'
                });
                console.log('🔧 Auto-migration check completed');
            } catch (e) {
                console.log('ℹ️  No legacy data to migrate');
            }
        }, 2000);
        
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    await app.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    await app.close();
    process.exit(0);
});

start();

module.exports = app;
