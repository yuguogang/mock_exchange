# Funding 状态机测试任务清单

> **目标**: 实现基于状态机的资金费率对冲逻辑，消除重复信号，实现一开一平配对，并同步 Mock Server 采用状态。
> **测试场景**: 16:00 达到开仓阈值 (>30%)，17:00 达到平仓阈值 (<10%)。

---

## 🎯 改进目标
1. **信号去重**: 同一会话内只允许一个 OPEN 和一个 CLOSE 信号。
2. **生命周期追踪**: 引入 `SessionID` 串联开平仓及其间的结算。
3. **状态持久化/同步**: 通过查询 Mock Server 持仓状态决定初始状态，支持断线重连/重启不重开。

---

## 📋 任务列表

### Phase 7: 状态机与会话机制 (Implementation)

#### Task 7.1: 引入状态机逻辑
**目标**: 将“条件触发”改为“状态驱动”。
**改动点**: 
- `strategy_funding.js`: 增加 `currentState` (IDLE, HOLDING)。
- **逻辑**: 如果 `currentState === 'HOLDING'`, 跳过 `absSpread > SPREAD_TRIGGER_OPEN` 的检测。

**验证**:
```bash
# 模拟命令
node strategy_funding.js ...
# 预期: 在 16:00 时段的一长串高费率期间，日志中只出现一次 "OPEN SIGNAL"
```

---

#### Task 7.2: 实现 SessionID 与配对输出
**目标**: 确保开平仓信号一一对应。
**具体要求**:
- `OPEN` 信号生成 `session_id: "ARB_TRX_1768..."` (前缀+时间戳)。
- 后续 `SETTLE` 和 `CLOSE` 信号必须携带相同的 `session_id`。

**验证**:
```bash
# 查看信号文件
grep "session_id" signals/funding_signals_TRXUSDT.json | uniq -c
# 预期: 每个 ID 对应的 OPEN 和 CLOSE 数量为 1
```

---

#### Task 7.3: 增加 Mock Server 持仓同步 (Adopted Status)
**目标**: 防止冷启动时重复下单。
**逻辑**:
1. 脚本启动时，先调用 `GET http://localhost:3000/mock/position`。
2. 如果存在 TRX 相关持仓且方向对冲，则 `currentState = 'HOLDING'`。
3. 对生成的信号标记 `"status": "adopted"`。

---

#### Task 7.4: 16:00-17:00 专项测试
**目标**: 验证 16:00 开，17:00 关的闭环。

**1. 修改 Mixer 配置 (`config/mixer/demo_mix_trx_okx_binance.json`)**:
- **高费率时段**: 15:50 - 16:50 (Scale: 5.0, 触发 >30%)
- **费率回落时段**: 16:50 - 17:10 (Scale: 0.1, 降低至触发 <10%)

**2. 运行流水线**:
```bash
# 执行完整流程
node download_data.js --config=...
node mixer_dynamic.js
node strategy_funding.js --config=...
```

**自我验证标准**:
- [ ] 信号文件中 16:00 只有一个 `type: "OPEN"`。
- [ ] 信号文件中 17:00 只有一个 `type: "CLOSE"`。
- [ ] 两者拥有相同的 `session_id`。
- [ ] 如果期间有 16:00, 16:08 等多个数据点，中间仅为 `SETTLE`。

---

## 📊 进度追踪 (Phase 7)

| Task ID | 任务名称 | 状态 | 完成日期 |
|---------|----------|------|----------|
| 7.1 | 引入状态机逻辑 | ⬜ 待开始 | - |
| 7.2 | SessionID 机制 | ⬜ 待开始 | - |
| 7.3 | Mock Server 同步 | ⬜ 待开始 | - |
| 7.4 | 16-17点闭环测试 | ⬜ 待开始 | - |

---

## 💡 提示
可以通过修改 `.env` 中的 `LOG_LEVEL=debug` 来观察状态机跳转细节。
