const fastify = require('fastify');
const routes = require('./routes/health');

async function build(opts = {}) {
    const app = fastify(opts);
    const { loadTransactionHistorySample } = require('./lib/sampleLoader');

    // 启动时加载样本并校验
    try {
        loadTransactionHistorySample();
        console.log('Successfully loaded transaction history sample');
    } catch (err) {
        console.error(`Failed to load sample on startup: ${err.message}`);
    }

    // Register routes
    app.register(routes);
    app.register(require('./routes/mock'));

    return app;
}

module.exports = build;
