require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const restaurants = [
  'RRR Restaurant',
  'Mylari Hotel',
  'Original Vinayaka Mylari',
  'Hotel Hanumanthu',
  'Nalpak Restaurant',
  'Pai Vista Restaurant',
  'The Old House',
  'Oyster Bay',
  'Mahesh Prasad',
  'Green Heritage',
  'Annapoorna Restaurant',
  'Sandy 24x7',
  'Mysore Dhonne Biryani House',
  'Gufha Restaurant',
  'Suvarna Bhavan',
  'Tegu Mess',
  'Aroma Family Restaurant',
  'Hotel Siddharta',
  'Davanagere Benne Dose Mysore',
  'Mysore Woodlands',
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

  for (let i = 0; i < restaurants.length; i += 1) {
    const name = restaurants[i];
    const slug = slugify(name);
    const email = `${slug}@gmail.com`;
    const passwordPlain = `${slug}@123`;
    const contact = `9${String(800000000 + i).padStart(9, '0')}`;

    const [exists] = await conn.query(
      'SELECT restaurant_id FROM Restaurant WHERE email = ?',
      [email]
    );

    if (exists.length > 0) {
      skipped += 1;
      continue;
    }

    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    await conn.query(
      'INSERT INTO Restaurant (name, location, contact, email, password) VALUES (?, ?, ?, ?, ?)',
      [name, 'Mysore', contact, email, passwordHash]
    );

    inserted += 1;
  }

  const [recent] = await conn.query(
    'SELECT restaurant_id, name, email FROM Restaurant ORDER BY restaurant_id DESC LIMIT 25'
  );

  console.log(JSON.stringify({ inserted, skipped, recent }, null, 2));
  await conn.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
