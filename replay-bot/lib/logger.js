/**
 * 统一日志模块
 * 提供结构化 JSON 日志和分级控制
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'];

function formatLog(level, message, meta = {}) {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta
    });
}

const logger = {
    debug: (msg, meta) => {
        if (currentLevel <= LEVELS.debug) console.log(formatLog('debug', msg, meta));
    },
    info: (msg, meta) => {
        if (currentLevel <= LEVELS.info) console.log(formatLog('info', msg, meta));
    },
    warn: (msg, meta) => {
        if (currentLevel <= LEVELS.warn) console.warn(formatLog('warn', msg, meta));
    },
    error: (msg, meta) => {
        if (currentLevel <= LEVELS.error) console.error(formatLog('error', msg, meta));
    }
};

module.exports = logger;
