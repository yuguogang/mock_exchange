-- 交易所感知的mock-server数据库schema

-- 核心数据表（交易所无关的统一格式）
CREATE TABLE IF NOT EXISTS core_positions (
    id TEXT PRIMARY KEY,
    exchange TEXT NOT NULL, -- 'binance' | 'okx' | 'bybit'
    symbol TEXT NOT NULL,
    side TEXT NOT NULL, -- 'LONG' | 'SHORT'
    quantity REAL NOT NULL,
    entry_price REAL NOT NULL,
    mark_price REAL,
    unrealized_pnl REAL,
    margin REAL NOT NULL,
    leverage INTEGER DEFAULT 10,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS core_orders (
    id TEXT PRIMARY KEY,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL, -- 'BUY' | 'SELL'
    type TEXT DEFAULT 'MARKET', -- 'MARKET' | 'LIMIT' | 'STOP'
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL, -- 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED'
    client_order_id TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS core_trades (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    quantity REAL NOT NULL,
    fee REAL DEFAULT 0,
    fee_asset TEXT DEFAULT 'USDT',
    realized_pnl REAL DEFAULT 0,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY(order_id) REFERENCES core_orders(id)
);

CREATE TABLE IF NOT EXISTS core_transactions (
    id TEXT PRIMARY KEY,
    exchange TEXT NOT NULL,
    type TEXT NOT NULL, -- 'FUNDING_FEE' | 'TRADING_FEE' | 'REALIZED_PNL' | 'TRANSFER'
    symbol TEXT,
    asset TEXT NOT NULL,
    amount REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    info TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 价格表（按交易所分别存储）
CREATE TABLE IF NOT EXISTS exchange_prices (
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (exchange, symbol)
);

-- 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_core_positions_exchange ON core_positions(exchange);
CREATE INDEX IF NOT EXISTS idx_core_positions_symbol ON core_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_core_orders_exchange ON core_orders(exchange);
CREATE INDEX IF NOT EXISTS idx_core_orders_symbol ON core_orders(symbol);
CREATE INDEX IF NOT EXISTS idx_core_trades_exchange ON core_trades(exchange);
CREATE INDEX IF NOT EXISTS idx_core_trades_symbol ON core_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_core_transactions_exchange ON core_transactions(exchange);
CREATE INDEX IF NOT EXISTS idx_core_transactions_type ON core_transactions(type);
CREATE INDEX IF NOT EXISTS idx_exchange_prices_exchange ON exchange_prices(exchange);
CREATE INDEX IF NOT EXISTS idx_exchange_prices_symbol ON exchange_prices(symbol);