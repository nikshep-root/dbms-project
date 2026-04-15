const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function updatePasswords() {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'foodbridge',
        });

        const hashedPassword = await bcrypt.hash('pass123', 10);

        console.log('Updating all Restaurant and NGO sample passwords to proper bcrypt hashes...');
        await pool.query('UPDATE Restaurant SET password = ?', [hashedPassword]);
        await pool.query('UPDATE NGO SET password = ?', [hashedPassword]);

        console.log('✅ Success! Sample users can now log in securely with password: pass123');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

updatePasswords();
