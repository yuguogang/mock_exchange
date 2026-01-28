# Replay-Bot 改进任务清单

> **项目目录**: `service/replay-bot`  
> **创建日期**: 2026-01-25  
> **状态**: 待执行

---

## 🎯 改进目标

1. **代码健壮性**: 修复已知 Bug，增强错误处理
2. **可维护性**: 消除硬编码，统一配置管理
3. **可观测性**: 添加健康检查、结构化日志
4. **工程规范**: 添加 package.json、基础测试
5. **文档完整性**: 补充 API 文档和使用示例

---

## 📋 任务列表

### Phase 1: 紧急修复 (Critical Fixes)

#### Task 1.1: 修复 `live_runner_enhanced.js` 中缺失的 fs 导入

**目标**: 修复运行时错误

**改动范围**:
- 文件: `live_runner_enhanced.js`
- 行号: 第 8-10 行

**具体步骤**:
1. 在文件顶部添加 `const fs = require('fs');`

**自我验证**:
```bash
# 验证命令
cd service/replay-bot
node -c live_runner_enhanced.js  # 语法检查
node -e "require('./live_runner_enhanced')"  # 模块加载测试

# 预期结果: 无错误输出
```

**完成标准**: ✅ 模块可正常加载，无 `ReferenceError: fs is not defined`

---

#### Task 1.2: 添加 HTTP 请求超时控制

**目标**: 防止网络请求无限等待

**改动范围**:
- 文件: `strategy.js`
- 函数: `postJSON()`

**具体步骤**:
1. 在 `http.request` 的 options 中添加 `timeout: 5000`
2. 添加 `req.on('timeout', ...)` 处理

**修改示例**:
```javascript
const options = {
    hostname: MOCK_SERVER_HOST,
    port: MOCK_SERVER_PORT,
    path: path,
    method: 'POST',
    timeout: 5000,  // 新增
    headers: { ... }
};

req.on('timeout', () => {
    req.destroy();
    reject(new Error('Request timeout'));
});
```

**自我验证**:
```bash
# 测试超时机制（Mock Server 未启动时）
cd service/replay-bot
timeout 10 node -e "
const { postJSON } = require('./strategy');
postJSON('/test', {}).catch(e => console.log('✅ 超时处理正常:', e.message));
" || echo "测试完成"

# 预期: 5秒内返回超时错误，而非无限等待
```

**完成标准**: ✅ 请求在 5 秒内超时并返回错误

---

### Phase 2: 配置管理 (Configuration)

#### Task 2.1: 创建 package.json

**目标**: 规范化项目依赖和脚本管理

**改动范围**:
- 新增文件: `package.json`

**具体步骤**:
1. 在 `service/replay-bot` 目录创建 `package.json`
2. 定义项目信息、脚本命令

**文件内容**:
```json
{
  "name": "replay-bot",
  "version": "1.0.0",
  "description": "Hedging Strategy Replay Bot for Mock Server",
  "main": "live_runner_enhanced.js",
  "scripts": {
    "start": "node live_runner_enhanced.js",
    "download": "node download_data.js",
    "mix": "node mixer_dynamic.js",
    "signal": "node scheduler.js",
    "strategy": "node strategy.js",
    "rule:list": "node rule_manager.js list",
    "rule:status": "node rule_manager.js status",
    "lint": "node -c *.js",
    "test": "echo 'No tests yet' && exit 0"
  },
  "keywords": ["mock", "trading", "replay", "hedging"],
  "author": "",
  "license": "ISC"
}
```

**自我验证**:
```bash
cd service/replay-bot

# 验证 JSON 格式
node -e "JSON.parse(require('fs').readFileSync('package.json'))"

# 验证脚本可执行
npm run lint

# 预期结果: 无语法错误
```

**完成标准**: ✅ `npm run lint` 通过，所有 JS 文件语法正确

---

#### Task 2.2: 创建环境配置文件

**目标**: 将硬编码配置外部化

**改动范围**:
- 新增文件: `.env.example`
- 新增文件: `config/env.js`

**具体步骤**:
1. 创建 `.env.example` 模板
2. 创建 `config/env.js` 配置加载器
3. 修改现有文件使用配置

**.env.example 内容**:
```env
# Mock Server
MOCK_SERVER_HOST=localhost
MOCK_SERVER_PORT=3000

# Runner
RUNNER_INTERVAL_MS=60000
RUNNER_MAX_RETRIES=3
RUNNER_RETRY_DELAY_MS=5000

# Logging
LOG_LEVEL=info
```

**config/env.js 内容**:
```javascript
const fs = require('fs');
const path = require('path');

// 简易 .env 加载器（无外部依赖）
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const [key, ...val] = line.split('=');
            if (key && !key.startsWith('#')) {
                process.env[key.trim()] = val.join('=').trim();
            }
        });
    }
}

loadEnv();

module.exports = {
    mockServer: {
        host: process.env.MOCK_SERVER_HOST || 'localhost',
        port: parseInt(process.env.MOCK_SERVER_PORT || '3000')
    },
    runner: {
        intervalMs: parseInt(process.env.RUNNER_INTERVAL_MS || '60000'),
        maxRetries: parseInt(process.env.RUNNER_MAX_RETRIES || '3'),
        retryDelayMs: parseInt(process.env.RUNNER_RETRY_DELAY_MS || '5000')
    },
    log: {
        level: process.env.LOG_LEVEL || 'info'
    }
};
```

**自我验证**:
```bash
cd service/replay-bot

# 验证配置加载
node -e "
const config = require('./config/env');
console.log('Mock Server:', config.mockServer);
console.log('Runner:', config.runner);
if (config.mockServer.port === 3000) console.log('✅ 默认配置加载成功');
"

# 预期: 输出配置信息，无错误
```

**完成标准**: ✅ 配置加载器可正常工作，默认值正确

---

### Phase 3: 健康检查 (Health Check)

#### Task 3.1: 添加 Mock Server 健康检查

**目标**: 在执行策略前验证 Mock Server 可用性

**改动范围**:
- 文件: `strategy.js`
- 新增函数: `checkMockServerHealth()`

**具体步骤**:
1. 添加 `checkMockServerHealth()` 函数
2. 在 `main()` 开始时调用检查

**代码示例**:
```javascript
async function checkMockServerHealth() {
    try {
        await postJSON('/health', {});
        console.log('✅ Mock Server 健康检查通过');
        return true;
    } catch (e) {
        console.error('❌ Mock Server 不可用:', e.message);
        return false;
    }
}

async function main() {
    // 新增健康检查
    const healthy = await checkMockServerHealth();
    if (!healthy && hedgeConfig.outputs.inject_to_mock_server) {
        console.error('Mock Server 不可用，但配置要求注入数据。请先启动 Mock Server。');
        process.exit(1);
    }
    // ... 原有逻辑
}
```

**自我验证**:
```bash
cd service/replay-bot

# 场景1: Mock Server 未运行
node -e "
const strategy = require('./strategy');
// 如果模块导出了 checkMockServerHealth
" 2>&1 | grep -q "Mock Server" && echo "✅ 健康检查功能存在"

# 场景2: 手动测试（需要 Mock Server）
# 启动 Mock Server 后运行 node strategy.js --config=...

# 预期: 输出健康检查结果
```

**完成标准**: ✅ 策略执行前输出健康检查结果

---

### Phase 4: 日志增强 (Logging)

#### Task 4.1: 创建统一日志模块

**目标**: 提供结构化、分级日志

**改动范围**:
- 新增文件: `lib/logger.js`

**具体步骤**:
1. 创建 `lib/` 目录
2. 创建 `logger.js` 日志模块

**文件内容**:
```javascript
// lib/logger.js

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
```

**自我验证**:
```bash
cd service/replay-bot

# 验证日志模块
node -e "
const logger = require('./lib/logger');
logger.info('测试日志', { module: 'test', count: 42 });
logger.debug('调试日志', {});
logger.error('错误日志', { code: 500 });
"

# 预期输出: JSON 格式日志，包含 timestamp, level, message
```

**完成标准**: ✅ 日志输出为 JSON 格式，包含时间戳和级别

---

### Phase 5: 输入验证 (Validation)

#### Task 5.1: 添加配置文件验证

**目标**: 加载配置时验证必要字段

**改动范围**:
- 新增文件: `lib/validator.js`

**具体步骤**:
1. 创建配置验证函数
2. 定义各类配置的必要字段

**文件内容**:
```javascript
// lib/validator.js

function validateHedgeConfig(config) {
    const errors = [];
    
    if (!config.hedge_name) errors.push('缺少 hedge_name');
    if (!Array.isArray(config.legs) || config.legs.length === 0) {
        errors.push('legs 必须是非空数组');
    } else {
        config.legs.forEach((leg, i) => {
            if (!leg.exchange) errors.push(`legs[${i}] 缺少 exchange`);
            if (!leg.symbol) errors.push(`legs[${i}] 缺少 symbol`);
        });
    }
    if (!config.outputs) errors.push('缺少 outputs 配置');
    
    return { valid: errors.length === 0, errors };
}

function validateStrategyConfig(config) {
    const errors = [];
    
    if (!config.hedge_ref) errors.push('缺少 hedge_ref');
    if (!config.params) errors.push('缺少 params');
    
    return { valid: errors.length === 0, errors };
}

module.exports = { validateHedgeConfig, validateStrategyConfig };
```

**自我验证**:
```bash
cd service/replay-bot

# 验证正确配置
node -e "
const { validateHedgeConfig } = require('./lib/validator');
const config = require('./config/hedge/demo_hedge_trx_binance_okx.json');
const result = validateHedgeConfig(config);
console.log('验证结果:', result);
if (result.valid) console.log('✅ 配置验证通过');
"

# 验证错误配置
node -e "
const { validateHedgeConfig } = require('./lib/validator');
const result = validateHedgeConfig({});
console.log('验证结果:', result);
if (!result.valid) console.log('✅ 空配置正确报错');
"

# 预期: 第一个通过，第二个报错
```

**完成标准**: ✅ 正确配置验证通过，错误配置返回具体错误信息

---

### Phase 6: 基础测试 (Testing)

#### Task 6.1: 添加辅助函数测试

**目标**: 为核心逻辑添加最小化测试

**改动范围**:
- 新增文件: `test/validator.test.js`
- 修改文件: `package.json` (添加测试脚本)

**具体步骤**:
1. 创建 `test/` 目录
2. 编写基础测试用例（无依赖）

**文件内容**:
```javascript
// test/validator.test.js

const { validateHedgeConfig, validateStrategyConfig } = require('../lib/validator');

function assert(condition, message) {
    if (!condition) throw new Error(`❌ 断言失败: ${message}`);
    console.log(`✅ ${message}`);
}

function runTests() {
    console.log('\n=== Validator Tests ===\n');
    
    // Test 1: 空配置应该失败
    const emptyResult = validateHedgeConfig({});
    assert(!emptyResult.valid, '空配置应返回 valid=false');
    assert(emptyResult.errors.length > 0, '空配置应有错误信息');
    
    // Test 2: 正确配置应该通过
    const validConfig = {
        hedge_name: 'test',
        legs: [{ exchange: 'binance', symbol: 'BTCUSDT' }],
        outputs: {}
    };
    const validResult = validateHedgeConfig(validConfig);
    assert(validResult.valid, '正确配置应返回 valid=true');
    
    // Test 3: 缺少 symbol
    const missingSymbol = {
        hedge_name: 'test',
        legs: [{ exchange: 'binance' }],
        outputs: {}
    };
    const symbolResult = validateHedgeConfig(missingSymbol);
    assert(!symbolResult.valid, '缺少 symbol 应失败');
    assert(symbolResult.errors.some(e => e.includes('symbol')), '错误信息应提及 symbol');
    
    console.log('\n=== 所有测试通过 ===\n');
}

runTests();
```

**自我验证**:
```bash
cd service/replay-bot

# 运行测试
node test/validator.test.js

# 预期输出: 所有 ✅ 断言通过
```

**完成标准**: ✅ 测试脚本执行无错误，输出"所有测试通过"

---

## 📊 执行顺序建议

```
Phase 1 (紧急) ──→ Phase 2 (配置) ──→ Phase 3 (健康检查)
      │                  │                    │
      ▼                  ▼                    ▼
   Task 1.1           Task 2.1             Task 3.1
   Task 1.2           Task 2.2
                         │
                         ▼
                 Phase 4 (日志) ──→ Phase 5 (验证) ──→ Phase 6 (测试)
                         │                │                │
                         ▼                ▼                ▼
                      Task 4.1         Task 5.1         Task 6.1
```

---

## ✅ 进度追踪

| Task ID | 任务名称 | 状态 | 完成日期 |
|---------|----------|------|----------|
| 1.1 | 修复 fs 导入 | ⬜ 待开始 | - |
| 1.2 | HTTP 超时控制 | ⬜ 待开始 | - |
| 2.1 | 创建 package.json | ⬜ 待开始 | - |
| 2.2 | 环境配置文件 | ⬜ 待开始 | - |
| 3.1 | Mock Server 健康检查 | ⬜ 待开始 | - |
| 4.1 | 统一日志模块 | ⬜ 待开始 | - |
| 5.1 | 配置文件验证 | ⬜ 待开始 | - |
| 6.1 | 基础测试 | ⬜ 待开始 | - |

---

## 📝 备注

- 每个任务完成后，请更新上方进度表
- 自我验证命令需在 `service/replay-bot` 目录执行
- 如遇问题，优先查看错误日志 `logs/error_*.json`
