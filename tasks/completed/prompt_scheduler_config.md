目标
- 将两腿对冲重放从硬编码改为读取“对冲任务配置”，生成 `signals/hedge_signals_<name>.json`，并保证对齐与信号生成有验证与出厂条件。

输入
- 对冲配置：包含两条 legs（`exchange`、`symbol`、`role: legA|legB`、`fee_profile`、`contract_profile`）
- 对齐参数：`alignment.time_source`（主时间源）、`alignment.tolerance_ms`（容忍窗口）、`alignment.interval_source`（资金费间隔来源）
- 信号参数：`signal.spread_pct_thresholds`（门槛）、`signal.direction_rule`（谁贵做空谁）、`signal.cooldown_ms`（防抖）

任务
- 解析并校验对冲配置，确保两腿均启用、`exchange/symbol` 合法。
- 加载各腿行情 Kline 数据，统一毫秒时间戳，建立 `Map(ts -> price)`。
- 选择主时间源（如 `legA`），在 `tolerance_ms` 内匹配 `legB` 最近点；不匹配则跳过并记录日志。
- 计算价差与百分比，依据阈值与方向规则生成信号；包含元数据：`hedge_name`、两腿标识、价格、价差、百分比、策略来源。
- 写出 `signals/hedge_signals_<name>.json`。

验证
- 文件存在且非空；随机抽查 5 条信号，价差方向与百分比计算正确。
- 对齐统计：输出“总对齐条数/总源条数”，容忍窗口命中率应达到设定目标（样例 ≥90%）。
- 边界：当某腿数据缺失或时间错位，日志应说明并统计跳过比例。

出厂条件
- 信号文件生成并通过验证；日志包含对齐失败原因与比例。
