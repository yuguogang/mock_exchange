const build = require('./app');

const start = async () => {
    const app = await build({
        logger: {
            level: 'info'
        }
    });

    try {
        await app.listen({ port: 3001, host: '0.0.0.0' });
        console.log('Server is running at http://localhost:3001');
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
