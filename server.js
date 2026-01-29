const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDatabase, statements } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'joestar-peptide-secret-key-2023';

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Handle preflight requests
app.options('*', cors());

// Initialize database
initDatabase();

// Routes

// Register new user
app.post('/api/auth/register', async (req, res) => {
    console.log('Registration request received:', req.body);
    try {
        const { name, email, password, referralCode } = req.body;

        if (!name || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = statements.getUserByEmail.get(email);
        if (existingUser) {
            console.log('User already exists:', email);
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const result = statements.createUser.run(name, email, hashedPassword, null);
        const newUserId = result.lastInsertRowid;

        console.log('User created successfully:', email);

        // Create JWT token
        const token = jwt.sign(
            { userId: newUserId, email: email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: newUserId,
                name: name,
                email: email
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    console.log('Login request received:', req.body);
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            console.log('Missing email or password');
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = statements.getUserByEmail.get(email);

        if (!user) {
            console.log('User not found:', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        console.log('User found, checking password');
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            console.log('Invalid password for user:', email);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        console.log('Login successful for user:', email);
        // Create JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// Verify token middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Get user profile
app.get('/api/auth/profile', authenticateToken, (req, res) => {
    const user = statements.getUserById.get(req.user.userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.created_at
        }
    });
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;
        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === req.user.userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if email is already taken by another user
        if (email !== users[userIndex].email) {
            const emailExists = users.find(u => u.email === email && u.id !== req.user.userId);
            if (emailExists) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        users[userIndex].name = name || users[userIndex].name;
        users[userIndex].email = email || users[userIndex].email;

        writeUsers(users);

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: users[userIndex].id,
                name: users[userIndex].name,
                email: users[userIndex].email
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change password
app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === req.user.userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
        if (!isValidPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        users[userIndex].password = hashedNewPassword;

        writeUsers(users);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});



// Discount Code System
const DISCOUNT_CODES_FILE = path.join(__dirname, 'discount-codes.json');

// Initialize discount codes file
const initializeDiscountCodes = () => {
    if (!fs.existsSync(DISCOUNT_CODES_FILE)) {
        const defaultCodes = [
            {
                id: 'WELCOME10',
                code: 'WELCOME10',
                discount: 10,
                type: 'percentage',
                maxUses: 100,
                usedCount: 0,
                validUntil: '2024-12-31',
                active: true,
                description: 'Welcome discount for new customers'
            },
            {
                id: 'JOESTAR20',
                code: 'JOESTAR20',
                discount: 20,
                type: 'percentage',
                maxUses: 50,
                usedCount: 0,
                validUntil: '2024-12-31',
                active: true,
                description: 'Special JOESTAR discount'
            },
            {
                id: 'PEPTIDE50K',
                code: 'PEPTIDE50K',
                discount: 50000,
                type: 'fixed',
                maxUses: 25,
                usedCount: 0,
                validUntil: '2024-12-31',
                active: true,
                description: 'Fixed discount for peptide orders'
            }
        ];
        fs.writeFileSync(DISCOUNT_CODES_FILE, JSON.stringify(defaultCodes, null, 2));
    }
};

const readDiscountCodes = () => {
    try {
        const data = fs.readFileSync(DISCOUNT_CODES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeDiscountCodes = (codes) => {
    fs.writeFileSync(DISCOUNT_CODES_FILE, JSON.stringify(codes, null, 2));
};

// Initialize discount codes
initializeDiscountCodes();

// Validate discount code
app.post('/api/discount/validate', (req, res) => {
    const { code, orderAmount } = req.body;

    if (!code) {
        return res.status(400).json({ message: 'Discount code is required' });
    }

    const codes = readDiscountCodes();
    const discountCode = codes.find(c => c.code.toLowerCase() === code.toLowerCase() && c.active);

    if (!discountCode) {
        return res.status(404).json({ message: 'Invalid or expired discount code' });
    }

    // Check if code is still valid
    if (new Date() > new Date(discountCode.validUntil)) {
        return res.status(400).json({ message: 'Discount code has expired' });
    }

    // Check usage limit
    if (discountCode.usedCount >= discountCode.maxUses) {
        return res.status(400).json({ message: 'Discount code usage limit exceeded' });
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discountCode.type === 'percentage') {
        discountAmount = (orderAmount * discountCode.discount) / 100;
    } else if (discountCode.type === 'fixed') {
        discountAmount = Math.min(discountCode.discount, orderAmount);
    }

    res.json({
        valid: true,
        code: discountCode.code,
        discount: discountAmount,
        type: discountCode.type,
        description: discountCode.description,
        finalAmount: orderAmount - discountAmount
    });
});

// Apply discount code (mark as used)
app.post('/api/discount/apply', (req, res) => {
    const { code, orderAmount } = req.body;

    if (!code) {
        return res.status(400).json({ message: 'Discount code is required' });
    }

    const codes = readDiscountCodes();
    const codeIndex = codes.findIndex(c => c.code.toLowerCase() === code.toLowerCase() && c.active);

    if (codeIndex === -1) {
        return res.status(404).json({ message: 'Invalid discount code' });
    }

    const discountCode = codes[codeIndex];

    // Check if code is still valid
    if (new Date() > new Date(discountCode.validUntil)) {
        return res.status(400).json({ message: 'Discount code has expired' });
    }

    // Check usage limit
    if (discountCode.usedCount >= discountCode.maxUses) {
        return res.status(400).json({ message: 'Discount code usage limit exceeded' });
    }

    // Increment usage count
    discountCode.usedCount += 1;
    writeDiscountCodes(codes);

    // Calculate discount amount
    let discountAmount = 0;
    if (discountCode.type === 'percentage') {
        discountAmount = (orderAmount * discountCode.discount) / 100;
    } else if (discountCode.type === 'fixed') {
        discountAmount = Math.min(discountCode.discount, orderAmount);
    }

    res.json({
        message: 'Discount code applied successfully',
        code: discountCode.code,
        discount: discountAmount,
        type: discountCode.type,
        finalAmount: orderAmount - discountAmount
    });
});

// Testimonials System
const TESTIMONIALS_FILE = path.join(__dirname, 'testimonials.json');

// Initialize testimonials file
const initializeTestimonials = () => {
    if (!fs.existsSync(TESTIMONIALS_FILE)) {
        const defaultTestimonials = [
            {
                id: '1',
                name: 'Ahmad Rahman',
                location: 'Jakarta',
                rating: 5,
                text: 'Produk peptide JOESTAR sangat berkualitas! Sudah 3 bulan pakai dan merasakan perubahan yang signifikan dalam energi dan pemulihan tubuh.',
                product: 'CJC-1295 + Ipamorelin',
                date: '2024-01-15',
                verified: true
            },
            {
                id: '2',
                name: 'Sari Dewi',
                location: 'Surabaya',
                rating: 5,
                text: 'Pelayanan sangat profesional dan produk asli. Chatbot konsultasi sangat membantu untuk memahami produk yang tepat untuk kebutuhan saya.',
                product: 'GHK-Cu',
                date: '2024-01-20',
                verified: true
            },
            {
                id: '3',
                name: 'Budi Santoso',
                location: 'Bandung',
                rating: 5,
                text: 'Harga terjangkau dengan kualitas premium. Pengiriman cepat dan aman. Recommended!',
                product: 'Retatrutide 10mg',
                date: '2024-01-25',
                verified: true
            }
        ];
        fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(defaultTestimonials, null, 2));
    }
};

const readTestimonials = () => {
    try {
        const data = fs.readFileSync(TESTIMONIALS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeTestimonials = (testimonials) => {
    fs.writeFileSync(TESTIMONIALS_FILE, JSON.stringify(testimonials, null, 2));
};

// Initialize testimonials
initializeTestimonials();

// Get testimonials
app.get('/api/testimonials', (req, res) => {
    const testimonials = readTestimonials();
    res.json(testimonials);
});

// Add testimonial (for authenticated users)
app.post('/api/testimonials', authenticateToken, (req, res) => {
    const { rating, text, product } = req.body;

    if (!rating || !text || !product) {
        return res.status(400).json({ message: 'Rating, text, and product are required' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const users = readUsers();
    const user = users.find(u => u.id === req.user.userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const testimonials = readTestimonials();

    const newTestimonial = {
        id: Date.now().toString(),
        name: user.name,
        location: 'Indonesia', // Default location
        rating: parseInt(rating),
        text: text,
        product: product,
        date: new Date().toISOString().split('T')[0],
        verified: true,
        userId: user.id
    };

    testimonials.push(newTestimonial);
    writeTestimonials(testimonials);

    res.status(201).json({
        message: 'Testimonial added successfully',
        testimonial: newTestimonial
    });
});

// E-book System
const EBOOKS_FILE = path.join(__dirname, 'ebooks.json');

// Initialize ebooks file
const initializeEbooks = () => {
    if (!fs.existsSync(EBOOKS_FILE)) {
        const defaultEbooks = [
            {
                id: '1',
                title: 'Panduan Lengkap Peptide untuk Kesehatan Optimal',
                description: 'Buku elektronik komprehensif tentang dunia peptide, manfaatnya, dan cara penggunaan yang tepat untuk kesehatan tubuh Anda.',
                pages: 85,
                language: 'Indonesia',
                downloadUrl: '/ebooks/panduan-peptide-kesehatan.pdf',
                previewUrl: '/ebooks/preview/panduan-peptide-kesehatan-preview.pdf',
                thumbnail: '/images/ebook-peptide-guide.jpg',
                category: 'Education',
                tags: ['peptide', 'kesehatan', 'panduan', 'edukasi'],
                downloads: 0,
                featured: true
            },
            {
                id: '2',
                title: 'Optimasi Hormon dengan Peptide Therapy',
                description: 'Pelajari bagaimana peptide dapat membantu mengoptimalkan kadar hormon alami tubuh untuk performa maksimal.',
                pages: 67,
                language: 'Indonesia',
                downloadUrl: '/ebooks/optimasi-hormon-peptide.pdf',
                previewUrl: '/ebooks/preview/optimasi-hormon-peptide-preview.pdf',
                thumbnail: '/images/ebook-hormone-optimization.jpg',
                category: 'Health',
                tags: ['hormon', 'peptide', 'optimasi', 'performa'],
                downloads: 0,
                featured: false
            },
            {
                id: '3',
                title: 'Anti-Aging dengan Teknologi Peptide Modern',
                description: 'Temukan rahasia anti-aging dengan peptide terdepan untuk kulit yang lebih muda dan vitalitas yang optimal.',
                pages: 92,
                language: 'Indonesia',
                downloadUrl: '/ebooks/anti-aging-peptide.pdf',
                previewUrl: '/ebooks/preview/anti-aging-peptide-preview.pdf',
                thumbnail: '/images/ebook-anti-aging.jpg',
                category: 'Beauty',
                tags: ['anti-aging', 'kulit', 'peptide', 'vitalitas'],
                downloads: 0,
                featured: true
            }
        ];
        fs.writeFileSync(EBOOKS_FILE, JSON.stringify(defaultEbooks, null, 2));
    }
};

const readEbooks = () => {
    try {
        const data = fs.readFileSync(EBOOKS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeEbooks = (ebooks) => {
    fs.writeFileSync(EBOOKS_FILE, JSON.stringify(ebooks, null, 2));
};

// Initialize ebooks
initializeEbooks();

// Get ebooks
app.get('/api/ebooks', (req, res) => {
    const ebooks = readEbooks();
    res.json(ebooks);
});

// Download ebook (track downloads)
app.post('/api/ebooks/:id/download', (req, res) => {
    const { id } = req.params;
    const ebooks = readEbooks();
    const ebookIndex = ebooks.findIndex(e => e.id === id);

    if (ebookIndex === -1) {
        return res.status(404).json({ message: 'E-book not found' });
    }

    // Increment download count
    ebooks[ebookIndex].downloads += 1;
    writeEbooks(ebooks);

    res.json({
        message: 'Download tracked successfully',
        downloadUrl: ebooks[ebookIndex].downloadUrl
    });
});



// Product Catalog System
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Initialize products file with comprehensive catalog
const initializeProducts = () => {
    if (!fs.existsSync(PRODUCTS_FILE)) {
        const defaultProducts = [
            // Metabolic Peptides
            {
                id: 'RETATRUTIDE-10MG',
                name: 'Retatrutide 10mg',
                category: 'metabolic',
                description: 'Advanced metabolic optimization peptide for weight management and energy enhancement',
                price: 1500000,
                originalPrice: 1800000,
                dosage: '10mg per vial',
                purity: '99.8%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/retatrutide.jpg',
                benefits: ['Weight management', 'Energy optimization', 'Metabolic health', 'Appetite control'],
                usage: 'Subcutaneous injection, 2-3 times per week',
                tags: ['metabolic', 'weight-loss', 'energy', 'glp-1']
            },
            {
                id: 'MOTS-C-10MG',
                name: 'MOTS-c 10mg',
                category: 'metabolic',
                description: 'Mitochondrial-derived peptide for metabolic activation and cellular energy',
                price: 1300000,
                originalPrice: 1500000,
                dosage: '10mg per vial',
                purity: '99.5%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/mots-c.jpg',
                benefits: ['Metabolic activation', 'Cellular energy', 'Anti-aging', 'Fat metabolism'],
                usage: 'Subcutaneous injection, 2-3 times per week',
                tags: ['metabolic', 'mitochondria', 'energy', 'anti-aging']
            },
            {
                id: 'AOD-9604-2MG',
                name: 'AOD-9604 2mg',
                category: 'metabolic',
                description: 'C-terminal fragment of HGH for targeted fat reduction without affecting growth',
                price: 900000,
                originalPrice: 1100000,
                dosage: '2mg per vial',
                purity: '99.2%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/aod-9604.jpg',
                benefits: ['Targeted fat loss', 'Metabolic enhancement', 'No growth effects', 'Appetite suppression'],
                usage: 'Subcutaneous injection, daily dosing',
                tags: ['metabolic', 'fat-loss', 'hgh-fragment', 'targeted']
            },

            // Growth Hormone Peptides
            {
                id: 'CJC-1295-IPAMORELIN',
                name: 'CJC-1295 + Ipamorelin',
                category: 'growth-hormone',
                description: 'Powerful growth hormone secretagogue blend for muscle growth and recovery',
                price: 2000000,
                originalPrice: 2300000,
                dosage: '2mg CJC-1295 + 2mg Ipamorelin per vial',
                purity: '99.7%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/cjc-ipamorelin.jpg',
                benefits: ['Muscle growth', 'Fat loss', 'Recovery enhancement', 'Sleep quality', 'Anti-aging'],
                usage: 'Subcutaneous injection, nightly before bed',
                tags: ['growth-hormone', 'muscle-growth', 'recovery', 'anti-aging']
            },
            {
                id: 'TESAMORELIN-2MG',
                name: 'Tesamorelin 2mg',
                category: 'growth-hormone',
                description: 'Growth hormone releasing hormone for abdominal fat reduction and HIV lipodystrophy',
                price: 1800000,
                originalPrice: 2100000,
                dosage: '2mg per vial',
                purity: '99.6%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/tesamorelin.jpg',
                benefits: ['Abdominal fat reduction', 'HIV support', 'Metabolic health', 'Body composition'],
                usage: 'Subcutaneous injection, nightly before bed',
                tags: ['growth-hormone', 'fat-loss', 'hiv', 'metabolic']
            },
            {
                id: 'HGH-191AA-10IU',
                name: 'HGH 191AA 10IU',
                category: 'growth-hormone',
                description: 'Full sequence human growth hormone for comprehensive health optimization',
                price: 3000000,
                originalPrice: 3500000,
                dosage: '10IU per vial',
                purity: '99.9%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/hgh-191aa.jpg',
                benefits: ['Muscle growth', 'Fat loss', 'Recovery', 'Anti-aging', 'Immune support', 'Bone health'],
                usage: 'Subcutaneous injection, 3-5 times per week',
                tags: ['growth-hormone', 'muscle-growth', 'anti-aging', 'comprehensive']
            },

            // Anti-Aging Peptides
            {
                id: 'GHK-CU-100MG',
                name: 'GHK-Cu 100mg',
                category: 'anti-aging',
                description: 'Copper tripeptide for tissue repair, wound healing, and skin regeneration',
                price: 1800000,
                originalPrice: 2000000,
                dosage: '100mg per vial',
                purity: '99.4%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/ghk-cu.jpg',
                benefits: ['Skin regeneration', 'Wound healing', 'Hair growth', 'Anti-aging', 'Tissue repair'],
                usage: 'Topical application or subcutaneous injection',
                tags: ['anti-aging', 'skin', 'wound-healing', 'regeneration']
            },
            {
                id: 'EPITHALAMIN-10MG',
                name: 'Epithalamin 10mg',
                category: 'anti-aging',
                description: 'Epithalamin (Epitalon) for telomere protection and anti-aging effects',
                price: 1600000,
                originalPrice: 1900000,
                dosage: '10mg per vial',
                purity: '99.3%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/epithalamin.jpg',
                benefits: ['Telomere protection', 'Anti-aging', 'Longevity', 'Immune modulation'],
                usage: 'Subcutaneous injection, 2-3 times per week',
                tags: ['anti-aging', 'telomere', 'longevity', 'immune']
            },
            {
                id: 'THYMOSIN-ALPHA-1-10MG',
                name: 'Thymosin Alpha-1 10mg',
                category: 'anti-aging',
                description: 'Immune system modulator for enhanced immunity and anti-aging benefits',
                price: 1400000,
                originalPrice: 1700000,
                dosage: '10mg per vial',
                purity: '99.5%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/thymosin-alpha-1.jpg',
                benefits: ['Immune enhancement', 'Anti-aging', 'Viral defense', 'Autoimmune support'],
                usage: 'Subcutaneous injection, 2-3 times per week',
                tags: ['anti-aging', 'immune', 'viral', 'autoimmune']
            },

            // Cognitive Peptides
            {
                id: 'SEMAX-3MG',
                name: 'Semax 3mg',
                category: 'cognitive',
                description: 'Nootropic peptide for cognitive enhancement and neuroprotection',
                price: 1200000,
                originalPrice: 1400000,
                dosage: '3mg per vial',
                purity: '99.6%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/semax.jpg',
                benefits: ['Cognitive enhancement', 'Memory improvement', 'Neuroprotection', 'Focus', 'Stress reduction'],
                usage: 'Intranasal administration, 2-3 times daily',
                tags: ['cognitive', 'nootropic', 'memory', 'neuroprotection']
            },
            {
                id: 'SELANK-3MG',
                name: 'Selank 3mg',
                category: 'cognitive',
                description: 'Anxiolytic peptide for anxiety reduction and cognitive support',
                price: 1000000,
                originalPrice: 1200000,
                dosage: '3mg per vial',
                purity: '99.4%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/selank.jpg',
                benefits: ['Anxiety reduction', 'Cognitive enhancement', 'Stress relief', 'Memory support'],
                usage: 'Sublingual administration, 2-3 times daily',
                tags: ['cognitive', 'anxiety', 'stress', 'memory']
            },
            {
                id: 'NOOPEPT-20MG',
                name: 'Noopept 20mg',
                category: 'cognitive',
                description: 'Smart peptide for learning enhancement and neuroprotection',
                price: 800000,
                originalPrice: 1000000,
                dosage: '20mg per vial',
                purity: '99.2%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/noopept.jpg',
                benefits: ['Learning enhancement', 'Neuroprotection', 'Memory improvement', 'Cognitive function'],
                usage: 'Sublingual administration, 2 times daily',
                tags: ['cognitive', 'learning', 'memory', 'neuroprotection']
            },

            // Recovery & Healing Peptides
            {
                id: 'TB-500-5MG',
                name: 'TB-500 5mg',
                category: 'recovery',
                description: 'Thymosin Beta-4 for tissue repair and injury recovery',
                price: 1500000,
                originalPrice: 1800000,
                dosage: '5mg per vial',
                purity: '99.5%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/tb-500.jpg',
                benefits: ['Tissue repair', 'Injury recovery', 'Muscle healing', 'Anti-inflammatory'],
                usage: 'Subcutaneous injection, 2-3 times per week',
                tags: ['recovery', 'tissue-repair', 'injury', 'healing']
            },
            {
                id: 'BPC-157-5MG',
                name: 'BPC-157 5mg',
                category: 'recovery',
                description: 'Body protection compound for accelerated healing and tissue repair',
                price: 1400000,
                originalPrice: 1700000,
                dosage: '5mg per vial',
                purity: '99.4%',
                labTested: true,
                inStock: true,
                featured: true,
                image: '/images/products/bpc-157.jpg',
                benefits: ['Tendon healing', 'Ligament repair', 'Muscle recovery', 'Gut health', 'Anti-inflammatory'],
                usage: 'Subcutaneous injection, daily for 4-6 weeks',
                tags: ['recovery', 'healing', 'tendon', 'ligament']
            },
            {
                id: 'DSIP-5MG',
                name: 'DSIP 5mg',
                category: 'recovery',
                description: 'Delta sleep-inducing peptide for sleep quality and recovery optimization',
                price: 1100000,
                originalPrice: 1300000,
                dosage: '5mg per vial',
                purity: '99.3%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/dsip.jpg',
                benefits: ['Sleep enhancement', 'Recovery optimization', 'Stress reduction', 'Anti-aging'],
                usage: 'Subcutaneous injection, before bed',
                tags: ['recovery', 'sleep', 'stress', 'anti-aging']
            },

            // Hormone Regulation Peptides
            {
                id: 'KISSPEPTIN-10-10MG',
                name: 'Kisspeptin-10 10mg',
                category: 'hormone',
                description: 'Hormone regulation peptide for fertility and endocrine system support',
                price: 1600000,
                originalPrice: 1900000,
                dosage: '10mg per vial',
                purity: '99.5%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/kisspeptin.jpg',
                benefits: ['Hormone regulation', 'Fertility support', 'Endocrine health', 'Reproductive health'],
                usage: 'Subcutaneous injection, as directed by healthcare provider',
                tags: ['hormone', 'fertility', 'endocrine', 'reproductive']
            },
            {
                id: 'PT-141-10MG',
                name: 'PT-141 10mg',
                category: 'hormone',
                description: 'Sexual dysfunction treatment peptide for male and female sexual health',
                price: 1700000,
                originalPrice: 2000000,
                dosage: '10mg per vial',
                purity: '99.6%',
                labTested: true,
                inStock: true,
                featured: false,
                image: '/images/products/pt-141.jpg',
                benefits: ['Sexual health', 'Libido enhancement', 'Erectile function', 'Sexual wellness'],
                usage: 'Subcutaneous injection, 1-2 hours before activity',
                tags: ['hormone', 'sexual-health', 'libido', 'erectile']
            }
        ];
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(defaultProducts, null, 2));
    }
};

const readProducts = () => {
    try {
        const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeProducts = (products) => {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
};

// Initialize products
initializeProducts();

// Get all products
app.get('/api/products', (req, res) => {
    const products = readProducts();
    const { category, search, featured, sort } = req.query;

    let filteredProducts = [...products];

    // Filter by category
    if (category && category !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category === category);
    }

    // Filter by search term
    if (search) {
        const searchTerm = search.toLowerCase();
        filteredProducts = filteredProducts.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.description.toLowerCase().includes(searchTerm) ||
            p.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }

    // Filter by featured
    if (featured === 'true') {
        filteredProducts = filteredProducts.filter(p => p.featured);
    }

    // Sort products
    if (sort) {
        switch (sort) {
            case 'price-low':
                filteredProducts.sort((a, b) => a.price - b.price);
                break;
            case 'price-high':
                filteredProducts.sort((a, b) => b.price - a.price);
                break;
            case 'name':
                filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'newest':
            default:
                // Keep original order (assuming newer products are added to the end)
                break;
        }
    }

    res.json(filteredProducts);
});

// Get product by ID
app.get('/api/products/:id', (req, res) => {
    const products = readProducts();
    const product = products.find(p => p.id === req.params.id);

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
});

// Get product categories
app.get('/api/products/categories/list', (req, res) => {
    const products = readProducts();
    const categories = [...new Set(products.map(p => p.category))];

    const categoryInfo = {
        metabolic: { name: 'Metabolic Peptides', description: 'Weight management and energy optimization', count: products.filter(p => p.category === 'metabolic').length },
        'growth-hormone': { name: 'Growth Hormone Peptides', description: 'Muscle growth and recovery enhancement', count: products.filter(p => p.category === 'growth-hormone').length },
        'anti-aging': { name: 'Anti-Aging Peptides', description: 'Longevity and cellular regeneration', count: products.filter(p => p.category === 'anti-aging').length },
        cognitive: { name: 'Cognitive Peptides', description: 'Brain health and mental performance', count: products.filter(p => p.category === 'cognitive').length },
        recovery: { name: 'Recovery Peptides', description: 'Tissue repair and healing support', count: products.filter(p => p.category === 'recovery').length },
        hormone: { name: 'Hormone Regulation', description: 'Endocrine system and hormonal balance', count: products.filter(p => p.category === 'hormone').length }
    };

    res.json(categoryInfo);
});

// Search products
app.get('/api/products/search/:query', (req, res) => {
    const products = readProducts();
    const query = req.params.query.toLowerCase();

    const results = products.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some(tag => tag.toLowerCase().includes(query)) ||
        p.category.toLowerCase().includes(query)
    );

    res.json(results);
});

// User Dashboard and Order History
// Get user dashboard data
app.get('/api/user/dashboard', authenticateToken, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.id === req.user.userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Initialize user data if not exists
    if (!user.dashboard) {
        user.dashboard = {
            totalOrders: 0,
            totalSpent: 0,
            favoriteCategory: null,
            lastOrderDate: null,
            memberSince: user.createdAt
        };
    }

    if (!user.orders) {
        user.orders = [];
    }

    if (!user.wishlist) {
        user.wishlist = [];
    }

    // Calculate dashboard stats
    const totalOrders = user.orders.length;
    const totalSpent = user.orders.reduce((sum, order) => sum + order.total, 0);

    // Find favorite category
    const categoryCount = {};
    user.orders.forEach(order => {
        order.items.forEach(item => {
            const product = readProducts().find(p => p.id === item.productId);
            if (product) {
                categoryCount[product.category] = (categoryCount[product.category] || 0) + 1;
            }
        });
    });

    const favoriteCategory = Object.keys(categoryCount).reduce((a, b) =>
        categoryCount[a] > categoryCount[b] ? a : b, null
    );

    user.dashboard.totalOrders = totalOrders;
    user.dashboard.totalSpent = totalSpent;
    user.dashboard.favoriteCategory = favoriteCategory;

    writeUsers(users);

    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt
        },
        dashboard: user.dashboard,
        orders: user.orders.slice(0, 10), // Last 10 orders
        wishlist: user.wishlist
    });
});

// Add to wishlist
app.post('/api/user/wishlist/:productId', authenticateToken, (req, res) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === req.user.userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    const productId = req.params.productId;

    if (!users[userIndex].wishlist) {
        users[userIndex].wishlist = [];
    }

    if (!users[userIndex].wishlist.includes(productId)) {
        users[userIndex].wishlist.push(productId);
        writeUsers(users);
        res.json({ message: 'Product added to wishlist' });
    } else {
        res.status(400).json({ message: 'Product already in wishlist' });
    }
});

// Remove from wishlist
app.delete('/api/user/wishlist/:productId', authenticateToken, (req, res) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === req.user.userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    const productId = req.params.productId;
    const wishlistIndex = users[userIndex].wishlist.indexOf(productId);

    if (wishlistIndex > -1) {
        users[userIndex].wishlist.splice(wishlistIndex, 1);
        writeUsers(users);
        res.json({ message: 'Product removed from wishlist' });
    } else {
        res.status(404).json({ message: 'Product not in wishlist' });
    }
});

// Newsletter subscription
const NEWSLETTER_FILE = path.join(__dirname, 'newsletter.json');

// Initialize newsletter file
const initializeNewsletter = () => {
    if (!fs.existsSync(NEWSLETTER_FILE)) {
        fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify([], null, 2));
    }
};

const readNewsletter = () => {
    try {
        const data = fs.readFileSync(NEWSLETTER_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeNewsletter = (subscribers) => {
    fs.writeFileSync(NEWSLETTER_FILE, JSON.stringify(subscribers, null, 2));
};

// Initialize newsletter
initializeNewsletter();

// Subscribe to newsletter
app.post('/api/newsletter/subscribe', (req, res) => {
    const { email, name } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    const subscribers = readNewsletter();

    // Check if already subscribed
    if (subscribers.find(s => s.email === email)) {
        return res.status(400).json({ message: 'Email already subscribed' });
    }

    const newSubscriber = {
        id: Date.now().toString(),
        email,
        name: name || '',
        subscribedAt: new Date().toISOString(),
        active: true
    };

    subscribers.push(newSubscriber);
    writeNewsletter(subscribers);

    res.status(201).json({ message: 'Successfully subscribed to newsletter' });
});

// Unsubscribe from newsletter
app.post('/api/newsletter/unsubscribe', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    const subscribers = readNewsletter();
    const subscriberIndex = subscribers.findIndex(s => s.email === email);

    if (subscriberIndex === -1) {
        return res.status(404).json({ message: 'Email not found in newsletter' });
    }

    subscribers[subscriberIndex].active = false;
    subscribers[subscriberIndex].unsubscribedAt = new Date().toISOString();

    writeNewsletter(subscribers);

    res.json({ message: 'Successfully unsubscribed from newsletter' });
});

// Contact form submission
app.post('/api/contact', (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // In a real application, you would send an email or save to database
    // For now, we'll just log it and return success
    console.log('Contact form submission:', { name, email, subject, message });

    res.json({ message: 'Message sent successfully. We will get back to you soon!' });
});

// Blog System
// Get all blog posts
app.get('/api/blog', (req, res) => {
    try {
        const { category, featured, limit } = req.query;
        let posts = statements.getAllBlogPosts.all();

        // Filter by category
        if (category && category !== 'all') {
            posts = posts.filter(post => post.category === category);
        }

        // Filter by featured
        if (featured === 'true') {
            posts = posts.filter(post => post.featured === 1);
        }

        // Sort by published date (newest first)
        posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

        // Limit results
        if (limit) {
            posts = posts.slice(0, parseInt(limit));
        }

        res.json(posts);
    } catch (error) {
        console.error('Error fetching blog posts:', error);
        res.status(500).json({ message: 'Error fetching blog posts' });
    }
});

// Get blog post by slug
app.get('/api/blog/:slug', (req, res) => {
    try {
        const post = statements.getBlogPostBySlug.get(req.params.slug);

        if (!post) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        res.json(post);
    } catch (error) {
        console.error('Error fetching blog post:', error);
        res.status(500).json({ message: 'Error fetching blog post' });
    }
});

// Get blog categories
app.get('/api/blog/categories/list', (req, res) => {
    try {
        const posts = statements.getAllBlogPosts.all();
        const categories = [...new Set(posts.map(post => post.category))];

        const categoryInfo = {
            'Education': { name: 'Education', description: 'Educational content about peptides', count: posts.filter(p => p.category === 'Education').length },
            'Growth Hormone': { name: 'Growth Hormone', description: 'Articles about growth hormone peptides', count: posts.filter(p => p.category === 'Growth Hormone').length },
            'Anti-Aging': { name: 'Anti-Aging', description: 'Anti-aging peptide research and guides', count: posts.filter(p => p.category === 'Anti-Aging').length },
            'Cognitive': { name: 'Cognitive', description: 'Cognitive enhancement and nootropics', count: posts.filter(p => p.category === 'Cognitive').length },
            'Recovery': { name: 'Recovery', description: 'Recovery and healing peptides', count: posts.filter(p => p.category === 'Recovery').length },
            'Metabolic': { name: 'Metabolic', description: 'Metabolic health and weight management', count: posts.filter(p => p.category === 'Metabolic').length }
        };

        res.json(categoryInfo);
    } catch (error) {
        console.error('Error fetching blog categories:', error);
        res.status(500).json({ message: 'Error fetching blog categories' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'JOESTAR PEPTIDE API is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 JOESTAR PEPTIDE API server running on port ${PORT}`);
    console.log(`📊 User database: ${USERS_FILE}`);
    console.log(`🛍️ Product catalog: ${PRODUCTS_FILE}`);
});
