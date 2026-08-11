import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS rule_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      drawdown_type TEXT NOT NULL CHECK (drawdown_type IN ('trailing', 'static')),
      drawdown_amount REAL NOT NULL,
      daily_loss_limit REAL,
      consistency_percent REAL,
      min_trading_days INTEGER,
      profit_target REAL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      starting_balance REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK (status IN ('evaluation', 'funded', 'failed')),
      rule_profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      instrument TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('long', 'short')),
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT NOT NULL,
      size REAL NOT NULL,
      pnl REAL NOT NULL,
      r_multiple REAL,
      notes TEXT,
      screenshot_paths TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS trade_tags (
      trade_id INTEGER NOT NULL REFERENCES trades(id),
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      PRIMARY KEY (trade_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
    CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
  `)
}
