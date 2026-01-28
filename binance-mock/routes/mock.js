const { loadTransactionHistorySample } = require('../lib/sampleLoader');
const { generateTransactionHistory } = require('../lib/mockGenerator');

async function mockRouter(fastify, opts) {
    // 模拟 Binance 交易历史接口 (供 Requestly 调用)
    fastify.get('/sim/binance/transaction-history', async (request, reply) => {
        try {
            const sample = loadTransactionHistorySample();

            // 解析查询参数，设置默认值与校验
            const count = parseInt(request.query.count) || 10;
            const symbol = request.query.symbol || null;
            const interval = parseInt(request.query.interval) || 3600000; // 默认 1 小时
            const deltaScale = parseFloat(request.query.deltaScale) || 1.0;

            if (isNaN(count) || count <= 0) {
                return reply.code(400).send({ error: 'Invalid count: must be a positive integer' });
            }

            // 控制台打印请求参数信息
            console.log(`[Mock Request] /sim/binance/transaction-history - count: ${count}, symbol: ${symbol}, interval: ${interval}, deltaScale: ${deltaScale}`);

            const result = generateTransactionHistory({
                sample,
                count,
                symbol,
                intervalMs: interval,
                deltaScale
            });

            return result;
        } catch (err) {
            console.error(`[Mock Error] ${err.message}`);
            return reply.code(500).send({ error: err.message });
        }
    });

    // 保留旧路由或重定向 (可选，当前按需求重点实现新路由)
    fastify.get('/api/v1/transaction-history', async (request, reply) => {
        return reply.redirect('/sim/binance/transaction-history');
    });
}

module.exports = mockRouter;
