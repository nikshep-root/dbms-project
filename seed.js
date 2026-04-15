require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function seedDatabase() {
    try {
        console.log('Connecting to MySQL (without specific database) to create it...');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true // very important for running SQL scripts!
        });

        const sqlFilePath = path.join(__dirname, 'database.sql');
        console.log(`Reading SQL from: ${sqlFilePath}`);
        const sql = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('Executing database setup script... 🚀');
        await connection.query(sql);

        console.log('✅ Success! `foodbridge` database, tables, and sample data created!');
        await connection.end();
    } catch (err) {
        console.error('❌ Error seeding database:', err.message);
    }
}

seedDatabase();
