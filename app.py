import os
import json
from datetime import datetime, timedelta
from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, g, send_from_directory, send_file
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from database import init_db, query_db, execute_db, get_next_order_code

app = Flask(__name__)
app.secret_key = 'hokiapp-secret-key-2024-change-in-production'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'images')
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max upload

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def login_required(f):
    """Decorator to require login."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator to require admin role."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        if session.get('role') != 'admin':
            return jsonify({'error': 'Akses ditolak. Hanya admin yang dapat melakukan aksi ini.'}), 403
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        user = query_db(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            [username], one=True
        )
        
        if user and check_password_hash(user['password_hash'], password):
            session.clear()
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['role'] = user['role']
            session['nama_lengkap'] = user['nama_lengkap']
            session.permanent = True
            return redirect(url_for('dashboard'))
        else:
            error = 'Username atau password salah.'
    
    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ─────────────────────────────────────────────────────────────────────────────
# PAGE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')


@app.route('/kasir')
@login_required
def kasir():
    return render_template('kasir.html')


@app.route('/payment/<int:transaction_id>')
@login_required
def payment(transaction_id):
    txn = query_db("SELECT * FROM transactions WHERE id = ?", [transaction_id], one=True)
    if not txn:
        return redirect(url_for('kasir'))
    return render_template('payment.html', transaction_id=transaction_id)


@app.route('/stock')
@login_required
def stock():
    return render_template('stock.html')


@app.route('/settings')
@login_required
def settings():
    if session.get('role') != 'admin':
        return redirect(url_for('dashboard'))
    return render_template('settings.html')


# ─────────────────────────────────────────────────────────────────────────────
# API: CATEGORIES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['GET'])
@login_required
def api_categories():
    cats = query_db("SELECT * FROM categories ORDER BY name")
    return jsonify([dict(c) for c in cats])


@app.route('/api/categories', methods=['POST'])
@admin_required
def api_categories_create():
    data = request.json
    name = data.get('name', '').strip()
    icon = data.get('icon', 'category')
    if not name:
        return jsonify({'error': 'Nama kategori wajib diisi.'}), 400
    cat_id = execute_db("INSERT INTO categories (name, icon) VALUES (?, ?)", [name, icon])
    return jsonify({'id': cat_id, 'name': name, 'icon': icon}), 201


# ─────────────────────────────────────────────────────────────────────────────
# API: PRODUCTS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/products', methods=['GET'])
@login_required
def api_products():
    category_id = request.args.get('category_id')
    search = request.args.get('search', '').strip()
    
    query = """
        SELECT p.*, c.name as category_name, c.icon as category_icon
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE 1=1
    """
    args = []
    
    if category_id and category_id != 'all':
        query += " AND p.category_id = ?"
        args.append(category_id)
    
    if search:
        query += " AND p.name LIKE ?"
        args.append(f'%{search}%')
    
    query += " ORDER BY p.name"
    products = query_db(query, args)
    return jsonify([dict(p) for p in products])


@app.route('/api/products', methods=['POST'])
@login_required
def api_products_create():
    # Handle both JSON and form data (for file upload)
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form
        image_path = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                image_path = f'/static/images/{filename}'
    else:
        data = request.json or {}
        image_path = data.get('image_path')

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Nama produk wajib diisi.'}), 400
    
    try:
        price = float(data.get('price', 0))
        stock_qty = int(data.get('stock_qty', 0))
        low_stock_threshold = int(data.get('low_stock_threshold', 5))
    except (ValueError, TypeError):
        return jsonify({'error': 'Harga, stok, dan threshold harus berupa angka.'}), 400

    category_id = data.get('category_id') or None
    stock_unit = data.get('stock_unit', 'porsi')
    is_available = int(data.get('is_available', 1))

    prod_id = execute_db(
        """INSERT INTO products 
           (category_id, name, price, stock_qty, stock_unit, low_stock_threshold, image_path, is_available)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [category_id, name, price, stock_qty, stock_unit, low_stock_threshold, image_path, is_available]
    )
    
    product = query_db(
        "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
        [prod_id], one=True
    )
    return jsonify(dict(product)), 201


@app.route('/api/products/<int:prod_id>', methods=['PUT'])
@login_required
def api_products_update(prod_id):
    existing = query_db("SELECT * FROM products WHERE id = ?", [prod_id], one=True)
    if not existing:
        return jsonify({'error': 'Produk tidak ditemukan.'}), 404

    image_path = existing['image_path']

    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(filepath)
                image_path = f'/static/images/{filename}'
    else:
        data = request.json or {}
        if 'image_path' in data:
            image_path = data.get('image_path')

    name = data.get('name', existing['name']).strip()
    try:
        price = float(data.get('price', existing['price']))
        stock_qty = int(data.get('stock_qty', existing['stock_qty']))
        low_stock_threshold = int(data.get('low_stock_threshold', existing['low_stock_threshold']))
    except (ValueError, TypeError):
        return jsonify({'error': 'Nilai tidak valid.'}), 400

    category_id = data.get('category_id', existing['category_id']) or None
    stock_unit = data.get('stock_unit', existing['stock_unit'])
    is_available = int(data.get('is_available', existing['is_available']))

    execute_db(
        """UPDATE products SET 
           category_id=?, name=?, price=?, stock_qty=?, stock_unit=?,
           low_stock_threshold=?, image_path=?, is_available=?
           WHERE id=?""",
        [category_id, name, price, stock_qty, stock_unit, low_stock_threshold, image_path, is_available, prod_id]
    )
    
    product = query_db(
        "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
        [prod_id], one=True
    )
    return jsonify(dict(product))


@app.route('/api/products/<int:prod_id>', methods=['DELETE'])
@admin_required
def api_products_delete(prod_id):
    existing = query_db("SELECT * FROM products WHERE id = ?", [prod_id], one=True)
    if not existing:
        return jsonify({'error': 'Produk tidak ditemukan.'}), 404
    execute_db("DELETE FROM products WHERE id = ?", [prod_id])
    return jsonify({'message': 'Produk berhasil dihapus.'})


@app.route('/api/products/<int:prod_id>/restock', methods=['POST'])
@login_required
def api_products_restock(prod_id):
    data = request.json or {}
    try:
        qty = int(data.get('qty', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Jumlah tidak valid.'}), 400
    
    if qty <= 0:
        return jsonify({'error': 'Jumlah harus lebih dari 0.'}), 400
    
    existing = query_db("SELECT * FROM products WHERE id = ?", [prod_id], one=True)
    if not existing:
        return jsonify({'error': 'Produk tidak ditemukan.'}), 404
    
    new_qty = existing['stock_qty'] + qty
    execute_db("UPDATE products SET stock_qty = ? WHERE id = ?", [new_qty, prod_id])
    return jsonify({'message': 'Restock berhasil.', 'new_qty': new_qty})


# ─────────────────────────────────────────────────────────────────────────────
# API: TRANSACTIONS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/transactions', methods=['GET'])
@login_required
def api_transactions():
    period = request.args.get('period', 'today')
    status = request.args.get('status', 'all')
    limit = int(request.args.get('limit', 50))
    
    now = datetime.now()
    if period == 'today':
        date_from = now.strftime('%Y-%m-%d 00:00:00')
    elif period == 'week':
        date_from = (now - timedelta(days=7)).strftime('%Y-%m-%d 00:00:00')
    elif period == 'month':
        date_from = (now - timedelta(days=30)).strftime('%Y-%m-%d 00:00:00')
    else:
        date_from = '2000-01-01 00:00:00'
    
    query = """
        SELECT t.*, u.nama_lengkap as cashier_name,
               GROUP_CONCAT(ti.product_name || ' x' || ti.quantity, ', ') as items_summary
        FROM transactions t
        LEFT JOIN users u ON t.cashier_id = u.id
        LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE t.created_at >= ?
    """
    args = [date_from]
    
    if status != 'all':
        query += " AND t.status = ?"
        args.append(status)
    
    query += " GROUP BY t.id ORDER BY t.created_at DESC LIMIT ?"
    args.append(limit)
    
    txns = query_db(query, args)
    return jsonify([dict(t) for t in txns])


@app.route('/api/transactions/pending', methods=['GET'])
@login_required
def api_transactions_pending():
    txns = query_db(
        """SELECT t.*, u.nama_lengkap as cashier_name
           FROM transactions t
           LEFT JOIN users u ON t.cashier_id = u.id
           WHERE t.status = 'pending'
           ORDER BY t.created_at DESC""",
    )
    return jsonify([dict(t) for t in txns])


@app.route('/api/transactions', methods=['POST'])
@login_required
def api_transactions_create():
    data = request.json or {}
    items = data.get('items', [])
    
    if not items:
        return jsonify({'error': 'Pesanan tidak boleh kosong.'}), 400
    
    # Get tax setting
    tax_setting = query_db("SELECT value FROM settings WHERE key = 'tax_enabled'", one=True)
    tax_rate_setting = query_db("SELECT value FROM settings WHERE key = 'tax_rate'", one=True)
    tax_enabled = tax_setting and tax_setting['value'] == '1'
    tax_rate = float(tax_rate_setting['value']) / 100 if tax_rate_setting else 0.10
    
    subtotal = sum(item.get('price', 0) * item.get('qty', 0) for item in items)
    tax_amount = round(subtotal * tax_rate, 0) if tax_enabled else 0
    total = subtotal + tax_amount
    
    order_code = get_next_order_code()
    cashier_id = session.get('user_id')
    notes = data.get('notes', '')
    
    txn_id = execute_db(
        """INSERT INTO transactions 
           (order_code, cashier_id, subtotal, tax_amount, total, status, notes)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
        [order_code, cashier_id, subtotal, tax_amount, total, notes]
    )
    
    # Insert items
    for item in items:
        execute_db(
            """INSERT INTO transaction_items 
               (transaction_id, product_id, product_name, product_price, quantity, subtotal, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [txn_id, item.get('product_id'), item.get('name'), item.get('price'),
             item.get('qty'), item.get('price') * item.get('qty'), item.get('notes', '')]
        )
    
    return jsonify({'id': txn_id, 'order_code': order_code, 'total': total}), 201


@app.route('/api/transactions/<int:txn_id>', methods=['GET'])
@login_required
def api_transaction_detail(txn_id):
    txn = query_db("SELECT * FROM transactions WHERE id = ?", [txn_id], one=True)
    if not txn:
        return jsonify({'error': 'Transaksi tidak ditemukan.'}), 404
    
    items = query_db(
        "SELECT * FROM transaction_items WHERE transaction_id = ?", [txn_id]
    )
    
    result = dict(txn)
    result['items'] = [dict(i) for i in items]
    return jsonify(result)


@app.route('/api/transactions/<int:txn_id>', methods=['PUT'])
@login_required
def api_transactions_update(txn_id):
    txn = query_db("SELECT * FROM transactions WHERE id = ?", [txn_id], one=True)
    if not txn:
        return jsonify({'error': 'Transaksi tidak ditemukan.'}), 404
    
    data = request.json or {}
    action = data.get('action', 'update')
    
    if action == 'pay':
        payment_method = data.get('payment_method', 'tunai')
        amount_paid = float(data.get('amount_paid', txn['total']))
        change_amount = max(0, amount_paid - txn['total'])
        paid_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        execute_db(
            """UPDATE transactions SET 
               status='paid', payment_method=?, amount_paid=?, change_amount=?, paid_at=?
               WHERE id=?""",
            [payment_method, amount_paid, change_amount, paid_at, txn_id]
        )
        
        # Deduct stock
        items = query_db(
            "SELECT * FROM transaction_items WHERE transaction_id = ?", [txn_id]
        )
        for item in items:
            if item['product_id']:
                execute_db(
                    "UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?",
                    [item['quantity'], item['product_id']]
                )
        
        return jsonify({'message': 'Pembayaran berhasil.', 'change': change_amount})
    
    elif action == 'cancel':
        execute_db("UPDATE transactions SET status='cancelled' WHERE id=?", [txn_id])
        return jsonify({'message': 'Transaksi dibatalkan.'})
    
    elif action == 'update_items':
        # Update items for a pending transaction
        if txn['status'] != 'pending':
            return jsonify({'error': 'Hanya transaksi pending yang bisa diubah.'}), 400
        
        items = data.get('items', [])
        if not items:
            return jsonify({'error': 'Items tidak boleh kosong.'}), 400
        
        tax_setting = query_db("SELECT value FROM settings WHERE key = 'tax_enabled'", one=True)
        tax_rate_setting = query_db("SELECT value FROM settings WHERE key = 'tax_rate'", one=True)
        tax_enabled = tax_setting and tax_setting['value'] == '1'
        tax_rate = float(tax_rate_setting['value']) / 100 if tax_rate_setting else 0.10
        
        subtotal = sum(item.get('price', 0) * item.get('qty', 0) for item in items)
        tax_amount = round(subtotal * tax_rate, 0) if tax_enabled else 0
        total = subtotal + tax_amount
        
        execute_db("DELETE FROM transaction_items WHERE transaction_id = ?", [txn_id])
        for item in items:
            execute_db(
                """INSERT INTO transaction_items 
                   (transaction_id, product_id, product_name, product_price, quantity, subtotal, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [txn_id, item.get('product_id'), item.get('name'), item.get('price'),
                 item.get('qty'), item.get('price') * item.get('qty'), item.get('notes', '')]
            )
        
        execute_db(
            "UPDATE transactions SET subtotal=?, tax_amount=?, total=? WHERE id=?",
            [subtotal, tax_amount, total, txn_id]
        )
        return jsonify({'message': 'Pesanan diperbarui.', 'total': total})
    
    return jsonify({'error': 'Action tidak dikenal.'}), 400


# ─────────────────────────────────────────────────────────────────────────────
# API: DASHBOARD STATS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/dashboard/stats', methods=['GET'])
@login_required
def api_dashboard_stats():
    period = request.args.get('period', 'today')
    now = datetime.now()
    
    if period == 'today':
        date_from = now.strftime('%Y-%m-%d 00:00:00')
        prev_from = (now - timedelta(days=1)).strftime('%Y-%m-%d 00:00:00')
        prev_to = now.strftime('%Y-%m-%d 00:00:00')
    elif period == 'week':
        date_from = (now - timedelta(days=7)).strftime('%Y-%m-%d 00:00:00')
        prev_from = (now - timedelta(days=14)).strftime('%Y-%m-%d 00:00:00')
        prev_to = date_from
    elif period == 'month':
        date_from = (now - timedelta(days=30)).strftime('%Y-%m-%d 00:00:00')
        prev_from = (now - timedelta(days=60)).strftime('%Y-%m-%d 00:00:00')
        prev_to = date_from
    else:
        date_from = '2000-01-01 00:00:00'
        prev_from = '2000-01-01 00:00:00'
        prev_to = '2000-01-01 00:00:00'
    
    # Current period revenue & transactions
    curr = query_db(
        "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as txn_count FROM transactions WHERE status='paid' AND paid_at >= ?",
        [date_from], one=True
    )
    
    # Previous period revenue
    prev = query_db(
        "SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as txn_count FROM transactions WHERE status='paid' AND paid_at >= ? AND paid_at < ?",
        [prev_from, prev_to], one=True
    )
    
    # Best seller
    best_seller = query_db(
        """SELECT ti.product_name, SUM(ti.quantity) as total_qty
           FROM transaction_items ti
           JOIN transactions t ON ti.transaction_id = t.id
           WHERE t.status='paid' AND t.paid_at >= ?
           GROUP BY ti.product_id, ti.product_name
           ORDER BY total_qty DESC LIMIT 1""",
        [date_from], one=True
    )
    
    # Low stock items
    low_stock = query_db(
        """SELECT p.id, p.name, p.stock_qty, p.stock_unit, p.low_stock_threshold,
                  CASE WHEN p.stock_qty = 0 THEN 'empty'
                       WHEN p.stock_qty <= p.low_stock_threshold / 2 THEN 'critical'
                       ELSE 'low' END as alert_level
           FROM products p
           WHERE p.stock_qty <= p.low_stock_threshold
           ORDER BY p.stock_qty ASC
           LIMIT 10"""
    )
    
    # Revenue growth
    curr_rev = curr['revenue'] if curr else 0
    prev_rev = prev['revenue'] if prev else 0
    if prev_rev > 0:
        rev_growth = round(((curr_rev - prev_rev) / prev_rev) * 100, 1)
    else:
        rev_growth = 0
    
    curr_txn = curr['txn_count'] if curr else 0
    prev_txn = prev['txn_count'] if prev else 0
    if prev_txn > 0:
        txn_growth = round(((curr_txn - prev_txn) / prev_txn) * 100, 1)
    else:
        txn_growth = 0
    
    return jsonify({
        'revenue': curr_rev,
        'revenue_growth': rev_growth,
        'transaction_count': curr_txn,
        'transaction_growth': txn_growth,
        'best_seller': {
            'name': best_seller['product_name'] if best_seller else '-',
            'qty': best_seller['total_qty'] if best_seller else 0
        } if best_seller else {'name': '-', 'qty': 0},
        'low_stock': [dict(item) for item in low_stock]
    })


# ─────────────────────────────────────────────────────────────────────────────
# API: SETTINGS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/settings', methods=['GET'])
@login_required
def api_settings_get():
    rows = query_db("SELECT key, value FROM settings")
    return jsonify({row['key']: row['value'] for row in rows})


@app.route('/api/settings', methods=['PUT'])
@admin_required
def api_settings_update():
    data = request.json or {}
    for key, value in data.items():
        execute_db(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [key, str(value)]
        )
    return jsonify({'message': 'Pengaturan berhasil disimpan.'})


# ─────────────────────────────────────────────────────────────────────────────
# API: USERS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@admin_required
def api_users():
    users = query_db("SELECT id, username, role, nama_lengkap, is_active, created_at FROM users ORDER BY id")
    return jsonify([dict(u) for u in users])


@app.route('/api/users', methods=['POST'])
@admin_required
def api_users_create():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', 'kasir')
    nama_lengkap = data.get('nama_lengkap', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username dan password wajib diisi.'}), 400
    
    existing = query_db("SELECT id FROM users WHERE username = ?", [username], one=True)
    if existing:
        return jsonify({'error': 'Username sudah digunakan.'}), 409
    
    user_id = execute_db(
        "INSERT INTO users (username, password_hash, role, nama_lengkap) VALUES (?, ?, ?, ?)",
        [username, generate_password_hash(password), role, nama_lengkap]
    )
    return jsonify({'id': user_id, 'username': username, 'role': role}), 201


@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def api_users_update(user_id):
    data = request.json or {}
    existing = query_db("SELECT * FROM users WHERE id = ?", [user_id], one=True)
    if not existing:
        return jsonify({'error': 'User tidak ditemukan.'}), 404
    
    nama_lengkap = data.get('nama_lengkap', existing['nama_lengkap'])
    role = data.get('role', existing['role'])
    is_active = int(data.get('is_active', existing['is_active']))
    
    # Change password if provided
    if data.get('password'):
        password_hash = generate_password_hash(data['password'])
        execute_db(
            "UPDATE users SET nama_lengkap=?, role=?, is_active=?, password_hash=? WHERE id=?",
            [nama_lengkap, role, is_active, password_hash, user_id]
        )
    else:
        execute_db(
            "UPDATE users SET nama_lengkap=?, role=?, is_active=? WHERE id=?",
            [nama_lengkap, role, is_active, user_id]
        )
    
    return jsonify({'message': 'User berhasil diperbarui.'})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def api_users_delete(user_id):
    if user_id == session.get('user_id'):
        return jsonify({'error': 'Tidak dapat menghapus akun sendiri.'}), 400
    execute_db("DELETE FROM users WHERE id = ?", [user_id])
    return jsonify({'message': 'User berhasil dihapus.'})


# ─────────────────────────────────────────────────────────────────────────────
# API: BACKUP
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/backup', methods=['GET'])
@admin_required
def api_backup():
    """Download the SQLite3 database file as a backup."""
    from database import DATABASE
    if not os.path.exists(DATABASE):
        return jsonify({'error': 'Database belum ada.'}), 404
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    download_name = f'hokiapp_backup_{timestamp}.db'
    return send_file(
        DATABASE,
        as_attachment=True,
        download_name=download_name,
        mimetype='application/octet-stream'
    )


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    init_db()
    print("=" * 50)
    print("  HokiApp POS - Warung Penyetan Hoki")
    print("  Server berjalan di: http://localhost:5000")
    print("  Login: admin / hoki2024  atau  kasir / kasir123")
    print("=" * 50)
    app.run(debug=True, host='localhost', port=5000)
