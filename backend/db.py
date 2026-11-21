from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import get_database_path

BOOL_COLUMNS = frozenset({
    "is_active",
    "email_verified",
    "auto_renew",
    "is_indoor",
    "is_available",
    "is_recurring",
    "is_read",
})

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_login_otps (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  monthly_price_paise INTEGER NOT NULL,
  annual_price_paise INTEGER NOT NULL,
  court_discount_pct INTEGER NOT NULL,
  shop_discount_pct INTEGER NOT NULL,
  bar_discount_pct INTEGER NOT NULL,
  max_bookings_per_day INTEGER NOT NULL DEFAULT 2,
  free_hours_per_month INTEGER NOT NULL DEFAULT 0,
  allowed_start_hour INTEGER NOT NULL DEFAULT 6,
  allowed_end_hour INTEGER NOT NULL DEFAULT 22,
  max_age_years INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  member_code TEXT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  dob TEXT NOT NULL,
  photo_url TEXT,
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  credit_balance_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id),
  plan_id INTEGER NOT NULL REFERENCES membership_plans(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  price_paid_paise INTEGER NOT NULL,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  surface TEXT NOT NULL,
  hourly_rate_paise INTEGER NOT NULL,
  is_indoor INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT
);

CREATE TABLE IF NOT EXISTS court_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id INTEGER REFERENCES courts(id),
  block_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id INTEGER NOT NULL REFERENCES courts(id),
  member_id INTEGER REFERENCES members(id),
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  booking_type TEXT NOT NULL DEFAULT 'MEMBER',
  booking_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  plan_snapshot_code TEXT,
  base_amount_paise INTEGER NOT NULL,
  discount_amount_paise INTEGER NOT NULL DEFAULT 0,
  final_amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  payment_status TEXT NOT NULL DEFAULT 'PAID',
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_court_time ON bookings(court_id, start_ms, end_ms);
CREATE INDEX IF NOT EXISTS idx_bookings_member_date ON bookings(member_id, booking_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_court_start_active ON bookings(court_id, start_time) WHERE status != 'CANCELLED';

CREATE TABLE IF NOT EXISTS social_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  court_id INTEGER NOT NULL REFERENCES courts(id),
  sport TEXT NOT NULL,
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 8,
  price_per_head_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES social_sessions(id),
  member_id INTEGER REFERENCES members(id),
  guest_name TEXT,
  guest_phone TEXT,
  amount_paid_paise INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CARD',
  status TEXT NOT NULL DEFAULT 'JOINED',
  joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  brand TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  price_paise INTEGER NOT NULL,
  cost_price_paise INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL DEFAULT 5,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  size TEXT NOT NULL DEFAULT 'Standard',
  color TEXT NOT NULL DEFAULT 'Default',
  stock_qty INTEGER NOT NULL DEFAULT 0,
  price_override_paise INTEGER
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_cost_paise INTEGER,
  reference_type TEXT,
  reference_id INTEGER,
  reason TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  member_id INTEGER REFERENCES members(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  channel TEXT NOT NULL,
  fulfilment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLACED',
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  delivery_fee_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES shop_orders(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  line_total_paise INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES shop_orders(id),
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  delivery_notes TEXT,
  courier_name TEXT,
  tracking_code TEXT
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price_paise INTEGER NOT NULL,
  tax_rate_pct INTEGER NOT NULL DEFAULT 5,
  is_available INTEGER NOT NULL DEFAULT 1,
  prep_minutes INTEGER NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS bar_tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_number TEXT NOT NULL UNIQUE,
  zone TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'FREE',
  current_member_id INTEGER REFERENCES members(id),
  opened_at TEXT
);

CREATE TABLE IF NOT EXISTS tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  subtotal_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL DEFAULT 0,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS bar_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  table_id INTEGER REFERENCES bar_tables(id),
  member_id INTEGER REFERENCES members(id),
  tab_id INTEGER REFERENCES tabs(id),
  staff_user_id INTEGER REFERENCES users(id),
  kds_status TEXT NOT NULL DEFAULT 'NEW',
  billing_status TEXT NOT NULL DEFAULT 'UNPAID',
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  served_at TEXT
);

CREATE TABLE IF NOT EXISTS bar_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_order_id INTEGER NOT NULL REFERENCES bar_orders(id),
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  line_total_paise INTEGER NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_type TEXT NOT NULL,
  reference_id INTEGER NOT NULL,
  member_id INTEGER REFERENCES members(id),
  amount_paise INTEGER NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  received_by_user_id INTEGER REFERENCES users(id),
  paid_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id INTEGER,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  gst_number TEXT,
  billing_address TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL,
  member_id INTEGER REFERENCES members(id),
  client_id INTEGER REFERENCES clients(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  subtotal_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  tax_rate_pct INTEGER NOT NULL DEFAULT 18,
  line_total_paise INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  expense_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'PAID',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT NOT NULL,
  designation TEXT NOT NULL,
  monthly_salary_paise INTEGER NOT NULL,
  leave_balance_days INTEGER NOT NULL DEFAULT 18,
  join_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  shift_date TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  station TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT',
  overtime_minutes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_month TEXT NOT NULL UNIQUE,
  total_gross_paise INTEGER NOT NULL,
  total_deductions_paise INTEGER NOT NULL,
  total_net_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  processed_by_user_id INTEGER REFERENCES users(id),
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  base_salary_paise INTEGER NOT NULL,
  overtime_paise INTEGER NOT NULL DEFAULT 0,
  deductions_paise INTEGER NOT NULL DEFAULT 0,
  net_pay_paise INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL,
  interest TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  assigned_user_id INTEGER REFERENCES users(id),
  follow_up_date TEXT,
  converted_member_id INTEGER REFERENCES members(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  author_user_id INTEGER REFERENCES users(id),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT NOT NULL UNIQUE,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  plan_id INTEGER REFERENCES membership_plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'ANNUAL',
  quoted_amount_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  final_amount_paise INTEGER NOT NULL,
  valid_until TEXT NOT NULL,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_role TEXT,
  member_id INTEGER REFERENCES members(id),
  channel TEXT NOT NULL DEFAULT 'IN_APP',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""


def snake_to_camel(name: str) -> str:
    if "_" not in name:
        return name
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:] if p)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    out: dict[str, Any] = {}
    for col in row.keys():
        val = row[col]
        if col in BOOL_COLUMNS and val is not None:
            val = bool(val)
        out[snake_to_camel(col)] = val
    return out


class Database:
    def __init__(self, db_path: str | None = None):
        target = db_path or get_database_path()
        if target != ":memory:":
            Path(target).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = target
        self.conn = sqlite3.connect(
            target,
            isolation_level=None,
            check_same_thread=False,
            timeout=15.0,
        )
        self.conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._tx_depth = 0
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA busy_timeout = 5000;")

    def close(self) -> None:
        with self._lock:
            self.conn.close()

    @contextmanager
    def immediate_tx(self) -> Iterator[None]:
        with self._lock:
            is_outer = self._tx_depth == 0
            if is_outer:
                self.conn.execute("BEGIN IMMEDIATE")
            self._tx_depth += 1
            try:
                yield
            except Exception:
                self._tx_depth -= 1
                if is_outer:
                    try:
                        self.conn.execute("ROLLBACK")
                    except sqlite3.Error:
                        pass
                raise
            else:
                self._tx_depth -= 1
                if is_outer:
                    self.conn.execute("COMMIT")

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            return self.conn.execute(sql, params)

    def fetch_one(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> dict[str, Any] | None:
        with self._lock:
            cur = self.conn.execute(sql, params)
            return row_to_dict(cur.fetchone())

    def fetch_all(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> list[dict[str, Any]]:
        with self._lock:
            cur = self.conn.execute(sql, params)
            return [row_to_dict(r) for r in cur.fetchall() if r is not None]

    def insert_returning(
        self, sql: str, params: tuple[Any, ...] | list[Any] = ()
    ) -> dict[str, Any]:
        with self._lock:
            cur = self.conn.execute(sql, params)
            row = row_to_dict(cur.fetchone())
            if row is None:
                raise RuntimeError("INSERT RETURNING did not yield a row")
            return row

    def exec_script(self, script: str) -> None:
        with self._lock:
            self.conn.executescript(script)


_default_db: Database | None = None
_default_db_lock = threading.Lock()


def get_db() -> Database:
    global _default_db
    if _default_db is None:
        with _default_db_lock:
            if _default_db is None:
                _default_db = Database()
    return _default_db


def create_db_connection(db_path: str = ":memory:") -> Database:
    db = Database(db_path)
    run_migrations(db)
    return db


def run_migrations(db: Database | None = None) -> None:
    target = db or get_db()
    target.exec_script(SCHEMA_SQL)
    user_columns = target.fetch_all("PRAGMA table_info(users)")
    if not any(column["name"] == "email_verified" for column in user_columns):
        target.execute(
            "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1"
        )
    target.execute("PRAGMA foreign_keys = ON;")


if __name__ == "__main__":
    run_migrations()
    print("Database migrations applied successfully.")
