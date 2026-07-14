import sqlite3
import os
import base64
from werkzeug.security import generate_password_hash

DATABASE = os.path.join(os.path.dirname(__file__), 'hokiapp.db')


def get_db():
    """Get a database connection."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
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


def migrate_db(conn):
    """Run schema migrations for existing databases."""
    cursor = conn.cursor()

    # Check and add image_data column to products (replaces image_path)
    cols = [row[1] for row in cursor.execute("PRAGMA table_info(products)").fetchall()]
    if 'image_data' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN image_data TEXT")
        print("[DB] Migration: Added image_data column to products")

    # Check and add description column to products
    if 'description' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN description TEXT")
        print("[DB] Migration: Added description column to products")

    # Check and add discount column to products
    if 'discount_pct' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN discount_pct REAL DEFAULT 0")
        print("[DB] Migration: Added discount_pct column to products")

    # Check and add hpp (harga pokok penjualan) column
    if 'hpp' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN hpp REAL DEFAULT 0")
        print("[DB] Migration: Added hpp column to products")

    if 'is_featured' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0")
        print("[DB] Migration: Added is_featured column to products")

    if 'updated_at' not in cols:
        cursor.execute("ALTER TABLE products ADD COLUMN updated_at DATETIME")
        print("[DB] Migration: Added updated_at column to products")

    # Check and add sort_order to categories
    cat_cols = [row[1] for row in cursor.execute("PRAGMA table_info(categories)").fetchall()]
    if 'sort_order' not in cat_cols:
        cursor.execute("ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0")
        print("[DB] Migration: Added sort_order column to categories")
    if 'description' not in cat_cols:
        cursor.execute("ALTER TABLE categories ADD COLUMN description TEXT")
        print("[DB] Migration: Added description column to categories")

    # Check and add customer_name to transactions
    txn_cols = [row[1] for row in cursor.execute("PRAGMA table_info(transactions)").fetchall()]
    if 'customer_name' not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN customer_name TEXT")
        print("[DB] Migration: Added customer_name column to transactions")
    if 'table_number' not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN table_number TEXT")
        print("[DB] Migration: Added table_number column to transactions")
    if 'discount_amount' not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN discount_amount REAL DEFAULT 0")
        print("[DB] Migration: Added discount_amount column to transactions")
    if 'cashier_name' not in txn_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN cashier_name TEXT")
        print("[DB] Migration: Added cashier_name column to transactions")

    # Check and add avatar_color to users
    user_cols = [row[1] for row in cursor.execute("PRAGMA table_info(users)").fetchall()]
    if 'avatar_color' not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT '#0d631b'")
        print("[DB] Migration: Added avatar_color column to users")

    # Check and add discount_pct to transaction_items
    txn_item_cols = [row[1] for row in cursor.execute("PRAGMA table_info(transaction_items)").fetchall()]
    if 'discount_pct' not in txn_item_cols:
        cursor.execute("ALTER TABLE transaction_items ADD COLUMN discount_pct REAL DEFAULT 0")
        print("[DB] Migration: Added discount_pct column to transaction_items")

    # Create laporan_notes table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS laporan_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tanggal TEXT NOT NULL,
            judul TEXT NOT NULL,
            isi TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create stock_history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            product_name TEXT NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('restock', 'sale', 'adjustment', 'initial')),
            qty_change INTEGER NOT NULL,
            qty_before INTEGER NOT NULL,
            qty_after INTEGER NOT NULL,
            notes TEXT,
            user_id INTEGER REFERENCES users(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()


def init_db():
    """Initialize the database with schema and seed data."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.executescript("""
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'kasir')),
                nama_lengkap TEXT,
                is_active INTEGER DEFAULT 1,
                pin TEXT,
                avatar_color TEXT DEFAULT '#0d631b',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon TEXT DEFAULT 'category',
                description TEXT,
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                hpp REAL DEFAULT 0,
                discount_pct REAL DEFAULT 0,
                stock_qty INTEGER DEFAULT 0,
                stock_unit TEXT DEFAULT 'porsi',
                low_stock_threshold INTEGER DEFAULT 5,
                image_data TEXT,
                is_available INTEGER DEFAULT 1,
                is_featured INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_code TEXT NOT NULL UNIQUE,
                cashier_id INTEGER REFERENCES users(id),
                cashier_name TEXT,
                customer_name TEXT,
                table_number TEXT,
                subtotal REAL NOT NULL DEFAULT 0,
                discount_amount REAL DEFAULT 0,
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
                discount_pct REAL DEFAULT 0,
                subtotal REAL NOT NULL,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS laporan_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tanggal TEXT NOT NULL,
                judul TEXT NOT NULL,
                isi TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS stock_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
                product_name TEXT NOT NULL,
                action TEXT NOT NULL CHECK(action IN ('restock', 'sale', 'adjustment', 'initial')),
                qty_change INTEGER NOT NULL,
                qty_before INTEGER NOT NULL,
                qty_after INTEGER NOT NULL,
                notes TEXT,
                user_id INTEGER REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()

        # Run migrations for existing databases
        migrate_db(conn)

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
                ('Ayam', 'set_meal', 'Menu ayam goreng dan penyet', 1),
                ('Bebek', 'egg_alt', 'Menu bebek goreng dan penyet', 2),
                ('Lele', 'water', 'Menu lele goreng dan penyet', 3),
                ('Minuman', 'local_cafe', 'Es teh, jus, dan minuman segar', 4),
                ('Lainnya', 'restaurant', 'Nasi, lauk, dan pelengkap', 5),
            ]
            cursor.executemany(
                "INSERT INTO categories (name, icon, description, sort_order) VALUES (?, ?, ?, ?)",
                cats
            )

        # Seed products if not exist
        existing_prods = cursor.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if existing_prods == 0:
            ayam_id  = cursor.execute("SELECT id FROM categories WHERE name='Ayam'").fetchone()[0]
            bebek_id = cursor.execute("SELECT id FROM categories WHERE name='Bebek'").fetchone()[0]
            lele_id  = cursor.execute("SELECT id FROM categories WHERE name='Lele'").fetchone()[0]
            minum_id = cursor.execute("SELECT id FROM categories WHERE name='Minuman'").fetchone()[0]
            lain_id  = cursor.execute("SELECT id FROM categories WHERE name='Lainnya'").fetchone()[0]

            products = [
                (ayam_id,  'Ayam Penyet Special', 'Ayam penyet dengan sambal spesial', 25000, 12000, 0, 20, 'porsi', 5, 1, 1),
                (ayam_id,  'Ayam Goreng Biasa',   'Ayam goreng crispy renyah',          20000, 10000, 0, 15, 'porsi', 5, 0, 1),
                (ayam_id,  'Ayam Bakar Madu',      'Ayam bakar dengan olesan madu',       28000, 14000, 0, 10, 'porsi', 5, 0, 1),
                (bebek_id, 'Bebek Goreng',          'Bebek goreng garing',                35000, 18000, 0,  8, 'ekor',  3, 0, 1),
                (bebek_id, 'Bebek Penyet',           'Bebek penyet sambal hijau',          35000, 18000, 0,  6, 'ekor',  3, 0, 1),
                (lele_id,  'Lele Goreng',            'Lele goreng gurih',                 18000,  8000, 0, 20, 'ekor',  5, 0, 1),
                (lele_id,  'Lele Penyet',            'Lele penyet sambal bawang',         18000,  8000, 0, 15, 'ekor',  5, 0, 1),
                (minum_id, 'Es Teh Manis',           'Es teh manis segar',                5000,  1500, 0, 50, 'gelas', 10, 1, 1),
                (minum_id, 'Es Jeruk',               'Es jeruk peras asli',               8000,  2000, 0, 30, 'gelas', 10, 0, 1),
                (minum_id, 'Es Teh Tawar',           'Es teh tawar tanpa gula',           3000,  1000, 0, 50, 'gelas', 10, 0, 1),
                (minum_id, 'Air Mineral',             'Air mineral botol 600ml',           5000,  2000, 0, 30, 'botol', 10, 0, 1),
                (lain_id,  'Nasi Putih',              'Nasi putih pulen',                  5000,  2000, 0, 50, 'porsi', 10, 0, 1),
                (lain_id,  'Tahu Tempe',              'Tahu tempe goreng',                 8000,  3000, 0, 25, 'porsi',  8, 0, 1),
            ]
            cursor.executemany(
                """INSERT INTO products 
                   (category_id, name, description, price, hpp, discount_pct, stock_qty, stock_unit,
                    low_stock_threshold, is_featured, is_available)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                products
            )

        # Seed settings if not exist
        existing_settings = cursor.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
        if existing_settings == 0:
            default_settings = [
                # Store profile
                ('nama_usaha',         'Warung Penyetan dan Es Teh Hoki'),
                ('alamat',             'Jl. Raya No. 1, Surabaya, Jawa Timur'),
                ('telepon',            '0812-3456-7890'),
                ('email',              'admin@penyetanhoki.com'),
                # Tax
                ('tax_rate',           '10'),
                ('tax_enabled',        '1'),
                # Receipt
                ('receipt_footer',     'Terima kasih atas kunjungan Anda!\nFollow IG kami: @penyetanhoki'),
                # Bank transfer info
                ('bank_name',          ''),
                ('bank_account',       ''),
                ('bank_holder',        ''),
                # Features
                ('table_number_enabled',        '1'),
                ('customer_name_enabled',       '1'),
                ('split_bill_enabled',          '0'),
                ('discount_enabled',            '1'),
                ('auto_print_receipt',          '0'),
                ('low_stock_notification',      '1'),
                # UI
                ('theme',                       'light'),
                ('currency_symbol',             'Rp'),
                ('currency_position',           'before'),
                # Media (stored as base64)
                ('logo_data',                   ''),
                ('banner_data',                 ''),
                ('qris_data',                   ''),
            ]
            cursor.executemany(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                default_settings
            )
        else:
            # Add new settings keys if they don't exist
            new_keys = [
                ('table_number_enabled',   '1'),
                ('customer_name_enabled',  '1'),
                ('split_bill_enabled',     '0'),
                ('discount_enabled',       '1'),
                ('auto_print_receipt',     '0'),
                ('low_stock_notification', '1'),
                ('theme',                  'light'),
                ('currency_symbol',        'Rp'),
                ('currency_position',      'before'),
                ('logo_data',              ''),
                ('banner_data',            ''),
                ('qris_data',              ''),
                ('bank_name',              ''),
                ('bank_account',           ''),
                ('bank_holder',            ''),
            ]
            for key, val in new_keys:
                cursor.execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                    (key, val)
                )

        conn.commit()
        print("[DB] Database initialized successfully.")
    except Exception as e:
        conn.rollback()
        print(f"[DB] Error initializing database: {e}")
        raise
    finally:
        conn.close()


def get_next_order_code():
    """Generate the next order code like ORD-0001."""
    result = query_db("SELECT COUNT(*) as cnt FROM transactions", one=True)
    num = (result['cnt'] if result else 0) + 1
    return f"ORD-{num:04d}"


def encode_image(file_obj, max_size=(800, 800)):
    """Encode an uploaded image file to base64, resizing if needed."""
    try:
        from PIL import Image
        import io
        img = Image.open(file_obj)
        # Convert to RGB if needed (e.g. PNG with alpha)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        # Resize if too large
        img.thumbnail(max_size, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        buf.seek(0)
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        return f"data:image/jpeg;base64,{encoded}"
    except ImportError:
        # Fallback without Pillow: just encode directly
        file_obj.seek(0)
        raw = file_obj.read()
        encoded = base64.b64encode(raw).decode('utf-8')
        # Detect mime type from magic bytes
        if raw[:4] == b'\x89PNG':
            mime = 'image/png'
        elif raw[:3] in (b'GIF', b'gif'):
            mime = 'image/gif'
        else:
            mime = 'image/jpeg'
        return f"data:{mime};base64,{encoded}"


if __name__ == '__main__':
    init_db()
