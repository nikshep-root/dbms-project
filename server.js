const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // Serve static files like index.html and images

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_foodbridge_key_2026';

console.log('Environment variables loaded:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PORT:', process.env.DB_PORT);

// Create MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'foodbridge',
    port: process.env.DB_PORT || 3306,
    ssl: false, // Disable SSL for localhost connections
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access Denied. Login required.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
        req.user = user;
        next();
    });
};

/* ====================================
   AUTHENTICATION ROUTES
==================================== */

// REGISTRATION
app.post('/api/auth/register', async (req, res) => {
    const { role, name, location, contact, email, password, extraInfo } = req.body;

    try {
        if (!['restaurant', 'ngo'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role selected.' });
        }

        if (!name || !location || !contact || !email || !password) {
            return res.status(400).json({ error: 'All registration fields are required.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const table = role === 'restaurant' ? 'Restaurant' : 'NGO';

        // Prevent same email from being registered in either role table.
        const [existingRestaurant] = await pool.query(`SELECT email FROM Restaurant WHERE email = ?`, [email]);
        const [existingNgo] = await pool.query(`SELECT email FROM NGO WHERE email = ?`, [email]);
        if (existingRestaurant.length > 0 || existingNgo.length > 0) {
            return res.status(400).json({ error: 'Email already registered.' });
        }

        const query = `INSERT INTO ${table} (name, location, contact, email, password) VALUES (?, ?, ?, ?, ?)`;
        const [result] = await pool.query(query, [name.trim(), location.trim(), contact.trim(), email.trim(), hashedPassword]);

        // Backward compatibility: if legacy App_User exists, mirror new user there too.
        const [appUserTable] = await pool.query("SHOW TABLES LIKE 'App_User'");
        if (appUserTable.length > 0) {
            const legacyPasswordHash = crypto.createHash('sha256').update(password).digest('hex');
            const legacyUsername = `${role}_${result.insertId}`;

            if (role === 'restaurant') {
                await pool.query(
                    `
                    INSERT INTO App_User (username, password_hash, role, restaurant_id, ngo_id, is_active)
                    VALUES (?, ?, 'restaurant', ?, NULL, 1)
                    `,
                    [legacyUsername, legacyPasswordHash, result.insertId]
                );
            } else {
                await pool.query(
                    `
                    INSERT INTO App_User (username, password_hash, role, restaurant_id, ngo_id, is_active)
                    VALUES (?, ?, 'ngo', NULL, ?, 1)
                    `,
                    [legacyUsername, legacyPasswordHash, result.insertId]
                );
            }
        }

        const token = jwt.sign(
            { id: role === 'restaurant' ? result.insertId : result.insertId, role, name: name.trim() },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.status(201).json({
            message: 'Registration successful!',
            id: result.insertId,
            token,
            user: { name: name.trim(), role }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error during registration.' });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { role, email, password } = req.body;
    console.log('Login attempt:', { role, email, password: '***' });

    try {
        if (role && !['restaurant', 'ngo'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role selected.' });
        }

        const [restaurantRows] = await pool.query(`SELECT * FROM Restaurant WHERE email = ?`, [email]);
        const [ngoRows] = await pool.query(`SELECT * FROM NGO WHERE email = ?`, [email]);

        const candidates = [];
        if (restaurantRows.length > 0) candidates.push({ role: 'restaurant', user: restaurantRows[0] });
        if (ngoRows.length > 0) candidates.push({ role: 'ngo', user: ngoRows[0] });

        if (candidates.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        let matched = null;
        for (const candidate of candidates) {
            const valid = await bcrypt.compare(password, candidate.user.password);
            if (valid) {
                matched = candidate;
                break;
            }
        }

        if (!matched) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const resolvedRole = matched.role;
        const user = matched.user;

        // Generate JWT using DB-resolved role to keep UI and permissions consistent.
        const token = jwt.sign(
            { id: resolvedRole === 'restaurant' ? user.restaurant_id : user.ngo_id, role: resolvedRole, name: user.name },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        const roleSwitched = role && role !== resolvedRole;
        res.json({
            message: roleSwitched ? `Logged in as ${resolvedRole}.` : 'Login successful',
            token,
            user: { name: user.name, role: resolvedRole }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Database error during login.' });
    }
});

/* ====================================
   DASHBOARD ROUTES 
==================================== */

// PROFILE & HISTORY ROUTE
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { id, role } = req.user;
        let profileDetails, history;

        if (role === 'restaurant') {
            // Get Restaurant Profile
            const [users] = await pool.query('SELECT name, email, location, contact FROM Restaurant WHERE restaurant_id = ?', [id]);
            profileDetails = users[0];

            // Get Listing History
            const [listings] = await pool.query('SELECT food_name, quantity, status, created_at FROM Food_Listing WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 10', [id]);
            history = listings.map(l => ({
                action: `Listed ${l.food_name} (${l.quantity})`,
                status: l.status,
                time: l.created_at
            }));

        } else {
            // Get NGO Profile
            const [users] = await pool.query('SELECT name, email, location, contact FROM NGO WHERE ngo_id = ?', [id]);
            profileDetails = users[0];

            // Get Request History
            const [requests] = await pool.query(`
                SELECT r.status, r.request_time, f.food_name 
                FROM Request r 
                JOIN Food_Listing f ON r.food_id = f.food_id 
                WHERE r.ngo_id = ? ORDER BY r.request_time DESC LIMIT 10
            `, [id]);
            history = requests.map(r => ({
                action: `Requested ${r.food_name}`,
                status: r.status,
                time: r.request_time
            }));
        }

        res.json({
            profile: profileDetails,
            history: history
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error fetching profile.' });
    }
});

// RESTAURANT STATS
app.get('/api/dashboard/stats/restaurant', authenticateToken, async (req, res) => {
    if (req.user.role !== 'restaurant') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const restId = req.user.id;

        const [[{ active_count }]] = await pool.query(`SELECT COUNT(*) as active_count FROM Food_Listing WHERE restaurant_id = ? AND status = 'Available'`, [restId]);
        const [[{ deliveries_today }]] = await pool.query(`SELECT COUNT(*) as deliveries_today FROM Delivery d JOIN Request r ON d.request_id = r.request_id JOIN Food_Listing f ON r.food_id = f.food_id WHERE f.restaurant_id = ? AND d.delivery_time IS NOT NULL AND DATE(d.delivery_time) = CURDATE()`, [restId]);
        const [[{ meals_saved }]] = await pool.query(`SELECT COALESCE(SUM(CAST(SUBSTRING_INDEX(f.quantity, ' ', 1) AS DECIMAL(10,2))), 0) as meals_saved FROM Food_Listing f JOIN Request r ON f.food_id = r.food_id JOIN Delivery d ON d.request_id = r.request_id WHERE f.restaurant_id = ? AND d.delivery_status = 'Delivered'`, [restId]);
        const [[{ expiring_soon }]] = await pool.query(`SELECT COUNT(*) as expiring_soon FROM Food_Listing WHERE restaurant_id = ? AND status = 'Available' AND expiry_time <= DATE_ADD(NOW(), INTERVAL 2 HOUR)`, [restId]);

        res.json({
            active_listings: active_count,
            deliveries_today: deliveries_today,
            meals_saved: meals_saved,
            expiring_soon: expiring_soon
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error fetching stats.' });
    }
});

// NGO STATS
app.get('/api/dashboard/stats/ngo', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ngo') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const ngoId = req.user.id;

        const [[{ pending_count }]] = await pool.query(`SELECT COUNT(*) as pending_count FROM Request WHERE ngo_id = ? AND status = 'Pending'`, [ngoId]);
        const [[{ in_transit }]] = await pool.query(`SELECT COUNT(*) as in_transit FROM Request r JOIN Delivery d ON r.request_id = d.request_id WHERE r.ngo_id = ? AND d.delivery_status = 'In Transit'`, [ngoId]);
        const [[{ meals_received }]] = await pool.query(`SELECT COALESCE(SUM(CAST(SUBSTRING_INDEX(f.quantity, ' ', 1) AS DECIMAL(10,2))), 0) as meals_received FROM Request r JOIN Food_Listing f ON r.food_id = f.food_id JOIN Delivery d ON d.request_id = r.request_id WHERE r.ngo_id = ? AND d.delivery_status = 'Delivered'`, [ngoId]);
        const [[{ partners }]] = await pool.query(`SELECT COUNT(DISTINCT f.restaurant_id) as partners FROM Request r JOIN Food_Listing f ON r.food_id = f.food_id WHERE r.ngo_id = ? AND r.status IN ('Approved')`, [ngoId]);

        res.json({
            pending_requests: pending_count,
            in_transit: in_transit,
            meals_received: meals_received,
            partner_restaurants: partners
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error fetching stats.' });
    }
});

/* ====================================
   FOOD & REQUEST ROUTES 
==================================== */

// Create Food Listing (Restaurant)
app.post('/api/food-listings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'restaurant') return res.status(403).json({ error: 'Unauthorized' });
    const { food_name, quantity, expiry_time } = req.body;
    try {
        await pool.query(`INSERT INTO Food_Listing (restaurant_id, food_name, quantity, expiry_time, status) VALUES (?, ?, ?, ?, 'Available')`, [req.user.id, food_name, quantity, expiry_time || null]);
        res.json({ message: 'Listing created successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error creating listing' });
    }
});

// Get My Listings (Restaurant)
app.get('/api/food-listings/me', authenticateToken, async (req, res) => {
    if (req.user.role !== 'restaurant') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const [listings] = await pool.query(`SELECT * FROM Food_Listing WHERE restaurant_id = ? ORDER BY created_at DESC`, [req.user.id]);
        res.json({ listings });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Browse Available Food (NGO)
app.get('/api/food/available', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ngo') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const [foods] = await pool.query(`SELECT f.*, r.name as restaurant_name, r.location FROM Food_Listing f JOIN Restaurant r ON f.restaurant_id = r.restaurant_id WHERE f.status = 'Available' AND (f.expiry_time IS NULL OR f.expiry_time > NOW()) ORDER BY f.created_at DESC`);
        res.json({ foods });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

// Request Food (NGO)
app.post('/api/requests', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ngo') return res.status(403).json({ error: 'Unauthorized' });
    const { food_id } = req.body;
    try {
        await pool.query(`UPDATE Food_Listing SET status = 'Requested' WHERE food_id = ? AND status = 'Available'`, [food_id]);
        await pool.query(`INSERT INTO Request (food_id, ngo_id, status) VALUES (?, ?, 'Pending')`, [food_id, req.user.id]);
        res.json({ message: 'Food requested successfully!' });
    } catch (err) { res.status(500).json({ error: 'Database error requesting food' }); }
});

// Get requests for current user context
app.get('/api/requests/me', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'restaurant') {
            const [rows] = await pool.query(`
                SELECT
                    r.request_id,
                    r.status,
                    r.request_time,
                    n.name AS ngo_name,
                    f.food_name,
                    f.quantity
                FROM Request r
                JOIN Food_Listing f ON r.food_id = f.food_id
                JOIN NGO n ON r.ngo_id = n.ngo_id
                WHERE f.restaurant_id = ?
                ORDER BY r.request_time DESC
            `, [req.user.id]);

            return res.json({ requests: rows });
        }

        if (req.user.role === 'ngo') {
            const [rows] = await pool.query(`
                SELECT
                    r.request_id,
                    r.status,
                    r.request_time,
                    f.food_name,
                    f.quantity,
                    rs.name AS restaurant_name
                FROM Request r
                JOIN Food_Listing f ON r.food_id = f.food_id
                JOIN Restaurant rs ON f.restaurant_id = rs.restaurant_id
                WHERE r.ngo_id = ?
                ORDER BY r.request_time DESC
            `, [req.user.id]);

            return res.json({ requests: rows });
        }

        return res.status(403).json({ error: 'Unauthorized' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error fetching requests' });
    }
});

// Approve or reject a request (Restaurant only)
app.patch('/api/requests/:requestId/decision', authenticateToken, async (req, res) => {
    if (req.user.role !== 'restaurant') return res.status(403).json({ error: 'Unauthorized' });

    const requestId = Number(req.params.requestId);
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(`
            SELECT r.request_id, r.status, r.food_id, f.restaurant_id
            FROM Request r
            JOIN Food_Listing f ON r.food_id = f.food_id
            WHERE r.request_id = ?
            LIMIT 1
        `, [requestId]);

        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Request not found.' });
        }

        const requestRow = rows[0];
        if (requestRow.restaurant_id !== req.user.id) {
            await conn.rollback();
            return res.status(403).json({ error: 'You can only manage your own listing requests.' });
        }

        if (requestRow.status !== 'Pending') {
            await conn.rollback();
            return res.status(400).json({ error: 'Only pending requests can be updated.' });
        }

        if (action === 'approve') {
            await conn.query(`UPDATE Request SET status = 'Approved' WHERE request_id = ?`, [requestId]);
            await conn.query(`UPDATE Food_Listing SET status = 'Allocated' WHERE food_id = ?`, [requestRow.food_id]);

            await conn.query(`
                INSERT INTO Delivery (request_id, delivery_status)
                VALUES (?, 'Pending')
                ON DUPLICATE KEY UPDATE delivery_status = VALUES(delivery_status)
            `, [requestId]);
        } else {
            await conn.query(`UPDATE Request SET status = 'Rejected' WHERE request_id = ?`, [requestId]);
            await conn.query(`UPDATE Food_Listing SET status = 'Available' WHERE food_id = ?`, [requestRow.food_id]);
        }

        await conn.commit();
        return res.json({ message: `Request ${action}d successfully.` });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ error: 'Database error updating request decision' });
    } finally {
        conn.release();
    }
});

// Delivery tracker for current user
app.get('/api/deliveries/me', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'restaurant') {
            const [rows] = await pool.query(`
                SELECT
                    d.delivery_id,
                    d.delivery_status,
                    d.delivery_time,
                    d.delivery_agent,
                    d.agent_phone,
                    r.request_id,
                    r.request_time,
                    n.name AS ngo_name,
                    f.food_name,
                    f.quantity
                FROM Delivery d
                JOIN Request r ON d.request_id = r.request_id
                JOIN Food_Listing f ON r.food_id = f.food_id
                JOIN NGO n ON r.ngo_id = n.ngo_id
                WHERE f.restaurant_id = ?
                ORDER BY r.request_time DESC
            `, [req.user.id]);

            return res.json({ deliveries: rows });
        }

        if (req.user.role === 'ngo') {
            const [rows] = await pool.query(`
                SELECT
                    d.delivery_id,
                    d.delivery_status,
                    d.delivery_time,
                    d.delivery_agent,
                    d.agent_phone,
                    r.request_id,
                    r.request_time,
                    rs.name AS restaurant_name,
                    f.food_name,
                    f.quantity
                FROM Delivery d
                JOIN Request r ON d.request_id = r.request_id
                JOIN Food_Listing f ON r.food_id = f.food_id
                JOIN Restaurant rs ON f.restaurant_id = rs.restaurant_id
                WHERE r.ngo_id = ?
                ORDER BY r.request_time DESC
            `, [req.user.id]);

            return res.json({ deliveries: rows });
        }

        return res.status(403).json({ error: 'Unauthorized' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error fetching deliveries' });
    }
});

// Update delivery status (Restaurant only)
app.patch('/api/deliveries/:deliveryId/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'restaurant') return res.status(403).json({ error: 'Unauthorized' });

    const deliveryId = Number(req.params.deliveryId);
    const { status, delivery_agent, agent_phone } = req.body;
    const agentName = typeof delivery_agent === 'string' ? delivery_agent.trim() : '';
    const agentPhone = typeof agent_phone === 'string' ? agent_phone.trim() : '';
    const allowed = ['In Transit', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid delivery status.' });
    }

    if (status === 'In Transit' && (!agentName || !agentPhone)) {
        return res.status(400).json({ error: 'Delivery agent name and phone are required for In Transit.' });
    }

    if (agentPhone && !/^[0-9+()\-\s]{7,20}$/.test(agentPhone)) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT d.delivery_id, f.restaurant_id
            FROM Delivery d
            JOIN Request r ON d.request_id = r.request_id
            JOIN Food_Listing f ON r.food_id = f.food_id
            WHERE d.delivery_id = ?
            LIMIT 1
        `, [deliveryId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Delivery not found.' });
        }

        if (rows[0].restaurant_id !== req.user.id) {
            return res.status(403).json({ error: 'You can only update your own deliveries.' });
        }

        if (status === 'Delivered') {
            await pool.query(
                `
                UPDATE Delivery
                SET
                    delivery_status = ?,
                    delivery_time = NOW(),
                    delivery_agent = COALESCE(NULLIF(?, ''), delivery_agent),
                    agent_phone = COALESCE(NULLIF(?, ''), agent_phone)
                WHERE delivery_id = ?
                `,
                [status, agentName, agentPhone, deliveryId]
            );
        } else {
            await pool.query(
                `
                UPDATE Delivery
                SET
                    delivery_status = ?,
                    delivery_agent = COALESCE(NULLIF(?, ''), delivery_agent),
                    agent_phone = COALESCE(NULLIF(?, ''), agent_phone)
                WHERE delivery_id = ?
                `,
                [status, agentName, agentPhone, deliveryId]
            );
        }

        return res.json({ message: 'Delivery status updated successfully.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error updating delivery status' });
    }
});

// Serve the app initially
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Export the app for Vercel
module.exports = app;

// Only start the server if executed directly (not when imported by Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}
