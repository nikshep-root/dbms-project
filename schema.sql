CREATE DATABASE IF NOT EXISTS food_waste_db;
USE food_waste_db;

CREATE TABLE IF NOT EXISTS Restaurant (
    restaurant_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(150) NOT NULL,
    contact VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS NGO (
    ngo_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    location VARCHAR(150) NOT NULL,
    contact VARCHAR(30) NOT NULL
);

CREATE TABLE IF NOT EXISTS App_User (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash CHAR(64) NOT NULL,
    role ENUM('admin', 'restaurant', 'ngo') NOT NULL,
    restaurant_id INT NULL,
    ngo_id INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_restaurant FOREIGN KEY (restaurant_id)
        REFERENCES Restaurant(restaurant_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_user_ngo FOREIGN KEY (ngo_id)
        REFERENCES NGO(ngo_id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS Food_Listing (
    food_id INT AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT NOT NULL,
    food_name VARCHAR(120) NOT NULL,
    quantity INT NOT NULL,
    expiry_time DATETIME NOT NULL,
    status ENUM('Available', 'Requested', 'Allocated', 'Expired') NOT NULL DEFAULT 'Available',
    CONSTRAINT fk_food_restaurant FOREIGN KEY (restaurant_id)
        REFERENCES Restaurant(restaurant_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `Request` (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    ngo_id INT NOT NULL,
    food_id INT NOT NULL,
    request_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    CONSTRAINT fk_request_ngo FOREIGN KEY (ngo_id)
        REFERENCES NGO(ngo_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_request_food FOREIGN KEY (food_id)
        REFERENCES Food_Listing(food_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Delivery (
    delivery_id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL UNIQUE,
    delivery_status ENUM('Pending', 'In Transit', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Pending',
    delivery_time DATETIME NULL,
    CONSTRAINT fk_delivery_request FOREIGN KEY (request_id)
        REFERENCES `Request`(request_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Audit_Log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    admin_user_id INT NOT NULL,
    action_type VARCHAR(60) NOT NULL,
    request_id INT NULL,
    details VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_admin_user FOREIGN KEY (admin_user_id)
        REFERENCES App_User(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_audit_request FOREIGN KEY (request_id)
        REFERENCES `Request`(request_id)
        ON DELETE SET NULL
);

-- Performance indexes (created only if missing)
SET @idx_food_restaurant := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'Food_Listing'
      AND index_name = 'idx_food_listing_restaurant'
);
SET @sql_food_restaurant := IF(
    @idx_food_restaurant = 0,
    'CREATE INDEX idx_food_listing_restaurant ON Food_Listing (restaurant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_food_restaurant;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_request_ngo := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'Request'
      AND index_name = 'idx_request_ngo'
);
SET @sql_request_ngo := IF(
    @idx_request_ngo = 0,
    'CREATE INDEX idx_request_ngo ON `Request` (ngo_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_request_ngo;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_request_food := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'Request'
      AND index_name = 'idx_request_food'
);
SET @sql_request_food := IF(
    @idx_request_food = 0,
    'CREATE INDEX idx_request_food ON `Request` (food_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_request_food;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_delivery_request := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'Delivery'
      AND index_name = 'idx_delivery_request'
);
SET @sql_delivery_request := IF(
    @idx_delivery_request = 0,
    'CREATE INDEX idx_delivery_request ON Delivery (request_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_delivery_request;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_audit_created := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'Audit_Log'
      AND index_name = 'idx_audit_created'
);
SET @sql_audit_created := IF(
    @idx_audit_created = 0,
    'CREATE INDEX idx_audit_created ON Audit_Log (created_at)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_audit_created;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed data for quick testing
INSERT INTO Restaurant (name, location, contact)
SELECT * FROM (
    SELECT 'Fresh Bites', 'Downtown', '+1-555-0101'
) AS tmp
WHERE NOT EXISTS (
    SELECT 1 FROM Restaurant WHERE name = 'Fresh Bites'
);

INSERT INTO NGO (name, location, contact)
SELECT * FROM (
    SELECT 'Care Hands NGO', 'Central City', '+1-555-0202'
) AS tmp
WHERE NOT EXISTS (
    SELECT 1 FROM NGO WHERE name = 'Care Hands NGO'
);

INSERT INTO App_User (username, password_hash, role, restaurant_id, ngo_id)
SELECT * FROM (
    SELECT 'admin' AS username,
           '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9' AS password_hash,
           'admin' AS role,
           NULL AS restaurant_id,
           NULL AS ngo_id
) AS tmp
WHERE NOT EXISTS (
        SELECT 1 FROM App_User WHERE username = 'admin'
);

INSERT INTO App_User (username, password_hash, role, restaurant_id, ngo_id)
SELECT 'freshbites',
             'a800496895e048871c320e89ee62f018716a015fd83ede6767779b36be62077c',
             'restaurant',
             r.restaurant_id,
             NULL
FROM Restaurant r
WHERE r.name = 'Fresh Bites'
    AND NOT EXISTS (SELECT 1 FROM App_User WHERE username = 'freshbites');

INSERT INTO App_User (username, password_hash, role, restaurant_id, ngo_id)
SELECT 'carehands',
             '060fe28178c35c127d8382fc7f8d9a30946251ec8b6d11793833f3d1c081c625',
             'ngo',
             NULL,
             n.ngo_id
FROM NGO n
WHERE n.name = 'Care Hands NGO'
    AND NOT EXISTS (SELECT 1 FROM App_User WHERE username = 'carehands');
