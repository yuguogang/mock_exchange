const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'mock_exchange.db');
const db = new Database(dbPath);

// Initialize exchange-aware schema
db.exec(`
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
`);

// Exchange-aware database operations
module.exports = {
    // Core Position operations with exchange filtering
    upsertCorePosition: (position) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO core_positions 
            (id, exchange, symbol, side, quantity, entry_price, mark_price, unrealized_pnl, margin, leverage, timestamp, updated_at)
            VALUES (@id, @exchange, @symbol, @side, @quantity, @entryPrice, @markPrice, @unrealizedPnl, @margin, @leverage, @timestamp, @updatedAt)
        `);
        return stmt.run(position);
    },

    getCorePositions: (filters = {}) => {
        let query = 'SELECT * FROM core_positions WHERE 1=1';
        const params = {};
        
        if (filters.exchange) {
            query += ' AND exchange = @exchange';
            params.exchange = filters.exchange;
        }
        if (filters.symbol) {
            query += ' AND symbol = @symbol';
            params.symbol = filters.symbol;
        }
        if (filters.side) {
            query += ' AND side = @side';
            params.side = filters.side;
        }
        
        query += ' ORDER BY updated_at DESC';
        if (filters.limit) {
            query += ' LIMIT @limit';
            params.limit = filters.limit;
        }
        
        const stmt = db.prepare(query);
        return stmt.all(params);
    },

    deleteCorePosition: (id, exchange) => {
        const stmt = db.prepare('DELETE FROM core_positions WHERE id = @id AND exchange = @exchange');
        return stmt.run({ id, exchange });
    },

    // Core Order operations with exchange filtering
    insertCoreOrder: (order) => {
        const stmt = db.prepare(`
            INSERT INTO core_orders 
            (id, exchange, symbol, side, type, quantity, price, status, client_order_id, timestamp, created_at)
            VALUES (@id, @exchange, @symbol, @side, @type, @quantity, @price, @status, @clientOrderId, @timestamp, @createdAt)
        `);
        return stmt.run(order);
    },

    getCoreOrders: (filters = {}) => {
        let query = 'SELECT * FROM core_orders WHERE 1=1';
        const params = {};
        
        if (filters.exchange) {
            query += ' AND exchange = @exchange';
            params.exchange = filters.exchange;
        }
        if (filters.symbol) {
            query += ' AND symbol = @symbol';
            params.symbol = filters.symbol;
        }
        if (filters.side) {
            query += ' AND side = @side';
            params.side = filters.side;
        }
        if (filters.status) {
            query += ' AND status = @status';
            params.status = filters.status;
        }
        
        query += ' ORDER BY timestamp DESC';
        if (filters.limit) {
            query += ' LIMIT @limit';
            params.limit = filters.limit;
        }
        
        const stmt = db.prepare(query);
        return stmt.all(params);
    },

    // Core Trade operations with exchange filtering
    insertCoreTrade: (trade) => {
        const stmt = db.prepare(`
            INSERT INTO core_trades 
            (id, order_id, exchange, symbol, side, price, quantity, fee, fee_asset, realized_pnl, timestamp, created_at)
            VALUES (@id, @orderId, @exchange, @symbol, @side, @price, @quantity, @fee, @feeAsset, @realizedPnl, @timestamp, @createdAt)
        `);
        return stmt.run(trade);
    },

    getCoreTrades: (filters = {}) => {
        let query = 'SELECT * FROM core_trades WHERE 1=1';
        const params = {};
        
        if (filters.exchange) {
            query += ' AND exchange = @exchange';
            params.exchange = filters.exchange;
        }
        if (filters.symbol) {
            query += ' AND symbol = @symbol';
            params.symbol = filters.symbol;
        }
        if (filters.side) {
            query += ' AND side = @side';
            params.side = filters.side;
        }
        if (filters.orderId) {
            query += ' AND order_id = @orderId';
            params.orderId = filters.orderId;
        }
        
        query += ' ORDER BY timestamp DESC';
        if (filters.limit) {
            query += ' LIMIT @limit';
            params.limit = filters.limit;
        }
        
        const stmt = db.prepare(query);
        return stmt.all(params);
    },

    // Core Transaction operations with exchange filtering
    insertCoreTransaction: (transaction) => {
        const stmt = db.prepare(`
            INSERT INTO core_transactions 
            (id, exchange, type, symbol, asset, amount, timestamp, info, created_at)
            VALUES (@id, @exchange, @type, @symbol, @asset, @amount, @timestamp, @info, @createdAt)
        `);
        return stmt.run(transaction);
    },

    getCoreTransactions: (filters = {}) => {
        let query = 'SELECT * FROM core_transactions WHERE 1=1';
        const params = {};
        
        if (filters.exchange) {
            query += ' AND exchange = @exchange';
            params.exchange = filters.exchange;
        }
        if (filters.type) {
            query += ' AND type = @type';
            params.type = filters.type;
        }
        if (filters.symbol) {
            query += ' AND symbol = @symbol';
            params.symbol = filters.symbol;
        }
        if (filters.startTime) {
            query += ' AND timestamp >= @startTime';
            params.startTime = filters.startTime;
        }
        if (filters.endTime) {
            query += ' AND timestamp <= @endTime';
            params.endTime = filters.endTime;
        }
        
        query += ' ORDER BY timestamp DESC';
        if (filters.limit) {
            query += ' LIMIT @limit';
            params.limit = filters.limit;
        }
        
        const stmt = db.prepare(query);
        return stmt.all(params);
    },

    // Exchange-specific price operations
    upsertExchangePrice: (exchange, symbol, price) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO exchange_prices (exchange, symbol, price, updated_at)
            VALUES (@exchange, @symbol, @price, @updatedAt)
        `);
        return stmt.run({ exchange, symbol, price, updatedAt: Date.now() });
    },

    getExchangePrice: (exchange, symbol) => {
        const stmt = db.prepare('SELECT price FROM exchange_prices WHERE exchange = @exchange AND symbol = @symbol');
        const result = stmt.get({ exchange, symbol });
        return result ? result.price : null;
    },

    getExchangePrices: (exchange) => {
        const stmt = db.prepare('SELECT symbol, price FROM exchange_prices WHERE exchange = @exchange');
        return stmt.all({ exchange });
    },

    // Migration helpers for existing data
    migrateFromLegacySchema: () => {
        console.log('🔧 Starting database migration to exchange-aware schema...');
        
        // Check if legacy tables exist
        const legacyTables = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name IN ('positions', 'orders', 'trades', 'prices')
        `).all();
        
        if (legacyTables.length === 0) {
            console.log('✅ No legacy tables found, migration not needed');
            return;
        }

        console.log(`📊 Found ${legacyTables.length} legacy tables to migrate`);

        try {
            // Migrate positions (assume binance for existing data)
            const legacyPositions = db.prepare('SELECT * FROM positions').all();
            for (const pos of legacyPositions) {
                const corePosition = {
                    id: `legacy_${pos.symbol}_binance`,
                    exchange: 'binance',
                    symbol: pos.symbol,
                    side: pos.side,
                    quantity: pos.size,
                    entryPrice: pos.entry_price,
                    markPrice: pos.entry_price, // Use entry price as mark price
                    unrealizedPnl: 0,
                    margin: pos.margin,
                    leverage: 10,
                    timestamp: pos.updated_at,
                    updatedAt: pos.updated_at
                };
                this.upsertCorePosition(corePosition);
            }
            console.log(`✅ Migrated ${legacyPositions.length} positions`);

            // Migrate orders
            const legacyOrders = db.prepare('SELECT * FROM orders').all();
            for (const order of legacyOrders) {
                const coreOrder = {
                    id: order.id.toString(),
                    exchange: 'binance',
                    symbol: order.symbol,
                    side: order.side,
                    type: 'MARKET',
                    quantity: order.quantity,
                    price: order.price,
                    status: order.status,
                    clientOrderId: order.client_order_id,
                    timestamp: order.timestamp,
                    createdAt: order.timestamp
                };
                this.insertCoreOrder(coreOrder);
            }
            console.log(`✅ Migrated ${legacyOrders.length} orders`);

            // Migrate trades
            const legacyTrades = db.prepare('SELECT * FROM trades').all();
            for (const trade of legacyTrades) {
                const coreTrade = {
                    id: trade.id.toString(),
                    orderId: trade.order_id.toString(),
                    exchange: 'binance',
                    symbol: trade.symbol,
                    side: trade.side,
                    price: trade.price,
                    quantity: trade.qty,
                    fee: trade.commission,
                    feeAsset: trade.commission_asset,
                    realizedPnl: 0,
                    timestamp: trade.timestamp,
                    createdAt: trade.timestamp
                };
                this.insertCoreTrade(coreTrade);
            }
            console.log(`✅ Migrated ${legacyTrades.length} trades`);

            // Migrate prices
            const legacyPrices = db.prepare('SELECT * FROM prices').all();
            for (const price of legacyPrices) {
                this.upsertExchangePrice('binance', price.symbol, price.price);
            }
            console.log(`✅ Migrated ${legacyPrices.length} prices`);

            console.log('🎉 Database migration completed successfully!');
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    },

    // Statistics
    getStatistics: () => {
        const stats = {};
        
        // Count by exchange
        const exchanges = ['binance', 'okx'];
        for (const exchange of exchanges) {
            stats[exchange] = {
                positions: db.prepare('SELECT COUNT(*) as count FROM core_positions WHERE exchange = ?').get(exchange).count,
                orders: db.prepare('SELECT COUNT(*) as count FROM core_orders WHERE exchange = ?').get(exchange).count,
                trades: db.prepare('SELECT COUNT(*) as count FROM core_trades WHERE exchange = ?').get(exchange).count,
                transactions: db.prepare('SELECT COUNT(*) as count FROM core_transactions WHERE exchange = ?').get(exchange).count
            };
        }
        
        return stats;
    }
};