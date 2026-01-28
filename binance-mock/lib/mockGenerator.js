/**
 * 生成 Binance 交易历史模拟数据
 * 
 * @param {Object} params
 * @param {Object} params.sample 原始样本
 * @param {number} params.count 生成条数
 * @param {string} [params.symbol] 交易对，默认使用样本中的第一个
 * @param {number} [params.intervalMs=3600000] 时间间隔，默认 1 小时
 * @param {number} [params.deltaScale=1.0] 数值缩放比例
 * @param {number} [params.negativeRatio=0.5] 负值概率 (0-1)
 * @param {number} [params.seed] 随机种子（暂未实现复杂伪随机，使用 Math.random）
 * 
 * @returns {Object} 100% 兼容 Binance 结构的 JSON
 */
function generateTransactionHistory({
    sample,
    count,
    symbol,
    intervalMs = 3600000,
    deltaScale = 1.0,
    negativeRatio = 0.5,
}) {
    // 基础校验
    if (!sample || !Array.isArray(sample.data) || sample.data.length === 0) {
        throw new Error('Invalid sample data provided');
    }

    const template = sample.data[0];
    const targetSymbol = symbol || template.symbol;
    const currentTime = Date.now();

    // 起始 tranId，基于当前时间戳生成一个较大的初始值
    let currentTranId = BigInt(currentTime) * 1000n + BigInt(Math.floor(Math.random() * 1000));

    const mockData = [];

    for (let i = 0; i < count; i++) {
        const time = currentTime - (i * intervalMs);
        const tranId = currentTranId--;

        // 基于样本值进行随机浮动
        let baseDelta = Math.abs(template.balanceDelta) || 0.0001;
        let randomFactor = 0.5 + Math.random(); // 0.5 ~ 1.5 之间浮动
        let delta = baseDelta * randomFactor * deltaScale;

        // 确定正负号
        if (Math.random() < negativeRatio) {
            delta = -delta;
        }

        // 格式化为 8 位小数点的字符串，符合 Binance 风格
        const deltaStr = delta.toFixed(8);
        const finalDelta = parseFloat(deltaStr);

        mockData.push({
            ...template, // 保持其他字段（如 asset, balancetype 等）与样本一致
            id: `${tranId}_${template.balancetype}`,
            tranId: Number(tranId), // tranId 在 JSON 中通常表现为数字或长整型
            symbol: targetSymbol,
            time: time,
            balanceDelta: finalDelta,
            balanceDeltaStr: deltaStr,
            balanceInfo: template.balanceInfo,
        });
    }

    return {
        code: sample.code || "000000",
        message: sample.message || null,
        messageDetail: sample.messageDetail || null,
        data: mockData,
        total: count,
        success: true
    };
}

module.exports = {
    generateTransactionHistory
};
