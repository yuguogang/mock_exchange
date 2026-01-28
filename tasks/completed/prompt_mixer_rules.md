目标
- 在 `replay-bot/data` 原始数据基础上，通过“分段混合器”按中国时区（UTC+8）定义时间段与规则，调整资金费率与价格/价差，输出可审计、可复现的混合数据副本。

输入
- 原始数据文件：`data/<exchange>_<symbol>.json`（行情 `{ ts, price }`），`data/<exchange>_funding_<symbol>.json`（资金费 `{ ts, rate }`）。
- 混合计划：`config/mixer/<mixer_name>.json|yml`，包含多个时间段段（segments）与每段的规则（ops）。
- 目标 legs：通过对冲配置选择需要混合的 `exchange/symbol` 与指标（`metrics: [funding|price]`）。

时间段与时区
- `start_local` / `end_local`：字符串格式 `YYYY-MM-DD HH:mm`，解释为 Asia/Shanghai（UTC+8）。
- 转换与命中：将本地时间转换为 UTC 毫秒后进行命中；建议区间采用“包含开始、排除结束”的半开区间以避免边界重叠。
- 段优先级：避免重叠；如需重叠，必须定义 `priority`，按优先级或后置覆盖生效。

规则（ops）使用说明
- funding.rate 规则：
  - `scale`: 将资金费率乘以系数。例：`scale: 1.3` 表示上调 30%。
  - `offset`: 在资金费率上加固定偏移（可正可负）。例：`offset: 0.0001`。
  - `clamp`: 对结果进行范围裁剪，形如 `{ min: -0.005, max: 0.005 }`，避免极端值。
  - 执行顺序：按定义顺序依次应用（先 `scale` → `offset` → `clamp`）。
- price/价差 规则：
  - `price_scale`: 将目标腿的价格乘以系数。例：`price_scale: 1.02`。
  - `price_offset`: 在目标腿价格上加固定偏移（单位同价格）。例：`price_offset: 0.001`。
  - `target_spread_pct`: 在两腿对齐点上设定目标价差百分比（基于另一腿价格）。例：`target_spread_pct: +0.0015`（+0.15%）。新价：`new_price_target = ref_price * (1 + spread_pct)`。
  - `noise`: 叠加噪声以模拟真实波动。示例参数：`type: gaussian | uniform`，`amplitude: 0.0005`，`seed: 42`。
  - 建议：仅在两腿对齐的同一时间戳上应用 `target_spread_pct`；独立对价格做变换可能导致信号失真。

匹配维度
- `target.exchange` 与 `target.symbol`：指定规则作用的腿。
- `target.metrics`: 选择作用的指标，`funding` 或 `price`，可同时选择。
- 容忍窗口（用于价差/价格对齐）：例如 `tolerance_ms: 30000`，在主腿时间点附近为次腿寻找最近点。

输出
- 目录：`data_mixed/<mixer_name>/`
- 文件：`<exchange>_<symbol>.json`（混合行情）、`<exchange>_funding_<symbol>.json`（混合资金费）。
- 审计信息：为每个输出生成伴随的说明（或在首部记录）：
  - 生效段列表、命中条数、时间覆盖范围。
  - funding 变更统计（原 vs 混合的分布直方图或摘要）。
  - price/spread 的抽样校验（目标价差的达标率与误差）。

验证
- 时间命中：每段的命中条数与时间覆盖范围与计划一致（转换到 UTC 毫秒后统计）。
- funding 值域：应用 `clamp` 后不越界；结果数值为合法浮点。
- 价差达标：抽样 N 组对齐点，混合后的 `spread_pct` 与目标相符（允许误差阈值，如 ±0.001%）。
- 增量保障：如果同名 `mixer_name` 已存在输出，应提供覆盖或幂等策略，避免重复叠加。

使用示例（文字描述）
- 段 A（2025-12-30 09:22 ～ 2026-01-10 18:00，UTC+8）：
  - 目标：OKX `TRX-USDT-SWAP` 的 `funding` 指标；规则：`scale: 1.3`，`clamp: [-0.005, 0.005]`。
  - 价差：对齐到 Binance 参考价，在命中点上设置 `target_spread_pct: +0.0015`（+0.15%）。
- 段 B（2026-01-10 ～ 2026-01-13，UTC+8）：
  - 目标：OKX `TRX-USDT-SWAP` 的 `funding`；规则：`scale: 1.5`（优先级高于段 A，且不重叠）。
  - 价差：设置 `target_spread_pct: -0.0010`（-0.10%）。

与现有流程的衔接
- `scheduler`：将数据源切换到 `data_mixed/<mixer_name>/`，确保信号与价差基于混合结果。
- `strategy_funding`：资金费数据来源切换到混合文件，使结算收益反映规则调整。
- `download_data`：保持拉取原始数据；混合器在其之上加工。

出厂条件
- 混合输出文件与审计信息生成完整；各段命中统计、达标验证通过；原始数据保持不变、混合副本可回滚与比对。

术语与约定
- 时区统一使用 Asia/Shanghai（UTC+8）；文中所有 `start_local/end_local` 均按此解释。
- `clamp` 为范围裁剪的正确术语（避免误写为 “clam”）。
- 价差百分比 `spread_pct` 定义为相对参考腿价格的百分比变动；目标值应用于两腿对齐后的同一时间点。

执行声明
- 本提示词为规范与验收说明，不包含可执行脚本；实施时请严格按“验证”与“出厂条件”逐项验收。
