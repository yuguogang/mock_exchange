目标
- 将策略从脚本常量迁移到“策略元配置”，支持命名与参数化；脚本读取配置执行成交/仓位与资金费结算，所有结果可验证。

输入
- 策略配置：`strategy_name`、`strategy_type: spread|funding_arbitrage`、`hedge_ref`、`params`、`outputs`
- spread 参数：开/平仓门槛、止盈/止损、订单规模、手续费假设、maker/taker 偏好
- funding 参数：年化计算方式、各腿结算方向（long 付/short 收）、开/平仓门槛、结算节奏

任务
- 加载策略配置并校验 `hedge_ref` 与两腿配置一致。
- spread：读取 `signals/hedge_signals_<name>.json`，按参数生成模拟成交与仓位快照，写入 `mock_data/`。
- funding：读取 `data/<exchange>_funding_<symbol>.json`，合并时间线，依据策略规则开/平仓与资金费结算；通过 Mock Server 注入订单与资金流水。
- 将 `strategy_name` 写入日志与注入的 `info/metadata`，便于审计。”

验证
- spread：`mock_data/binance_trades.json` 与 `mock_data/okx_trades.json` 条数与信号匹配；`binance_position.json` 与 `okx_position.json` 的净仓位与价格一致。
- funding：运行后 `GET /fapi/v1/income` 可见 `incomeType=FUNDING_FEE` 记录；`GET /fapi/v1/allOrders` 包含成对的开/平仓。
- 日志应包含策略参数、开平节点、累计收益。

出厂条件
- 所有配置项生效；输出文件和 Mock Server 端点均与策略期望一致；审计信息完整。
