import sqlite3
import os
from werkzeug.security import generate_password_hash

DATABASE = os.path.join(os.path.dirname(__file__), 'hokiapp.db')


def get_db():
    """Get a database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def query_db(query, args=(), one=False):
    """Execute a SELECT query and return results."""
    conn = get_db()
    try:
        cur = conn.execute(query, args)
        rv = cur.fetchall()
        return (rv[0] if rv else None) if one else rv
    finally:
        conn.close()


def execute_db(query, args=()):
    """Execute an INSERT/UPDATE/DELETE query and return lastrowid."""
    conn = get_db()
    try:
        cur = conn.execute(query, args)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def init_db():
    """Initialize the database with schema and seed data."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.executescript("""
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'kasir')),
                nama_lengkap TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon TEXT DEFAULT 'category'
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                stock_qty INTEGER DEFAULT 0,
                stock_unit TEXT DEFAULT 'porsi',
                low_stock_threshold INTEGER DEFAULT 5,
                image_path TEXT,
                is_available INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_code TEXT NOT NULL UNIQUE,
                cashier_id INTEGER REFERENCES users(id),
                subtotal REAL NOT NULL DEFAULT 0,
                tax_amount REAL DEFAULT 0,
                total REAL NOT NULL DEFAULT 0,
                payment_method TEXT CHECK(payment_method IN ('tunai', 'qris', 'transfer', NULL)),
                amount_paid REAL DEFAULT 0,
                change_amount REAL DEFAULT 0,
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                paid_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS transaction_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
                product_name TEXT NOT NULL,
                product_price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                subtotal REAL NOT NULL,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.commit()

        # Seed users if not exist
        existing_users = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing_users == 0:
            users = [
                ('admin', generate_password_hash('hoki2024'), 'admin', 'Administrator'),
                ('kasir', generate_password_hash('kasir123'), 'kasir', 'Kasir Utama'),
            ]
            cursor.executemany(
                "INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, ?, ?)",
                users
            )

        # Seed categories if not exist
        existing_cats = cursor.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if existing_cats == 0:
            cats = [
                ('Ayam', 'set_meal'),
                ('Bebek', 'egg_alt'),
                ('Lele', 'water'),
                ('Minuman', 'local_cafe'),
                ('Lainnya', 'restaurant'),
            ]
            cursor.executemany("INSERT INTO categories (name, icon) VALUES (?, ?)", cats)

        # Seed products if not exist
        existing_prods = cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if existing_prods == 0:
            # Get category IDs
            ayam_id = cursor.execute("SELECT id FROM categories WHERE name='Ayam'").fetchone()[0]
            bebek_id = cursor.execute("SELECT id FROM categories WHERE name='Bebek'").fetchone()[0]
            lele_id = cursor.execute("SELECT id FROM categories WHERE name='Lele'").fetchone()[0]
            minum_id = cursor.execute("SELECT id FROM categories WHERE name='Minuman'").fetchone()[0]
            lain_id = cursor.execute("SELECT id FROM categories WHERE name='Lainnya'").fetchone()[0]

            products = [
                (ayam_id, 'Ayam Penyet Special', 25000, 20, 'porsi', 5, None, 1),
                (ayam_id, 'Ayam Goreng Biasa', 20000, 15, 'porsi', 5, None, 1),
                (ayam_id, 'Ayam Bakar Madu', 28000, 10, 'porsi', 5, None, 1),
                (bebek_id, 'Bebek Goreng', 35000, 8, 'ekor', 3, None, 1),
                (bebek_id, 'Bebek Penyet', 35000, 6, 'ekor', 3, None, 1),
                (lele_id, 'Lele Goreng', 18000, 20, 'ekor', 5, None, 1),
                (lele_id, 'Lele Penyet', 18000, 15, 'ekor', 5, None, 1),
                (minum_id, 'Es Teh Manis', 5000, 50, 'gelas', 10, None, 1),
                (minum_id, 'Es Jeruk', 8000, 30, 'gelas', 10, None, 1),
                (minum_id, 'Es Teh Tawar', 3000, 50, 'gelas', 10, None, 1),
                (minum_id, 'Air Mineral', 5000, 30, 'botol', 10, None, 1),
                (lain_id, 'Nasi Putih', 5000, 50, 'porsi', 10, None, 1),
                (lain_id, 'Tahu Tempe', 8000, 25, 'porsi', 8, None, 1),
            ]
            cursor.executemany(
                "INSERT INTO products (category_id, name, price, stock_qty, stock_unit, low_stock_threshold, image_path, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                products
            )

        # Seed settings if not exist
        existing_settings = cursor.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
        if existing_settings == 0:
            default_settings = [
                ('nama_usaha', 'Warung Penyetan dan Es Teh Hoki'),
                ('alamat', 'Jl. Raya No. 1, Surabaya, Jawa Timur'),
                ('telepon', '0812-3456-7890'),
                ('email', 'admin@penyetanhoki.com'),
                ('tax_rate', '10'),
                ('tax_enabled', '1'),
                ('receipt_footer', 'Terima kasih atas kunjungan Anda!\nFollow IG kami: @penyetanhoki'),
            ]
            cursor.executemany("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", default_settings)

        conn.commit()
        print("[DB] Database initialized successfully.")
    except Exception as e:
        conn.rollback()
        print(f"[DB] Error initializing database: {e}")
        raise
    finally:
        conn.close()


def get_next_order_code():
    """Generate the next order code like ORD-001."""
    result = query_db(
        "SELECT order_code FROM transactions ORDER BY id DESC LIMIT 1",
        one=True
    )
    if result:
        last_code = result['order_code']
        num = int(last_code.split('-')[1]) + 1
    else:
        num = 1
    return f"ORD-{num:03d}"


if __name__ == '__main__':
    init_db()
