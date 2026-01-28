const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

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

// Database file path
const USERS_FILE = path.join(__dirname, 'users.json');

// Helper functions
const readUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    writeUsers([]);
}

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

        const users = readUsers();
        const existingUser = users.find(user => user.email === email);

        if (existingUser) {
            console.log('User already exists:', email);
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        // Handle referral code if provided
        if (referralCode) {
            console.log('Processing referral code:', referralCode);
            const referrer = users.find(user => user.affiliate && user.affiliate.redeemCode === referralCode);
            if (referrer) {
                console.log('Valid referrer found:', referrer.email);
                // Initialize affiliate data for referrer if not exists
                if (!referrer.affiliate) {
                    referrer.affiliate = {
                        redeemCode: `JOESTAR${referrer.id.slice(-4).toUpperCase()}`,
                        referrals: [],
                        commission: 0,
                        totalEarned: 0,
                        level: 'Bronze'
                    };
                }

                // Add referral to referrer's data
                if (!referrer.affiliate.referrals) {
                    referrer.affiliate.referrals = [];
                }

                referrer.affiliate.referrals.push({
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    date: new Date().toISOString(),
                    status: 'registered'
                });

                // Note: Commission will be added when the referred user makes a purchase
                // This is tracked via the /api/affiliate/track endpoint
            } else {
                console.log('Invalid referral code:', referralCode);
            }
            // If referral code is invalid, we still allow registration but don't track it
        }

        users.push(newUser);
        writeUsers(users);
        console.log('User created successfully:', newUser.email);

        // Create JWT token
        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email
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

        const users = readUsers();
        console.log('Total users in database:', users.length);
        const user = users.find(u => u.email === email);

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
    const users = readUsers();
    const user = users.find(u => u.id === req.user.userId);

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt
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

// Affiliate System
// Get affiliate dashboard data
app.get('/api/affiliate/dashboard', authenticateToken, (req, res) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === req.user.userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Initialize affiliate data if not exists
    if (!users[userIndex].affiliate) {
        const redeemCode = `JOESTAR${users[userIndex].id.slice(-4).toUpperCase()}`;
        users[userIndex].affiliate = {
            redeemCode: redeemCode,
            referrals: [],
            commission: 0,
            totalEarned: 0,
            level: 'Bronze'
        };

        // Generate a discount code for the affiliate
        const discountCodes = readDiscountCodes();
        const existingCode = discountCodes.find(c => c.code === redeemCode);
        if (!existingCode) {
            const newDiscountCode = {
                id: `AFFILIATE_${users[userIndex].id}`,
                code: redeemCode,
                discount: 20,
                type: 'percentage',
                maxUses: 1,
                usedCount: 0,
                validUntil: '2024-12-31',
                active: true,
                description: `Affiliate discount code for ${users[userIndex].name}`
            };
            discountCodes.push(newDiscountCode);
            writeDiscountCodes(discountCodes);
        }

        writeUsers(users);
    }

    res.json({
        affiliate: users[userIndex].affiliate,
        referralLink: `https://joestarpeptide.com?ref=${users[userIndex].affiliate.redeemCode}`
    });
});

// Generate affiliate redeem code
app.post('/api/affiliate/generate-code', authenticateToken, (req, res) => {
    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === req.user.userId);

    if (userIndex === -1) {
        return res.status(404).json({ message: 'User not found' });
    }

    if (!users[userIndex].affiliate) {
        const redeemCode = `JOESTAR${users[userIndex].id.slice(-4).toUpperCase()}`;
        users[userIndex].affiliate = {
            redeemCode: redeemCode,
            referrals: [],
            commission: 0,
            totalEarned: 0,
            level: 'Bronze'
        };

        // Generate a discount code for the affiliate
        const discountCodes = readDiscountCodes();
        const existingCode = discountCodes.find(c => c.code === redeemCode);
        if (!existingCode) {
            const newDiscountCode = {
                id: `AFFILIATE_${users[userIndex].id}`,
                code: redeemCode,
                discount: 20,
                type: 'percentage',
                maxUses: 1,
                usedCount: 0,
                validUntil: '2024-12-31',
                active: true,
                description: `Affiliate discount code for ${users[userIndex].name}`
            };
            discountCodes.push(newDiscountCode);
            writeDiscountCodes(discountCodes);
        }
    }

    writeUsers(users);

    res.json({
        message: 'Affiliate redeem code generated successfully',
        affiliate: users[userIndex].affiliate,
        referralLink: `https://joestarpeptide.com?ref=${users[userIndex].affiliate.redeemCode}`
    });
});

// Track referral (when someone uses affiliate redeem code)
app.post('/api/affiliate/track', (req, res) => {
    const { affiliateCode, orderAmount } = req.body;

    if (!affiliateCode || !orderAmount) {
        return res.status(400).json({ message: 'Affiliate code and order amount are required' });
    }

    const users = readUsers();
    const affiliateUser = users.find(u => u.affiliate && u.affiliate.redeemCode === affiliateCode);

    if (!affiliateUser) {
        return res.status(404).json({ message: 'Invalid affiliate code' });
    }

    // Calculate commission (4% of order amount)
    const commission = orderAmount * 0.04;

    // Add referral
    if (!affiliateUser.affiliate.referrals) {
        affiliateUser.affiliate.referrals = [];
    }

    affiliateUser.affiliate.referrals.push({
        id: Date.now().toString(),
        amount: orderAmount,
        commission: commission,
        date: new Date().toISOString()
    });

    affiliateUser.affiliate.commission += commission;
    affiliateUser.affiliate.totalEarned += commission;

    // Update affiliate level based on total earned
    if (affiliateUser.affiliate.totalEarned >= 1000000) {
        affiliateUser.affiliate.level = 'Diamond';
    } else if (affiliateUser.affiliate.totalEarned >= 500000) {
        affiliateUser.affiliate.level = 'Gold';
    } else if (affiliateUser.affiliate.totalEarned >= 100000) {
        affiliateUser.affiliate.level = 'Silver';
    }

    writeUsers(users);

    res.json({
        message: 'Referral tracked successfully',
        commission: commission
    });
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



// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'JOESTAR PEPTIDE API is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 JOESTAR PEPTIDE API server running on port ${PORT}`);
    console.log(`📊 User database: ${USERS_FILE}`);
});
