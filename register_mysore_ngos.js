require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ngos = [
  'GRAAM',
  'Mysore Resettlement and Development Agency',
  'JSS Mahavidyapeetha',
  'MYRADA',
  'Plan India Mysuru Office',
  'Akshaya Patra Foundation Mysuru',
  'Sneha Kirana Spandana',
  'Prerana Educational and Social Trust',
  'Sri Kshetra Dharmasthala Rural Development Project Mysuru',
  'Mysore District Consumer Forum',
  'Rural Literacy and Health Programme Mysuru',
  'Mahila Samakhya Karnataka Mysuru',
  'Navodaya Foundation Mysuru',
  'Aashodaya Samithi',
  'Samagra Grameena Ashrama Mysuru',
  'Helping Hands Mysuru',
  'Youth for Seva Mysuru',
  'Niveditha Foundation Mysuru',
  'Mysore NGO Forum',
  'Seva Bharathi Mysuru',
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < ngos.length; i += 1) {
    const name = ngos[i];
    const slug = slugify(name);
    const email = `${slug}@gmail.com`;
    const passwordPlain = `${slug}@123`;
    const contact = `9${String(700000000 + i).padStart(9, '0')}`;

    const [exists] = await conn.query('SELECT ngo_id FROM NGO WHERE email = ?', [email]);
    if (exists.length > 0) {
      skipped += 1;
      continue;
    }

    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    await conn.query(
      'INSERT INTO NGO (name, location, contact, email, password) VALUES (?, ?, ?, ?, ?)',
      [name, 'Mysore', contact, email, passwordHash]
    );

    inserted += 1;
  }

  const [recent] = await conn.query(
    'SELECT ngo_id, name, email FROM NGO ORDER BY ngo_id DESC LIMIT 25'
  );

  console.log(JSON.stringify({ inserted, skipped, recent }, null, 2));
  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
