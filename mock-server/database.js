const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'mock_exchange.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT PRIMARY KEY,
    price REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    entry_price REAL NOT NULL,
    size REAL NOT NULL,
    margin REAL NOT NULL,
    side TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL,
    client_order_id TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    qty REAL NOT NULL,
    commission REAL NOT NULL,
    commission_asset TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
`);

module.exports = {
    // Price operations
    upsertPrice: (symbol, price) => {
        const stmt = db.prepare('INSERT OR REPLACE INTO prices (symbol, price, updated_at) VALUES (?, ?, ?)');
        return stmt.run(symbol, price, Date.now());
    },
    getPrices: () => {
        return db.prepare('SELECT * FROM prices').all();
    },

    // Position operations
    upsertPosition: (symbol, entryPrice, size, margin, side) => {
        const stmt = db.prepare('INSERT OR REPLACE INTO positions (symbol, entry_price, size, margin, side, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        return stmt.run(symbol, entryPrice, size, margin, side, Date.now());
    },
    deletePosition: (symbol) => {
        const stmt = db.prepare('DELETE FROM positions WHERE symbol = ?');
        return stmt.run(symbol);
    },
    getPositions: () => {
        return db.prepare('SELECT * FROM positions').all();
    },

    // Order operations
    insertOrder: (order) => {
        const stmt = db.prepare(`
      INSERT INTO orders (id, symbol, side, quantity, price, status, client_order_id, timestamp)
      VALUES (@id, @symbol, @side, @quantity, @price, @status, @clientOrderId, @timestamp)
    `);
        return stmt.run(order);
    },
    getOrders: () => {
        return db.prepare('SELECT * FROM orders ORDER BY timestamp DESC').all();
    },

    // Trade operations
    insertTrade: (trade) => {
        const stmt = db.prepare(`
      INSERT INTO trades (id, order_id, symbol, side, price, qty, commission, commission_asset, timestamp)
      VALUES (@id, @orderId, @symbol, @side, @price, @qty, @commission, @commissionAsset, @timestamp)
    `);
        return stmt.run(trade);
    },
    getTrades: () => {
        return db.prepare('SELECT * FROM trades ORDER BY timestamp DESC').all();
    }
};
