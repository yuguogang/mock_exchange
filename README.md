# mock plugin

这是一个用于修改 Binance 和 OKX 交易所页面显示数据的 Chrome 插件系统。它通过拦截前端 API 请求，将其重定向到本地 Mock Server，从而实现对交易数据（余额、持仓、订单历史等）的完全控制和模拟。

## 🎯 最终目标 (Project Vision)

我们的目标是构建一个 **“基于真实前端的通用仿真交易引擎”**。  
它是一个“影子系统”，寄生在真实交易所页面之下，劫持所有账户相关的数据流，将其重定向到本地的仿真撮合引擎，同时保留真实的市场行情数据。

### 核心三大支柱

1.  **UI 劫持 (Real UI)**:
    -   用户直接使用 Binance/OKX 的官方前端，无需开发任何前端界面。
    -   插件在底层“偷梁换柱”，用户无感知。

2.  **仿真内核 (Mock Kernel)**:
    -   本地 `mock-server` 充当一个迷你交易所后端。
    -   实现完整的撮合逻辑（市价/限价）、清算逻辑（盈亏计算/强平）、资产管理（余额/保证金）。
    -   支持上帝模式（God Mode），可任意修改持仓、余额、历史记录。

3.  **混合数据流 (Hybrid Data Flow)**:
    -   **账户数据 (Account Data)**: 虚拟的，来自 Mock Server。包括：余额、持仓、当前委托、历史记录。
    -   **行情数据 (Market Data)**: 真实的，来自交易所。包括：K线、盘口、最新成交。
    -   **效果**: 使用真实的行情波动，来回测/模拟虚拟的账户盈亏。

---

## 🚀 核心架构

项目由三部分组成：

### 1. Chrome Extension (`mock_plugin/chrome-extension`)
- 运行在浏览器端。
- 采用 **Hybrid Mode v3** 拦截技术，同时支持 Fetch API (Proxy)、XMLHttpRequest (Modify) 和 WebSocket (Event Interception)。
- 负责将页面请求转发给本地 Mock Server，或根据缓存直接修改响应数据。

### 2. Mock Server (`mock_plugin/service/mock-server`)
- 运行在本地 (Port 3000)。
- 基于 Node.js + Fastify + SQLite。
- 维护模拟交易账户的完整状态（余额、持仓、未实现盈亏、订单历史）。
- 动态计算账户权益 (Equity = Balance + PnL)。

### 3. Replay Bot (`mock_plugin/service/replay-bot`)
- 运行在本地，用于**策略回放与数据生成**。
- 支持配置驱动的对冲策略模拟（价差套利、资金费率套利）。
- 可自动下载市场数据、应用混合规则、生成交易信号、模拟撮合，并将结果**注入 Mock Server**。
- 核心脚本包括：`download_data.js`, `mixer.js`, `scheduler.js`, `strategy.js`, `strategy_funding.js`, `live_runner.js`。

---

## 🛠️ 快速开始

### 1. 启动 Mock Server (核心服务)
插件依赖此服务来获取模拟数据。

```bash
cd service/mock-server
npm install
node index.js
```
*成功启动后，将监听 `http://localhost:3000`*

### 2. (可选) 启动数据生成服务
如果需要生成大量历史模拟数据。
```bash
cd service/binance-mock
npm install
node index.js
```
*监听 `http://localhost:3001`*

### 3. 启动 Replay Bot (策略回放)
用于生成模拟交易数据并注入 Mock Server。

```bash
# 一键启动实时回放循环（推荐）
cd service/replay-bot
node live_runner.js

# 或手动分步运行：
# 1. 下载数据
node download_data.js --config=config/hedge/demo_hedge_trx_binance_okx.json
# 2. 混合数据（应用规则）
node mixer.js
# 3. 生成信号
node scheduler.js --config=config/hedge/demo_hedge_trx_binance_okx.json --data-dir=data_mixed/demo_mix_trx_okx_binance
# 4. 执行策略 & 注入 Mock Server
node strategy.js --config=config/strategy/demo_strategy_funding_trx.json
```

### 4. 安装 Chrome 插件

1.  打开 Chrome 浏览器，访问 `chrome://extensions/`。
2.  开启右上角的 **Developer mode (开发者模式)**。
3.  点击 **Load unpacked (加载已解压的扩展程序)**。
4.  选择项目目录下的 `mock_plugin/chrome-extension` 文件夹。

---

## 🎮 使用说明

1.  确保 **Mock Server** (Port 3000) 正在运行。
2.  访问 [Binance Futures (TRXUSDT)](https://www.binance.com/zh-CN/futures/TRXUSDT)。
3.  **登录状态**: 确保你已登录 Binance 账号（插件在真实会话基础上修改数据）。
4.  **验证效果**:
    - **可用余额 (Available Balance)**: 应显示为 **Mock Server 计算值** (例如 `10,000.00` 或根据持仓动态计算的值 `8,870.xx`)。
    - **持仓 (Positions)**: 页面下方的持仓列表将显示 Mock Server 返回的模拟持仓。
    - **控制台日志**: 按 F12 打开控制台，可以看到 `[Binance Mock]` 开头的彩色日志，指示拦截状态。

---

## ⚙️ 配置约定：下单金额与初始余额

### 下单金额（策略层）
- 在 `service/replay-bot` 的策略配置中新增执行参数：
  - `params.execution.order_notional_usdt`: 每次下单使用的 USDT 名义金额
  - `params.execution.approx_price`: 当信号未携带价格时的估价（用于数量计算与结算估价）
- 与旧字段保持兼容：
  - 若未设置 `params.execution.*`，将回退到 `params.funding.position_size_usdt` 与 `params.funding.approx_price`
- 示例：

```json
{
  "strategy_name": "demo_strategy_all_in_one",
  "params": {
    "execution": {
      "order_notional_usdt": 12000,
      "approx_price": 0.25
    },
    "funding": {
      "position_size_usdt": 10000,
      "approx_price": 0.3
    }
  }
}
```

### 初始账户余额（账户层）
- 通过 Mock Server 的环境变量统一配置账户初始余额：
  - `MOCK_INITIAL_BALANCE`: Binance 初始余额（USDT）
  - `MOCK_INITIAL_BALANCE_OKX`: OKX 初始余额（USDT，未设置则回退到 `MOCK_INITIAL_BALANCE`）
- 启动示例：

```bash
export MOCK_INITIAL_BALANCE=20000
export MOCK_INITIAL_BALANCE_OKX=15000
cd service/mock-server
node index.js
```

- 说明：
  - 余额接口将根据当前持仓的未实现盈亏动态计算权益与可用余额
  - 两端（Replay Bot 与 Signal Translator）通过统一余额接口读取账户状态，无需在各自侧配置余额

---

## 📁 目录结构

```
mock_plugin/
├── chrome-extension/      # Chrome 插件源码
├── service/
│   ├── mock-server/     # 模拟交易所后端 (Port 3000)
│   ├── binance-mock/    # 数据生成服务 (Port 3001)
│   └── replay-bot/      # 策略回放引擎
│       ├── config/      # 配置文件 (Hedge, Mixer, Strategy)
│       ├── data/        # 原始市场数据
│       ├── data_mixed/  # 混合处理后的数据
│       ├── mock_data/   # 生成的模拟交易数据
│       ├── signals/     # 生成的交易信号
│       └── README.md  # Replay Bot 使用文档
├── samples/             # 示例数据
└── tasks/               # 项目任务文档
```

---

## 🧩 技术细节 (Hybrid Mode v3)

插件采用了第三代混合拦截技术，以解决复杂的页面数据加载问题：

- **双重注入 (Dual Injection)**: 结合 `manifest.json` 的静态注入和 `content.js` 的动态兜底注入，确保代码在页面 JS 执行前加载。
- **同步缓存 (Sync Cache)**: 插件后台轮询 Mock Server 获取最新权益，存入 `MOCK_CACHE`。当页面发起同步 XHR 请求（如余额检查）时，直接使用缓存数据修改响应，消除异步延迟。
- **WebSocket 拦截**: 自动解析并修改 `ACCOUNT_UPDATE` 推送消息，防止实时数据覆盖模拟数据。
- **智能代理 (Smart Proxy)**:
  - `/fapi/v2/positionRisk` -> 转发至 Mock Server
  - `/fapi/v1/userTrades` -> 转发至 Mock Server
  - `/fapi/v2/balance` -> 优先转发，失败则回退到本地修改

---

## ✅ 今日完成 (2025-01-26)

### 1. **第二代增量回放引擎 (Incremental Motor)**
- ✅ **极速流转**: 实现基于时间戳的增量数据下载与混淆，处理万级数据扫描从秒级降至毫秒级。
- ✅ **All-in-One 配置**: 引入统一策略配置文件，实现对冲参数与套利逻辑的单一控制点。
- ✅ **记忆化持久化**: 引入 `strategy_checkpoint` 机制，支持断电后信号流的无缝续接。

### 2. **高级规则抢占系统**
- ✅ **权威模式**: 通过 210/200/150 梯度优先级，实现手动指令对自动化脚本的绝对统治。
- ✅ **混合纠偏**: 修复了大价差混淆下的“两腿抵消”逻辑，确保测试场景 100% 触发有效信号。

---

> **当前状态**: ✅ **全链路增量套利闭环成功**，具备“脚本级控制+分钟级响应”的工业级模拟能力。
> **下一步**: 实现 OKX 交易所页面的全面适配，及多周期（4h/8h）资金费自动补齐。
