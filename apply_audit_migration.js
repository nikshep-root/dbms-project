require('dotenv').config();
const mysql = require('mysql2/promise');

async function applyAuditMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'foodbridge'
  });

  const statements = [
    `CREATE TABLE IF NOT EXISTS Audit_Log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(64) NOT NULL,
      row_id INT,
      action VARCHAR(16) NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      who VARCHAR(100) DEFAULT NULL,
      payload JSON DEFAULT NULL
    )`,

    `DROP TRIGGER IF EXISTS req_audit_after_insert`,
    `CREATE TRIGGER req_audit_after_insert
      AFTER INSERT ON Request
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Request', NEW.request_id, 'INSERT', CURRENT_USER(),
        JSON_OBJECT(
          'request_id', NEW.request_id,
          'ngo_id', NEW.ngo_id,
          'food_id', NEW.food_id,
          'status', NEW.status,
          'remarks', COALESCE(NEW.remarks, ''),
          'request_time', DATE_FORMAT(NEW.request_time, '%Y-%m-%d %H:%i:%s')
        )
      )`,

    `DROP TRIGGER IF EXISTS req_audit_after_update`,
    `CREATE TRIGGER req_audit_after_update
      AFTER UPDATE ON Request
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Request', NEW.request_id, 'UPDATE', CURRENT_USER(),
        JSON_OBJECT(
          'old', JSON_OBJECT('status', OLD.status, 'remarks', COALESCE(OLD.remarks, '')),
          'new', JSON_OBJECT('status', NEW.status, 'remarks', COALESCE(NEW.remarks, ''))
        )
      )`,

    `DROP TRIGGER IF EXISTS req_audit_after_delete`,
    `CREATE TRIGGER req_audit_after_delete
      AFTER DELETE ON Request
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Request', OLD.request_id, 'DELETE', CURRENT_USER(),
        JSON_OBJECT('request_id', OLD.request_id, 'ngo_id', OLD.ngo_id, 'food_id', OLD.food_id)
      )`,

    `DROP TRIGGER IF EXISTS food_audit_after_insert`,
    `CREATE TRIGGER food_audit_after_insert
      AFTER INSERT ON Food_Listing
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Food_Listing', NEW.food_id, 'INSERT', CURRENT_USER(),
        JSON_OBJECT(
          'food_id', NEW.food_id,
          'restaurant_id', NEW.restaurant_id,
          'food_name', NEW.food_name,
          'quantity', NEW.quantity,
          'expiry_time', DATE_FORMAT(NEW.expiry_time, '%Y-%m-%d %H:%i:%s'),
          'status', NEW.status
        )
      )`,

    `DROP TRIGGER IF EXISTS food_audit_after_update`,
    `CREATE TRIGGER food_audit_after_update
      AFTER UPDATE ON Food_Listing
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Food_Listing', NEW.food_id, 'UPDATE', CURRENT_USER(),
        JSON_OBJECT('old', JSON_OBJECT('status', OLD.status), 'new', JSON_OBJECT('status', NEW.status))
      )`,

    `DROP TRIGGER IF EXISTS food_audit_after_delete`,
    `CREATE TRIGGER food_audit_after_delete
      AFTER DELETE ON Food_Listing
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES ('Food_Listing', OLD.food_id, 'DELETE', CURRENT_USER(), JSON_OBJECT('food_id', OLD.food_id))`,

    `DROP TRIGGER IF EXISTS del_audit_after_insert`,
    `CREATE TRIGGER del_audit_after_insert
      AFTER INSERT ON Delivery
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Delivery', NEW.delivery_id, 'INSERT', CURRENT_USER(),
        JSON_OBJECT('delivery_id', NEW.delivery_id, 'request_id', NEW.request_id, 'delivery_status', NEW.delivery_status)
      )`,

    `DROP TRIGGER IF EXISTS del_audit_after_update`,
    `CREATE TRIGGER del_audit_after_update
      AFTER UPDATE ON Delivery
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES (
        'Delivery', NEW.delivery_id, 'UPDATE', CURRENT_USER(),
        JSON_OBJECT('old', JSON_OBJECT('delivery_status', OLD.delivery_status), 'new', JSON_OBJECT('delivery_status', NEW.delivery_status))
      )`,

    `DROP TRIGGER IF EXISTS del_audit_after_delete`,
    `CREATE TRIGGER del_audit_after_delete
      AFTER DELETE ON Delivery
      FOR EACH ROW
      INSERT INTO Audit_Log (table_name, row_id, action, who, payload)
      VALUES ('Delivery', OLD.delivery_id, 'DELETE', CURRENT_USER(), JSON_OBJECT('delivery_id', OLD.delivery_id))`
  ];

  try {
    console.log('Applying non-destructive audit migration...');
    for (const sql of statements) {
      await connection.query(sql);
    }
    console.log('Success: Audit_Log table and triggers are now applied.');
  } finally {
    await connection.end();
  }
}

applyAuditMigration().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
});
