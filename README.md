# 🍱 FoodBridge — Food Waste Management System

> **DBMS Mini Project** | Full-Stack Web Application  
> Built with **Node.js**, **Express**, **MySQL**, and a modern **HTML/CSS/JS** frontend.

FoodBridge is a real-world database-driven platform that connects restaurants having surplus food with NGOs that distribute it to people in need. It demonstrates core DBMS concepts including relational schema design, normalization, foreign key constraints, transactions, triggers, and complex SQL queries.

---

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Database Design](#-database-design)
  - [ER Diagram](#er-diagram)
  - [Schema / DDL](#schema--ddl)
  - [Normalization](#normalization)
  - [Constraints & Referential Integrity](#constraints--referential-integrity)
  - [Triggers](#triggers)
  - [Sample SQL Queries](#sample-sql-queries)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [API Routes](#-api-routes)
- [Setup & Run Locally](#-setup--run-locally)
- [Deployment](#-deployment)

---

## 🌐 Project Overview

| Role | Capabilities |
|---|---|
| **Restaurant** | Register, post food listings, approve/reject NGO requests, track deliveries |
| **NGO** | Register, browse available food, request food, track delivery status |

**Core Workflow:**

```
Restaurant posts food → NGO browses & requests → Restaurant approves → Delivery tracked
```

---

## 🗄️ Database Design

### ER Diagram

```
┌─────────────────┐          ┌──────────────────────┐          ┌─────────────┐
│   Restaurant    │  1    M  │     Food_Listing      │  1    M  │   Request   │
│─────────────────│──────────│──────────────────────│──────────│─────────────│
│ restaurant_id PK│          │ listing_id       PK  │          │ request_id PK│
│ name            │          │ restaurant_id    FK  │          │ listing_id FK│
│ location        │          │ food_type            │          │ ngo_id     FK│
│ contact         │          │ quantity             │          │ status       │
│ email    UNIQUE │          │ pickup_by            │          │ created_at   │
│ password        │          │ status               │          └──────┬──────┘
└─────────────────┘          │ created_at           │                 │ 1
                             └──────────────────────┘                 │
                                                                       │ 1
┌─────────────────┐                                          ┌─────────┴──────┐
│      NGO        │  1    M                                  │    Delivery    │
│─────────────────│──────────────────────────────────────────│────────────────│
│ ngo_id       PK │                                          │ delivery_id  PK│
│ name            │                                          │ request_id   FK│
│ location        │                                          │ status         │
│ contact         │                                          │ created_at     │
│ email    UNIQUE │                                          └────────────────┘
│ password        │
└─────────────────┘
```

**Relationships:**
- `Restaurant` → `Food_Listing` : **One-to-Many** (one restaurant can post many listings)
- `NGO` → `Request` : **One-to-Many** (one NGO can make many requests)
- `Food_Listing` → `Request` : **One-to-Many** (one listing can have multiple requests)
- `Request` → `Delivery` : **One-to-One** (each approved request has exactly one delivery record)

---

### Schema / DDL

```sql
-- 1. Restaurant (Food Donors)
CREATE TABLE Restaurant (
    restaurant_id   INT             AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150)    NOT NULL,
    location        VARCHAR(300)    NOT NULL,
    contact         VARCHAR(15)     NOT NULL,
    email           VARCHAR(100)    NOT NULL UNIQUE,
    password        VARCHAR(255)    NOT NULL
);

-- 2. NGO (Food Receivers)
CREATE TABLE NGO (
    ngo_id          INT             AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150)    NOT NULL,
    location        VARCHAR(300)    NOT NULL,
    contact         VARCHAR(15)     NOT NULL,
    email           VARCHAR(100)    NOT NULL UNIQUE,
    password        VARCHAR(255)    NOT NULL
);

-- 3. Food_Listing (Surplus food posted by restaurants)
CREATE TABLE Food_Listing (
    listing_id      INT             AUTO_INCREMENT PRIMARY KEY,
    restaurant_id   INT             NOT NULL,
    food_type       VARCHAR(100)    NOT NULL,
    quantity        INT             NOT NULL,          -- in portions/kg
    status          VARCHAR(20)     DEFAULT 'available',
    pickup_by       DATETIME        NOT NULL,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (restaurant_id) REFERENCES Restaurant(restaurant_id)
        ON DELETE CASCADE
);

-- 4. Request (NGO requests for a food listing)
CREATE TABLE Request (
    request_id      INT             AUTO_INCREMENT PRIMARY KEY,
    listing_id      INT             NOT NULL,
    ngo_id          INT             NOT NULL,
    status          VARCHAR(20)     DEFAULT 'pending',  -- pending | approved | rejected
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (listing_id) REFERENCES Food_Listing(listing_id)
        ON DELETE CASCADE,
    FOREIGN KEY (ngo_id)     REFERENCES NGO(ngo_id)
        ON DELETE CASCADE
);

-- 5. Delivery (1:1 with an approved Request)
CREATE TABLE Delivery (
    delivery_id     INT             AUTO_INCREMENT PRIMARY KEY,
    request_id      INT             NOT NULL UNIQUE,
    status          VARCHAR(20)     DEFAULT 'pending',  -- pending | in transit | delivered | cancelled
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id) REFERENCES Request(request_id)
        ON DELETE CASCADE
);
```

---

### Normalization

The schema adheres to **Third Normal Form (3NF)**:

| Normal Form | Status | Explanation |
|---|---|---|
| **1NF** | ✅ | All attributes are atomic (no repeating groups or arrays) |
| **2NF** | ✅ | No partial dependencies — all non-key attributes depend on the full primary key |
| **3NF** | ✅ | No transitive dependencies — e.g., `location` is tied to `Restaurant`, not derived from another non-key attribute |
| **BCNF** | ✅ | Every determinant in each table is a candidate key |

**Design decisions:**
- `Restaurant` and `NGO` are kept as **separate tables** (not merged into a single `User` table) to avoid sparse rows and enforce clean role-based constraints.
- `Delivery` is a separate table (not a column in `Request`) to respect the **Single Responsibility Principle** in schema design and allow the 1:1 relationship to be enforced via `UNIQUE` on `request_id`.
- Passwords are stored as **bcrypt hashes** (never plaintext), enforcing application-level data integrity.

---

### Constraints & Referential Integrity

| Constraint | Applied On | Type |
|---|---|---|
| `PRIMARY KEY` | All tables | Uniqueness + NOT NULL |
| `UNIQUE` | `Restaurant.email`, `NGO.email`, `Delivery.request_id` | Prevents duplicate entries |
| `NOT NULL` | `food_type`, `quantity`, `pickup_by`, `name`, `email`, etc. | Mandatory fields |
| `FOREIGN KEY ... ON DELETE CASCADE` | `Food_Listing → Restaurant`, `Request → Food_Listing`, `Request → NGO`, `Delivery → Request` | Cascades deletes to child rows automatically |
| `DEFAULT` | `status`, `created_at` | Auto-populates sensible default values |
| `ENUM`-style | `status` fields | App-enforced status transitions (available → requested → allocated) |

---

### Triggers

An `Audit_Log` table can be used with triggers to record every INSERT/UPDATE/DELETE on core tables (see `database.sql`):

```sql
CREATE TABLE Audit_Log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    table_name  VARCHAR(64)  NOT NULL,
    row_id      INT,
    action      VARCHAR(16)  NOT NULL,    -- INSERT | UPDATE | DELETE
    changed_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    who         VARCHAR(100) DEFAULT NULL
);

-- Example trigger: log every new Food_Listing
CREATE TRIGGER after_listing_insert
AFTER INSERT ON Food_Listing
FOR EACH ROW
    INSERT INTO Audit_Log (table_name, row_id, action)
    VALUES ('Food_Listing', NEW.listing_id, 'INSERT');
```

---

### Sample SQL Queries

**Q1 — Dashboard stats for a restaurant (active vs expired listings):**
```sql
SELECT
    COUNT(CASE WHEN status = 'available' THEN 1 END) AS active_listings,
    COUNT(CASE WHEN status = 'expired'   THEN 1 END) AS expired_items
FROM Food_Listing
WHERE restaurant_id = 1;
```

**Q2 — All pending requests with NGO & food details:**
```sql
SELECT r.request_id, n.name AS ngo_name, f.food_type, f.quantity,
       r.created_at, r.status
FROM Request r
JOIN NGO n          ON r.ngo_id     = n.ngo_id
JOIN Food_Listing f ON r.listing_id = f.listing_id
WHERE r.status = 'pending'
ORDER BY r.created_at DESC;
```

**Q3 — Delivery tracker with full chain:**
```sql
SELECT d.delivery_id, f.food_type, f.quantity, n.name AS ngo_name,
       d.status AS delivery_status, d.created_at
FROM Delivery d
JOIN Request r      ON d.request_id = r.request_id
JOIN NGO n          ON r.ngo_id     = n.ngo_id
JOIN Food_Listing f ON r.listing_id = f.listing_id;
```

**Q4 — Browse available food for NGOs (not expired):**
```sql
SELECT f.listing_id, f.food_type, f.quantity, f.pickup_by, f.status,
       res.name AS restaurant_name, res.location
FROM Food_Listing f
JOIN Restaurant res ON f.restaurant_id = res.restaurant_id
WHERE f.status = 'available' AND f.pickup_by > NOW()
ORDER BY f.pickup_by ASC;
```

**Q5 — Number of meals saved per restaurant (delivered only):**
```sql
SELECT res.name AS restaurant_name, SUM(f.quantity) AS total_meals_saved
FROM Food_Listing f
JOIN Restaurant res ON f.restaurant_id = res.restaurant_id
JOIN Request r      ON r.listing_id    = f.listing_id
JOIN Delivery d     ON d.request_id    = r.request_id
WHERE d.status = 'delivered'
GROUP BY res.restaurant_id, res.name
ORDER BY total_meals_saved DESC;
```

**Q6 — Top NGOs by number of approved food requests:**
```sql
SELECT n.name AS ngo_name, COUNT(r.request_id) AS total_requests
FROM Request r
JOIN NGO n ON r.ngo_id = n.ngo_id
WHERE r.status IN ('approved', 'pending')
GROUP BY n.ngo_id, n.name
ORDER BY total_requests DESC
LIMIT 5;
```

**Q7 — Transaction example: approve a request atomically:**
```sql
START TRANSACTION;

UPDATE Request      SET status = 'approved'   WHERE request_id = 3;
UPDATE Food_Listing SET status = 'allocated'  WHERE listing_id = (
    SELECT listing_id FROM Request WHERE request_id = 3
);
INSERT INTO Delivery (request_id, status) VALUES (3, 'pending');

COMMIT;
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express.js |
| **Database** | MySQL (Aiven Cloud MySQL for production) |
| **Frontend** | HTML5 + Tailwind CSS + Vanilla JavaScript |
| **Authentication** | JWT (JSON Web Tokens) + bcryptjs |
| **Deployment** | Vercel (serverless functions via `api/index.js`) |
| **DB Driver** | `mysql2/promise` (async/await support) |

---

## 📁 Project Structure

```text
food-bridge/
├── api/
│   └── index.js          # Vercel serverless entry point → imports server.js
├── images/               # Static images (logo, hero, etc.)
├── app.js                # All frontend JavaScript (auth, rendering, API calls)
├── index.html            # Single-page application HTML
├── styles.css            # Custom CSS (animations, design tokens)
├── server.js             # Express backend — all API routes & DB queries
├── database.sql          # Full DDL schema + sample data + useful queries
├── seed.js               # Script to seed the database
├── package.json
├── vercel.json           # Vercel routing config
└── README.md
```

---

## 🔌 API Routes

All protected routes require the header: `Authorization: Bearer <token>`

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register as Restaurant or NGO |
| `POST` | `/api/auth/login` | Public | Login and receive JWT token |

### Profile

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/profile` | 🔒 Auth | Get profile details + activity history |
| `PUT` | `/api/profile` | 🔒 Auth | Update name, email, location, contact |

### Dashboard Stats

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/stats/restaurant` | 🔒 Restaurant | Active listings, deliveries today, meals saved |
| `GET` | `/api/dashboard/stats/ngo` | 🔒 NGO | Pending requests, in-transit, meals received |

### Food Listings

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/food-listings` | 🔒 Restaurant | Create a new food listing |
| `GET` | `/api/food-listings/me` | 🔒 Restaurant | Get all listings by this restaurant |
| `GET` | `/api/food/available` | 🔒 NGO | Browse all currently available food |

### Requests

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/requests` | 🔒 NGO | Request a food listing |
| `GET` | `/api/requests/me` | 🔒 Auth | Get all requests for current user |
| `PATCH` | `/api/requests/:id/decision` | 🔒 Restaurant | Approve or reject a request |

### Deliveries

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/deliveries/me` | 🔒 Auth | Get all deliveries for current user |
| `PATCH` | `/api/deliveries/:id/status` | 🔒 Restaurant | Update delivery status |

---

## ⚙️ Setup & Run Locally

### Prerequisites
- Node.js 18+
- MySQL Server (local) or a cloud MySQL instance (Aiven, PlanetScale, etc.)

### Steps

**1. Clone the repo:**
```bash
git clone https://github.com/nikshep-root/dbms-project.git
cd food-bridge
```

**2. Install dependencies:**
```bash
npm install
```

**3. Create a `.env` file:**
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=foodbridge
JWT_SECRET=change-this-to-a-random-secret
PORT=3000
```

**4. Initialize the database:**
```bash
# Run the SQL schema file in your MySQL client, or:
node seed.js
```

**5. Start the server:**
```bash
node server.js
```

**6. Open in browser:**
```
http://localhost:3000
```

---

## 🚀 Deployment

This project is deployed on **Vercel** with the following setup:

- `vercel.json` rewrites all `/api/*` requests → `api/index.js`
- `api/index.js` imports and exports the Express app from `server.js`
- Environment variables (DB credentials, JWT secret) are set via the Vercel dashboard

**Live URL:** Deployed on Vercel — see repository description for link.

---

## 👥 Team

Built as a **Database Management Systems (DBMS)** mini project demonstrating:
- Relational database design & normalization
- SQL DDL, DML, joins, aggregations & transactions
- REST API design with database integration
- Role-based access control with JWT authentication
