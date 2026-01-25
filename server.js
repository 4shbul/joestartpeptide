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
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const users = readUsers();
        const existingUser = users.find(user => user.email === email);

        if (existingUser) {
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

        users.push(newUser);
        writeUsers(users);

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
        res.status(500).json({ message: 'Server error' });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const users = readUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

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
        res.status(500).json({ message: 'Server error' });
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



// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'JOESTAR PEPTIDE API is running' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 JOESTAR PEPTIDE API server running on port ${PORT}`);
    console.log(`📊 User database: ${USERS_FILE}`);
});
