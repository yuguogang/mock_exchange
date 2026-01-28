const fs = require('fs');
const path = require('path');

/**
 * 校验交易历史样本数据结构
 * @param {any} data 
 * @throws {Error} 如果结构不合法
 */
function validateTransactionHistory(json) {
    if (!json || typeof json !== 'object') {
        throw new Error('Invalid JSON: Root must be an object');
    }

    const requiredFields = ['code', 'success', 'total', 'data'];
    for (const field of requiredFields) {
        if (json[field] === undefined) {
            throw new Error(`Invalid JSON: Missing required field "${field}"`);
        }
    }

    if (!Array.isArray(json.data)) {
        throw new Error('Invalid JSON: "data" field must be an array');
    }

    if (typeof json.total !== 'number') {
        throw new Error('Invalid JSON: "total" field must be a number');
    }

    if (typeof json.success !== 'boolean') {
        throw new Error('Invalid JSON: "success" field must be a boolean');
    }
}

// 缓存加载的数据
let cachedSample = null;

/**
 * 加载交易历史样本数据
 * @returns {{code: string, success: boolean, total: number, data: Array<any>}}
 */
function loadTransactionHistorySample() {
    if (cachedSample) {
        return cachedSample;
    }

    // 针对当前结构：/service/binance-mock/lib/sampleLoader.js
    // 目标路径：/samples/binance/transaction-history.json
    const samplePath = path.join(__dirname, '../../../samples/binance/transaction-history.json');

    try {
        const rawData = fs.readFileSync(samplePath, 'utf8');
        const json = JSON.parse(rawData);

        validateTransactionHistory(json);

        cachedSample = json;
        return cachedSample;
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Sample file not found at: ${samplePath}`);
        }
        throw new Error(`Failed to load transaction history sample: ${err.message}`);
    }
}

module.exports = {
    loadTransactionHistorySample
};
