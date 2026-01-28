async function healthRouter(fastify, opts) {
    fastify.get('/health', async (request, reply) => {
        return { status: 'OK', timestamp: new Date().toISOString() };
    });
}

module.exports = healthRouter;
