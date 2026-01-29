const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, 'joestar-peptide.db');

// Initialize database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const createTables = () => {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            affiliate_code TEXT UNIQUE,
            affiliate_level TEXT DEFAULT 'Bronze',
            affiliate_commission REAL DEFAULT 0,
            affiliate_total_earned REAL DEFAULT 0,
            wishlist TEXT DEFAULT '[]' -- JSON array of product IDs
        )
    `);

    // Affiliate referrals table
    db.exec(`
        CREATE TABLE IF NOT EXISTS affiliate_referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            referred_user_id INTEGER,
            amount REAL NOT NULL,
            commission REAL NOT NULL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (referred_user_id) REFERENCES users (id)
        )
    `);

    // Products table
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            price REAL NOT NULL,
            original_price REAL,
            dosage TEXT,
            purity TEXT,
            lab_tested BOOLEAN DEFAULT 1,
            in_stock BOOLEAN DEFAULT 1,
            featured BOOLEAN DEFAULT 0,
            image TEXT,
            benefits TEXT, -- JSON array
            usage TEXT,
            tags TEXT, -- JSON array
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Orders table
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT,
            customer_address TEXT,
            discount_code TEXT,
            discount_amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // Order items table
    db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders (id),
            FOREIGN KEY (product_id) REFERENCES products (id)
        )
    `);

    // Testimonials table
    db.exec(`
        CREATE TABLE IF NOT EXISTS testimonials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            location TEXT DEFAULT 'Indonesia',
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            text TEXT NOT NULL,
            product TEXT NOT NULL,
            date DATE DEFAULT CURRENT_DATE,
            verified BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // E-books table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ebooks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            pages INTEGER,
            language TEXT DEFAULT 'Indonesia',
            download_url TEXT,
            preview_url TEXT,
            thumbnail TEXT,
            category TEXT,
            tags TEXT, -- JSON array
            downloads INTEGER DEFAULT 0,
            featured BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Discount codes table
    db.exec(`
        CREATE TABLE IF NOT EXISTS discount_codes (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            discount REAL NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
            max_uses INTEGER DEFAULT 999999,
            used_count INTEGER DEFAULT 0,
            valid_until DATE,
            active BOOLEAN DEFAULT 1,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Newsletter subscribers table
    db.exec(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            active BOOLEAN DEFAULT 1,
            unsubscribed_at DATETIME
        )
    `);

    // Contact messages table
    db.exec(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ Database tables created successfully');
};

// Migrate data from JSON files to database
const migrateData = () => {
    try {
        // Migrate users
        const usersFile = path.join(__dirname, 'users.json');
        if (fs.existsSync(usersFile)) {
            const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            const insertUser = db.prepare(`
                INSERT OR IGNORE INTO users (id, name, email, password, created_at, affiliate_code, affiliate_level, affiliate_commission, affiliate_total_earned, wishlist)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const user of users) {
                const affiliateCode = user.affiliate?.redeemCode || `JOESTAR${user.id.slice(-4).toUpperCase()}`;
                const affiliateLevel = user.affiliate?.level || 'Bronze';
                const affiliateCommission = user.affiliate?.commission || 0;
                const affiliateTotalEarned = user.affiliate?.totalEarned || 0;
                const wishlist = JSON.stringify(user.wishlist || []);

                insertUser.run(
                    user.id,
                    user.name,
                    user.email,
                    user.password,
                    user.createdAt,
                    affiliateCode,
                    affiliateLevel,
                    affiliateCommission,
                    affiliateTotalEarned,
                    wishlist
                );
            }
            console.log(`✅ Migrated ${users.length} users`);
        }

        // Migrate products
        const productsFile = path.join(__dirname, 'products.json');
        if (fs.existsSync(productsFile)) {
            const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
            const insertProduct = db.prepare(`
                INSERT OR IGNORE INTO products (id, name, category, description, price, original_price, dosage, purity, lab_tested, in_stock, featured, image, benefits, usage, tags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const product of products) {
                insertProduct.run(
                    product.id,
                    product.name,
                    product.category,
                    product.description,
                    product.price,
                    product.originalPrice || null,
                    product.dosage,
                    product.purity,
                    product.labTested ? 1 : 0,
                    product.inStock ? 1 : 0,
                    product.featured ? 1 : 0,
                    product.image,
                    JSON.stringify(product.benefits || []),
                    product.usage,
                    JSON.stringify(product.tags || [])
                );
            }
            console.log(`✅ Migrated ${products.length} products`);
        }

        // Migrate testimonials
        const testimonialsFile = path.join(__dirname, 'testimonials.json');
        if (fs.existsSync(testimonialsFile)) {
            const testimonials = JSON.parse(fs.readFileSync(testimonialsFile, 'utf8'));
            const insertTestimonial = db.prepare(`
                INSERT OR IGNORE INTO testimonials (id, name, location, rating, text, product, date, verified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const testimonial of testimonials) {
                insertTestimonial.run(
                    testimonial.id,
                    testimonial.name,
                    testimonial.location || 'Indonesia',
                    testimonial.rating,
                    testimonial.text,
                    testimonial.product,
                    testimonial.date,
                    testimonial.verified ? 1 : 0
                );
            }
            console.log(`✅ Migrated ${testimonials.length} testimonials`);
        }

        // Migrate discount codes
        const discountCodesFile = path.join(__dirname, 'discount-codes.json');
        if (fs.existsSync(discountCodesFile)) {
            const discountCodes = JSON.parse(fs.readFileSync(discountCodesFile, 'utf8'));
            const insertDiscountCode = db.prepare(`
                INSERT OR IGNORE INTO discount_codes (id, code, discount, type, max_uses, used_count, valid_until, active, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const code of discountCodes) {
                insertDiscountCode.run(
                    code.id,
                    code.code,
                    code.discount,
                    code.type,
                    code.maxUses,
                    code.usedCount,
                    code.validUntil,
                    code.active ? 1 : 0,
                    code.description
                );
            }
            console.log(`✅ Migrated ${discountCodes.length} discount codes`);
        }

        // Migrate ebooks
        const ebooksFile = path.join(__dirname, 'ebooks.json');
        if (fs.existsSync(ebooksFile)) {
            const ebooks = JSON.parse(fs.readFileSync(ebooksFile, 'utf8'));
            const insertEbook = db.prepare(`
                INSERT OR IGNORE INTO ebooks (id, title, description, pages, language, download_url, preview_url, thumbnail, category, tags, downloads, featured)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const ebook of ebooks) {
                insertEbook.run(
                    ebook.id,
                    ebook.title,
                    ebook.description,
                    ebook.pages,
                    ebook.language,
                    ebook.downloadUrl,
                    ebook.previewUrl,
                    ebook.thumbnail,
                    ebook.category,
                    JSON.stringify(ebook.tags || []),
                    ebook.downloads,
                    ebook.featured ? 1 : 0
                );
            }
            console.log(`✅ Migrated ${ebooks.length} ebooks`);
        }

        // Migrate newsletter subscribers
        const newsletterFile = path.join(__dirname, 'newsletter.json');
        if (fs.existsSync(newsletterFile)) {
            const subscribers = JSON.parse(fs.readFileSync(newsletterFile, 'utf8'));
            const insertSubscriber = db.prepare(`
                INSERT OR IGNORE INTO newsletter_subscribers (id, email, name, subscribed_at, active)
                VALUES (?, ?, ?, ?, ?)
            `);

            for (const subscriber of subscribers) {
                insertSubscriber.run(
                    subscriber.id,
                    subscriber.email,
                    subscriber.name,
                    subscriber.subscribedAt,
                    subscriber.active ? 1 : 0
                );
            }
            console.log(`✅ Migrated ${subscribers.length} newsletter subscribers`);
        }

        console.log('🎉 Data migration completed successfully!');
    } catch (error) {
        console.error('❌ Error during data migration:', error);
    }
};

// Initialize database
const initDatabase = () => {
    try {
        createTables();
        migrateData();
        console.log('🗄️ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
};

// Prepared statements for better performance
const statements = {
    // User operations
    getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    createUser: db.prepare(`
        INSERT INTO users (name, email, password, affiliate_code)
        VALUES (?, ?, ?, ?)
    `),
    updateUser: db.prepare(`
        UPDATE users SET name = ?, email = ? WHERE id = ?
    `),
    updateUserPassword: db.prepare(`
        UPDATE users SET password = ? WHERE id = ?
    `),
    updateUserAffiliate: db.prepare(`
        UPDATE users SET affiliate_level = ?, affiliate_commission = ?, affiliate_total_earned = ? WHERE id = ?
    `),
    updateUserWishlist: db.prepare(`
        UPDATE users SET wishlist = ? WHERE id = ?
    `),

    // Product operations
    getAllProducts: db.prepare('SELECT * FROM products ORDER BY created_at DESC'),
    getProductById: db.prepare('SELECT * FROM products WHERE id = ?'),
    getProductsByCategory: db.prepare('SELECT * FROM products WHERE category = ? ORDER BY created_at DESC'),

    // Testimonial operations
    getAllTestimonials: db.prepare('SELECT * FROM testimonials ORDER BY created_at DESC'),
    createTestimonial: db.prepare(`
        INSERT INTO testimonials (user_id, name, location, rating, text, product, verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    // E-book operations
    getAllEbooks: db.prepare('SELECT * FROM ebooks ORDER BY created_at DESC'),
    getEbookById: db.prepare('SELECT * FROM ebooks WHERE id = ?'),
    updateEbookDownloads: db.prepare('UPDATE ebooks SET downloads = downloads + 1 WHERE id = ?'),

    // Discount code operations
    getAllDiscountCodes: db.prepare('SELECT * FROM discount_codes WHERE active = 1'),
    getDiscountCodeByCode: db.prepare('SELECT * FROM discount_codes WHERE code = ? AND active = 1'),
    updateDiscountCodeUsage: db.prepare('UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?'),

    // Newsletter operations
    getAllSubscribers: db.prepare('SELECT * FROM newsletter_subscribers WHERE active = 1'),
    getSubscriberByEmail: db.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?'),
    createSubscriber: db.prepare(`
        INSERT INTO newsletter_subscribers (email, name)
        VALUES (?, ?)
    `),
    unsubscribe: db.prepare(`
        UPDATE newsletter_subscribers SET active = 0, unsubscribed_at = CURRENT_TIMESTAMP WHERE email = ?
    `),

    // Contact operations
    createContactMessage: db.prepare(`
        INSERT INTO contact_messages (name, email, subject, message)
        VALUES (?, ?, ?, ?)
    `),

    // Affiliate operations
    createAffiliateReferral: db.prepare(`
        INSERT INTO affiliate_referrals (user_id, referred_user_id, amount, commission, status)
        VALUES (?, ?, ?, ?, ?)
    `),
    getAffiliateReferrals: db.prepare('SELECT * FROM affiliate_referrals WHERE user_id = ? ORDER BY date DESC'),

    // Order operations
    createOrder: db.prepare(`
        INSERT INTO orders (user_id, total, customer_name, customer_email, customer_phone, customer_address, discount_code, discount_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    createOrderItem: db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
        VALUES (?, ?, ?, ?, ?)
    `),
    getUserOrders: db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'),
    getOrderItems: db.prepare('SELECT * FROM order_items WHERE order_id = ?')
};

module.exports = {
    db,
    initDatabase,
    statements
};
