/**
 * 环境配置加载器
 * 从 .env 文件加载配置，支持默认值回退
 */
const fs = require('fs');
const path = require('path');

// 简易 .env 加载器（无外部依赖）
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...val] = trimmed.split('=');
                if (key) {
                    process.env[key.trim()] = val.join('=').trim();
                }
            }
        });
    }
}

loadEnv();

module.exports = {
    mockServer: {
        host: process.env.MOCK_SERVER_HOST || 'localhost',
        port: parseInt(process.env.MOCK_SERVER_PORT || '3000', 10)
    },
    runner: {
        intervalMs: parseInt(process.env.RUNNER_INTERVAL_MS || '60000', 10),
        maxRetries: parseInt(process.env.RUNNER_MAX_RETRIES || '3', 10),
        retryDelayMs: parseInt(process.env.RUNNER_RETRY_DELAY_MS || '5000', 10)
    },
    log: {
        level: process.env.LOG_LEVEL || 'info'
    }
};
