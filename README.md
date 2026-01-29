# 多交易所信号翻译器集成任务拆解

## 🎯 项目目标
构建支持多交易所的内核schema系统，实现binance adaptor，提供拦截API，支持参数过滤和自我验证。

## 🔍 现状分析

### 当前架构
```
/Users/ygg/vs/ai/code/mock_plugin/service/
├── signal-translator/          # 信号翻译器（已完成）
├── mock-server/                  # 通用mock服务器
├── binance-mock/                # 币安专用mock
└── replay-bot/                  # 重放机器人
```

### 核心需求
1. **内核Schema**：交易所无关的统一数据结构
2. **Binance Adaptor**：币安特异性数据格式转换
3. **拦截API**：模拟币安真实API接口
4. **参数过滤**：支持币安API参数格式
5. **自我验证**：每个组件可独立测试

## 📋 任务拆解

### 🏗️ 阶段一：内核Schema设计（任务1）

#### 目标
设计交易所无关的统一数据结构，支持持仓、历史、流水、总资金等核心数据。

#### 核心数据结构
```javascript
// 内核Schema - 交易所无关
const CoreSchema = {
    // 持仓数据
    position: {
        id: "string",           // 持仓ID
        symbol: "string",       // 交易对
        side: "LONG|SHORT",   // 方向
        quantity: "number",     // 数量
        entryPrice: "number",   // 开仓价格
        markPrice: "number",    // 标记价格
        unrealizedPnl: "number", // 未实现盈亏
        margin: "number",      // 保证金
        leverage: "number",    // 杠杆倍数
        timestamp: "number"    // 时间戳
    },
    
    // 历史记录
    history: {
        id: "string",           // 记录ID
        type: "ORDER|FUNDING|SETTLEMENT", // 类型
        symbol: "string",       // 交易对
        side: "BUY|SELL",       // 买卖方向
        quantity: "number",     // 数量
        price: "number",        // 价格
        fee: "number",          // 手续费
        realizedPnl: "number",  // 实现盈亏
        timestamp: "number"    // 时间戳
    },
    
    // 资金流水
    transaction: {
        id: "string",           // 流水ID
        type: "FUNDING_FEE|TRADING_FEE|REALIZED_PNL", // 类型
        amount: "number",       // 金额
        asset: "string",       // 资产类型
        symbol: "string",       // 交易对
        timestamp: "number"     // 时间戳
    },
    
    // 总资金
    balance: {
        total: "number",        // 总权益
        available: "number",  // 可用资金
        margin: "number",      // 已用保证金
        unrealizedPnl: "number", // 未实现盈亏
        asset: "string",       // 资产类型
        timestamp: "number"    // 时间戳
    }
};
```

#### 实现要求
- ✅ 支持JSON Schema验证
- ✅ 支持TypeScript类型定义
- ✅ 支持数据转换和映射
- ✅ 支持版本控制
- ✅ 支持扩展字段

#### 验证标准
```javascript
// 单元测试示例
describe('CoreSchema', () => {
    test('should validate position data structure', () => {
        const position = {
            id: "POS_123",
            symbol: "TRXUSDT",
            side: "LONG",
            quantity: 1000,
            entryPrice: 0.15,
            markPrice: 0.16,
            unrealizedPnl: 10,
            margin: 150,
            leverage: 10,
            timestamp: Date.now()
        };
        
        expect(CoreSchema.validate.position(position)).toBe(true);
    });
    
    test('should convert between different formats', () => {
        const coreData = CoreSchema.from.exchange.position(exchangePosition);
        const binanceData = CoreSchema.to.binance.position(coreData);
        
        expect(binanceData).toMatchBinanceFormat();
    });
});
```

### 🔧 阶段二：Binance Adaptor实现（任务2-4）

#### 任务2：Binance持仓数据适配器
```javascript
class BinancePositionAdaptor {
    /**
     * 内核持仓 -> Binance持仓格式
     */
    static toBinancePosition(corePosition) {
        return {
            symbol: corePosition.symbol,
            positionSide: this.mapSide(corePosition.side), // "LONG|SHORT"
            positionAmt: corePosition.quantity.toString(),
            entryPrice: corePosition.entryPrice.toString(),
            markPrice: corePosition.markPrice.toString(),
            unRealizedProfit: corePosition.unrealizedPnl.toString(),
            isolatedMargin: corePosition.margin.toString(),
            leverage: corePosition.leverage.toString(),
            updateTime: corePosition.timestamp
        };
    }
    
    /**
     * Binance持仓 -> 内核持仓格式
     */
    static fromBinancePosition(binancePosition) {
        return {
            id: `${binancePosition.symbol}_${binancePosition.positionSide}`,
            symbol: binancePosition.symbol,
            side: this.mapPositionSide(binancePosition.positionSide),
            quantity: parseFloat(binancePosition.positionAmt),
            entryPrice: parseFloat(binancePosition.entryPrice),
            markPrice: parseFloat(binancePosition.markPrice),
            unrealizedPnl: parseFloat(binancePosition.unRealizedProfit),
            margin: parseFloat(binancePosition.isolatedMargin),
            leverage: parseInt(binancePosition.leverage),
            timestamp: binancePosition.updateTime
        };
    }
    
    static mapSide(side) {
        return side === 'LONG' ? 'LONG' : 'SHORT';
    }
    
    static mapPositionSide(positionSide) {
        return positionSide === 'LONG' ? 'LONG' : 'SHORT';
    }
}
```

#### 任务3：Binance历史记录适配器
```javascript
class BinanceHistoryAdaptor {
    /**
     * 内核历史 -> Binance历史格式
     */
    static toBinanceHistory(coreHistory) {
        const baseRecord = {
            symbol: coreHistory.symbol,
            side: this.mapSide(coreHistory.side),
            executedQty: coreHistory.quantity.toString(),
            cumQuote: (coreHistory.quantity * coreHistory.price).toString(),
            time: coreHistory.timestamp,
            commission: coreHistory.fee.toString(),
            realizedProfit: coreHistory.realizedPnl.toString()
        };
        
        // 根据类型生成特定格式
        switch (coreHistory.type) {
            case 'ORDER':
                return {
                    ...baseRecord,
                    orderId: coreHistory.id,
                    price: coreHistory.price.toString(),
                    type: 'MARKET', // 默认市价单
                    status: 'FILLED'
                };
            case 'FUNDING':
                return {
                    ...baseRecord,
                    incomeType: 'FUNDING_FEE',
                    income: coreHistory.realizedPnl.toString(),
                    asset: 'USDT',
                    time: coreHistory.timestamp
                };
            case 'SETTLEMENT':
                return {
                    ...baseRecord,
                    incomeType: 'REALIZED_PNL',
                    income: coreHistory.realizedPnl.toString(),
                    asset: 'USDT',
                    time: coreHistory.timestamp
                };
        }
    }
    
    /**
     * Binance历史 -> 内核历史格式
     */
    static fromBinanceHistory(binanceHistory) {
        // 根据Binance格式判断类型
        let type, realizedPnl, fee;
        
        if (binanceHistory.incomeType) {
            type = binanceHistory.incomeType === 'FUNDING_FEE' ? 'FUNDING' : 'SETTLEMENT';
            realizedPnl = parseFloat(binanceHistory.income);
            fee = 0;
        } else {
            type = 'ORDER';
            realizedPnl = parseFloat(binanceHistory.realizedProfit || 0);
            fee = parseFloat(binanceHistory.commission || 0);
        }
        
        return {
            id: binanceHistory.orderId || binanceHistory.tranId || `${binanceHistory.symbol}_${binanceHistory.time}`,
            type: type,
            symbol: binanceHistory.symbol,
            side: this.mapBinanceSide(binanceHistory.side),
            quantity: parseFloat(binanceHistory.executedQty || 0),
            price: parseFloat(binanceHistory.price || binanceHistory.avgPrice || 0),
            fee: fee,
            realizedPnl: realizedPnl,
            timestamp: binanceHistory.time || binanceHistory.updateTime
        };
    }
}
```

#### 任务4：Binance资金流水适配器
```javascript
class BinanceTransactionAdaptor {
    /**
     * 内核流水 -> Binance流水格式
     */
    static toBinanceTransaction(coreTransaction) {
        return {
            tranId: coreTransaction.id,
            asset: coreTransaction.asset,
            income: coreTransaction.amount.toString(),
            incomeType: this.mapIncomeType(coreTransaction.type),
            time: coreTransaction.timestamp,
            info: `Transaction: ${coreTransaction.type}`,
            symbol: coreTransaction.symbol
        };
    }
    
    /**
     * Binance流水 -> 内核流水格式
     */
    static fromBinanceTransaction(binanceTransaction) {
        return {
            id: binanceTransaction.tranId.toString(),
            type: this.mapIncomeTypeReverse(binanceTransaction.incomeType),
            amount: parseFloat(binanceTransaction.income),
            asset: binanceTransaction.asset,
            symbol: binanceTransaction.symbol,
            timestamp: binanceTransaction.time
        };
    }
    
    static mapIncomeType(type) {
        const mapping = {
            'FUNDING_FEE': 'FUNDING_FEE',
            'TRADING_FEE': 'COMMISSION',
            'REALIZED_PNL': 'REALIZED_PNL'
        };
        return mapping[type] || 'OTHER';
    }
    
    static mapIncomeTypeReverse(incomeType) {
        const mapping = {
            'FUNDING_FEE': 'FUNDING_FEE',
            'COMMISSION': 'TRADING_FEE',
            'REALIZED_PNL': 'REALIZED_PNL'
        };
        return mapping[incomeType] || 'OTHER';
    }
}
```

### 🌐 阶段三：拦截API实现（任务5-7）

#### 任务5：Binance持仓API拦截器
```javascript
// mock-server/routes/binance-intercept.js
const BinancePositionAdaptor = require('../adaptors/binance-position-adaptor');

async function binanceInterceptRouter(fastify, opts) {
    
    // GET /fapi/v2/positionRisk - 获取持仓风险
    fastify.get('/fapi/v2/positionRisk', async (request, reply) => {
        try {
            const { symbol } = request.query;
            
            // 从内核数据库获取持仓数据
            const corePositions = await opts.database.getPositions({
                exchange: 'binance',
                symbol: symbol
            });
            
            // 转换为Binance格式
            const binancePositions = corePositions.map(pos => 
                BinancePositionAdaptor.toBinancePosition(pos)
            );
            
            // 只返回币安数据
            return {
                code: 200,
                success: true,
                data: binancePositions
            };
        } catch (err) {
            console.error(`[Binance Intercept Error] ${err.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: err.message,
                success: false
            });
        }
    });
    
    // GET /fapi/v1/income - 获取资金流水
    fastify.get('/fapi/v1/income', async (request, reply) => {
        try {
            const { 
                symbol, 
                incomeType, 
                startTime, 
                endTime, 
                limit = 50 
            } = request.query;
            
            // 参数过滤和验证
            const filters = {};
            if (symbol) filters.symbol = symbol;
            if (incomeType) filters.type = this.mapIncomeType(incomeType);
            if (startTime) filters.startTime = parseInt(startTime);
            if (endTime) filters.endTime = parseInt(endTime);
            
            // 获取流水数据
            const transactions = await opts.database.getTransactions({
                exchange: 'binance',
                ...filters,
                limit: Math.min(limit, 1000) // 限制最大数量
            });
            
            // 转换为Binance格式
            const incomeRecords = transactions.map(tx => 
                BinanceTransactionAdaptor.toBinanceTransaction(tx)
            );
            
            return {
                code: 200,
                success: true,
                data: incomeRecords
            };
        } catch (err) {
            console.error(`[Binance Income Intercept Error] ${err.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: err.message,
                success: false
            });
        }
    });
    
    // GET /fapi/v1/userTrades - 获取用户交易历史
    fastify.get('/fapi/v1/userTrades', async (request, reply) => {
        try {
            const {
                symbol,
                startTime,
                endTime,
                fromId,
                limit = 50
            } = request.query;
            
            const filters = {};
            if (symbol) filters.symbol = symbol;
            if (startTime) filters.startTime = parseInt(startTime);
            if (endTime) filters.endTime = parseInt(endTime);
            if (fromId) filters.fromId = fromId;
            
            // 获取历史数据（只包含订单类型）
            const historyRecords = await opts.database.getHistory({
                exchange: 'binance',
                type: 'ORDER',
                ...filters,
                limit: Math.min(limit, 1000)
            });
            
            // 转换为Binance格式
            const trades = historyRecords.map(record =>
                BinanceHistoryAdaptor.toBinanceHistory(record)
            );
            
            return {
                code: 200,
                success: true,
                data: trades
            };
        } catch (err) {
            console.error(`[Binance Trades Intercept Error] ${err.message}`);
            return reply.code(500).send({
                code: -1000,
                msg: err.message,
                success: false
            });
        }
    });
}

module.exports = binanceInterceptRouter;
```

#### 任务6：参数过滤和验证系统
```javascript
// mock-server/middleware/parameter-filter.js

class ParameterFilter {
    constructor() {
        this.rules = {
            'binance': {
                '/fapi/v2/positionRisk': {
                    symbol: { type: 'string', required: false, pattern: /^[A-Z]{3,}USDT$/ },
                    timestamp: { type: 'number', required: true },
                    recvWindow: { type: 'number', required: false, max: 60000 }
                },
                '/fapi/v1/income': {
                    symbol: { type: 'string', required: false },
                    incomeType: { type: 'string', required: false, enum: ['TRANSFER', 'WELCOME_BONUS', 'REALIZED_PNL', 'FUNDING_FEE', 'COMMISSION', 'INSURANCE_CLEAR'] },
                    startTime: { type: 'number', required: false },
                    endTime: { type: 'number', required: false },
                    limit: { type: 'number', required: false, min: 1, max: 1000 }
                },
                '/fapi/v1/userTrades': {
                    symbol: { type: 'string', required: true },
                    startTime: { type: 'number', required: false },
                    endTime: { type: 'number', required: false },
                    fromId: { type: 'string', required: false },
                    limit: { type: 'number', required: false, min: 1, max: 1000 }
                }
            }
        };
    }
    
    /**
     * 验证和过滤参数
     */
    validateParameters(exchange, endpoint, params) {
        const rules = this.rules[exchange]?.[endpoint];
        if (!rules) {
            return { valid: true, filtered: params }; // 无规则则通过
        }
        
        const errors = [];
        const filtered = {};
        
        for (const [field, rule] of Object.entries(rules)) {
            const value = params[field];
            
            // 必填检查
            if (rule.required && (value === undefined || value === null)) {
                errors.push(`Missing required parameter: ${field}`);
                continue;
            }
            
            // 非必填且值为空则跳过
            if (!rule.required && (value === undefined || value === null)) {
                continue;
            }
            
            // 类型检查
            if (!this.validateType(value, rule.type)) {
                errors.push(`Invalid type for ${field}: expected ${rule.type}, got ${typeof value}`);
                continue;
            }
            
            // 范围检查
            if (rule.min !== undefined && value < rule.min) {
                errors.push(`${field} must be >= ${rule.min}`);
                continue;
            }
            
            if (rule.max !== undefined && value > rule.max) {
                errors.push(`${field} must be <= ${rule.max}`);
                continue;
            }
            
            // 模式检查
            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(`${field} does not match required pattern`);
                continue;
            }
            
            // 枚举检查
            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
                continue;
            }
            
            // 转换和过滤
            filtered[field] = this.transformValue(value, rule);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            filtered: filtered
        };
    }
    
    validateType(value, expectedType) {
        if (expectedType === 'string') return typeof value === 'string';
        if (expectedType === 'number') return typeof value === 'number' && !isNaN(value);
        if (expectedType === 'boolean') return typeof value === 'boolean';
        if (expectedType === 'array') return Array.isArray(value);
        if (expectedType === 'object') return typeof value === 'object' && value !== null;
        return true;
    }
    
    transformValue(value, rule) {
        // 数值转换
        if (rule.type === 'number' && typeof value === 'string') {
            return parseFloat(value) || 0;
        }
        
        // 字符串转换
        if (rule.type === 'string' && typeof value === 'number') {
            return value.toString();
        }
        
        // 布尔转换
        if (rule.type === 'boolean') {
            return Boolean(value);
        }
        
        return value;
    }
}

module.exports = ParameterFilter;
```

#### 任务7：自我测试验证系统
```javascript
// mock-server/tests/binance-adaptor.test.js

const assert = require('assert');
const BinancePositionAdaptor = require('../adaptors/binance-position-adaptor');
const BinanceHistoryAdaptor = require('../adaptors/binance-history-adaptor');
const BinanceTransactionAdaptor = require('../adaptors/binance-transaction-adaptor');
const ParameterFilter = require('../middleware/parameter-filter');

describe('Binance Adaptor System', () => {
    
    describe('Position Adaptor', () => {
        test('should convert core position to binance format', () => {
            const corePosition = {
                id: "POS_TRX_LONG_123",
                symbol: "TRXUSDT",
                side: "LONG",
                quantity: 1000,
                entryPrice: 0.15,
                markPrice: 0.16,
                unrealizedPnl: 10,
                margin: 150,
                leverage: 10,
                timestamp: 1234567890000
            };
            
            const binancePosition = BinancePositionAdaptor.toBinancePosition(corePosition);
            
            assert.strictEqual(binancePosition.symbol, "TRXUSDT");
            assert.strictEqual(binancePosition.positionSide, "LONG");
            assert.strictEqual(binancePosition.positionAmt, "1000");
            assert.strictEqual(binancePosition.entryPrice, "0.15");
            assert.strictEqual(binancePosition.markPrice, "0.16");
            assert.strictEqual(binancePosition.unRealizedProfit, "10");
            assert.strictEqual(binancePosition.isolatedMargin, "150");
            assert.strictEqual(binancePosition.leverage, "10");
            assert.strictEqual(binancePosition.updateTime, 1234567890000);
        });
        
        test('should handle short position correctly', () => {
            const corePosition = {
                id: "POS_TRX_SHORT_456",
                symbol: "TRXUSDT",
                side: "SHORT",
                quantity: 500,
                entryPrice: 0.14,
                markPrice: 0.13,
                unrealizedPnl: 5,
                margin: 70,
                leverage: 10,
                timestamp: 1234567890000
            };
            
            const binancePosition = BinancePositionAdaptor.toBinancePosition(corePosition);
            
            assert.strictEqual(binancePosition.positionSide, "SHORT");
            assert.strictEqual(binancePosition.unRealizedProfit, "5");
        });
    });
    
    describe('Parameter Filter', () => {
        test('should validate binance position risk parameters', () => {
            const params = {
                symbol: "TRXUSDT",
                timestamp: 1234567890000,
                recvWindow: 5000
            };
            
            const result = parameterFilter.validateParameters('binance', '/fapi/v2/positionRisk', params);
            
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.filtered.symbol, "TRXUSDT");
            assert.strictEqual(result.filtered.timestamp, 1234567890000);
            assert.strictEqual(result.filtered.recvWindow, 5000);
        });
        
        test('should reject invalid symbol format', () => {
            const params = {
                symbol: "invalid_symbol",
                timestamp: 1234567890000
            };
            
            const result = parameterFilter.validateParameters('binance', '/fapi/v2/positionRisk', params);
            
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(err => err.includes('pattern')));
        });
        
        test('should enforce required parameters', () => {
            const params = {
                symbol: "TRXUSDT"
                // missing timestamp
            };
            
            const result = parameterFilter.validateParameters('binance', '/fapi/v2/positionRisk', params);
            
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.some(err => err.includes('Missing required parameter: timestamp')));
        });
    });
    
    describe('Integration Test', () => {
        test('should handle complete binance API flow', async () => {
            // 1. 创建内核数据
            const coreData = {
                positions: [/* 持仓数据 */],
                transactions: [/* 流水数据 */],
                history: [/* 历史数据 */]
            };
            
            // 2. 模拟API请求
            const mockRequest = {
                query: {
                    symbol: "TRXUSDT",
                    timestamp: Date.now(),
                    limit: 10
                }
            };
            
            // 3. 参数过滤
            const filterResult = parameterFilter.validateParameters(
                'binance', 
                '/fapi/v1/income', 
                mockRequest.query
            );
            
            assert.strictEqual(filterResult.valid, true);
            
            // 4. 数据转换
            const binanceData = coreData.transactions.map(tx =>
                BinanceTransactionAdaptor.toBinanceTransaction(tx)
            );
            
            // 5. 验证格式
            assert.ok(Array.isArray(binanceData));
            binanceData.forEach(record => {
                assert.ok(record.tranId);
                assert.ok(record.asset);
                assert.ok(record.income);
                assert.ok(record.incomeType);
                assert.ok(record.time);
            });
        });
    });
});
```

### 🚀 阶段四：集成与部署（任务8-9）

#### 任务8：系统集成测试
```javascript
// mock-server/tests/integration.test.js

const request = require('supertest');
const app = require('../app');

describe('Mock Server Integration', () => {
    
    test('should handle binance position risk API', async () => {
        const response = await request(app)
            .get('/fapi/v2/positionRisk')
            .query({
                symbol: 'TRXUSDT',
                timestamp: Date.now()
            });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        
        // 验证数据结构
        if (response.body.data.length > 0) {
            const position = response.body.data[0];
            expect(position).toHaveProperty('symbol');
            expect(position).toHaveProperty('positionSide');
            expect(position).toHaveProperty('positionAmt');
            expect(position).toHaveProperty('entryPrice');
            expect(position).toHaveProperty('markPrice');
            expect(position).toHaveProperty('unRealizedProfit');
        }
    });
    
    test('should handle binance income API with filtering', async () => {
        const response = await request(app)
            .get('/fapi/v1/income')
            .query({
                symbol: 'TRXUSDT',
                incomeType: 'FUNDING_FEE',
                startTime: Date.now() - 24 * 60 * 60 * 1000, // 24小时前
                endTime: Date.now(),
                limit: 10
            });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        
        // 验证只返回FUNDING_FEE类型
        response.body.data.forEach(record => {
            expect(record.incomeType).toBe('FUNDING_FEE');
        });
    });
    
    test('should handle binance trades API', async () => {
        const response = await request(app)
            .get('/fapi/v1/userTrades')
            .query({
                symbol: 'TRXUSDT',
                limit: 5
            });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
    
    test('should filter data by exchange', async () => {
        // 测试确保只返回币安数据
        const response = await request(app)
            .get('/fapi/v2/positionRisk')
            .query({
                symbol: 'TRXUSDT'
            });
        
        expect(response.status).toBe(200);
        
        // 验证响应格式符合币安标准
        expect(response.body).toHaveProperty('code');
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
        
        // 不应包含其他交易所的数据
        response.body.data.forEach(position => {
            expect(position.symbol).toMatch(/^[A-Z]+USDT$/); // 币安格式
        });
    });
});
```

#### 任务9：部署配置与监控
```yaml
# docker-compose.yml
version: '3.8'
services:
  mock-server:
    build: ./mock-server
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=sqlite:./mock_exchange.db
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  binance-mock:
    build: ./binance-mock
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MOCK_SERVER_URL=http://mock-server:3000
    depends_on:
      - mock-server
    restart: unless-stopped

  signal-translator:
    build: ./signal-translator
    environment:
      - NODE_ENV=production
      - MOCK_SERVER_URL=http://mock-server:3000
      - REPLAY_BOT_DATA_PATH=/app/replay-bot-data
    volumes:
      - ./replay-bot/data:/app/replay-bot-data:ro
    depends_on:
      - mock-server
    restart: unless-stopped
```

## 📊 验证标准

### 功能验证
- ✅ 内核Schema支持所有核心数据类型
- ✅ Binance Adaptor正确转换数据格式
- ✅ 拦截API只返回币安数据
- ✅ 参数过滤支持所有币安API参数
- ✅ 自我测试覆盖率达90%以上

### 性能指标
- API响应时间 < 100ms
- 数据转换延迟 < 10ms
- 内存使用 < 100MB
- 错误率 < 0.1%

### 兼容性验证
- ✅ 支持币安官方API格式
- ✅ 支持时间范围过滤
- ✅ 支持类型过滤
- ✅ 支持分页和限制
- ✅ 支持错误处理和重试

## 🎯 交付成果

1. **内核Schema模块** - 统一数据格式定义
2. **Binance Adaptor套件** - 完整的数据转换工具
3. **拦截API系统** - 模拟币安真实接口
4. **参数过滤器** - 完善的参数验证机制
5. **测试套件** - 90%+覆盖率的自动化测试
6. **部署配置** - Docker化部署方案
7. **监控仪表板** - 实时性能监控

这个任务拆解确保每个组件都可以独立开发、测试和验证，最终形成完整的多交易所信号翻译器集成系统。
