# FoodBridge: Comprehensive System Requirements & Technical Specification Report

***

## Chapter 1: Introduction

### 1.1 Background & Motivation
Food waste is a global crisis with severe environmental, economic, and social implications. Globally, one-third of all food produced for human consumption is lost or wasted, contributing heavily to greenhouse gas emissions. Simultaneously, food insecurity remains a pressing issue, with millions lacking access to reliable nutritional sources. "FoodBridge" was conceived out of the realization that a significant portion of food waste occurs at the retail and restaurant level due to surplus preparation. Bridging the gap between surplus generators (restaurants, bakeries, cafes) and surplus consumers (NGOs, shelters, community kitchens) requires a dedicated, real-time, logically sound technology platform. 

### 1.2 Problem Statement
Currently, restaurants discarding high-quality surplus food do so because finding a recipient, coordinating pickup, and ensuring food safety within a limited temporal window (before food expires) is logistically overwhelming. Without a centralized system, NGOs must manually call restaurants to check for surplus, which is highly inefficient. There is a lack of transparency, spatial awareness (geolocation), and trust (ratings) in current ad-hoc donation processes.

### 1.3 Proposed Solution
FoodBridge provides a comprehensive web-based platform serving as an intermediary network. By utilizing real-time inventory listing, geocoding for proximity-based matching, and an automated state-machine for delivery fulfillment, FoodBridge ensures that surplus food is intelligently routed to the nearest, highest-need organization within its viable shelf life.

### 1.4 Project Scope
The project encompasses a full-stack platform featuring:
- Dedicated portals for Donors (Restaurants) and Receivers (NGOs).
- Live inventory tracking for surplus food.
- A robust Geolocation mapping and tracing subsystem.
- A Trust and Safety mechanism via a Review and Rating system.
- An extensive RDBMS backend supporting heavy transactional integrity.
- Automated audit trails for compliance.

---

## Chapter 2: Requirement Analysis

### 2.1 Functional Requirements
1. **User Management:** Secure Registration, Login, and Profile Management for two distinct roles (NGOs and Restaurants).
2. **Listing Management:** Restaurants can rapidly post surplus food items detailing quantity, item category, and exact expiration timestamps.
3. **Advanced Discovery:** NGOs must be able to search, filter (by category, location), and sort (Newest vs. Expires Soonest) available listings.
4. **Order State Machine:** Food claims must follow a rigid status flow: `Pending` -> `Approved`/`Rejected`.
5. **Geolocation Services:** The system must convert addresses to Lat/Lon coordinates and calculate physical distances (Haversine Formula).
6. **Fulfillment Tracking:** Delivery coordination must be tracked from dispatch to completion with live agent tracking options.
7. **Reputation System:** NGOs must be able to rate and leave feedback on the quality of donations received.

### 2.2 Non-Functional Requirements
1. **Security:** Passwords must be cryptographically hashed. APIs must be stateless and secured via JWT.
2. **Performance:** Geolocation requests should be cached to prevent upstream API limits. Database queries must be optimized using spatial and foreign key indexes.
3. **Reliability:** Strict ACID compliance for database transactions to prevent double-booking of food items.
4. **Usability:** The interface must be responsive (mobile-friendly via Tailwind) and WCAG compliant for accessibility.

### 2.3 Feasibility Study
- **Technical Feasibility:** The use of Node.js, Express, and MySQL provides a robust, highly documented tech stack capable of handling the project scope. Leaflet/Nominatim provides free, effective mapping without the financial overhead of Google Maps API.
- **Economic Feasibility:** Leveraging Vercel for serverless deployment and Aiven/PlanetScale for MySQL hosting ensures running costs remain at $0 during the prototype phase.
- **Operational Feasibility:** The automated flows minimize manual intervention. Email alerts ensure stakeholders are informed without needing to constantly monitor the application.

---

## Chapter 3: Technology Stack & Architecture

### 3.1 Frontend Architecture
- **HTML5 & Vanilla JavaScript**: Used for high-performance DOM manipulation, ensuring no client-side framework bloat.
- **Tailwind CSS**: A utility-first CSS framework allowing rapid UI structuring, flexbox grids, and responsive breakpoints.
- **Leaflet.js & OpenStreetMap**: Integrated to render visual maps for NGO/Restaurant delivery radii.

### 3.2 Backend Infrastructure
- **Node.js**: Asynchronous, event-driven JavaScript runtime ideal for I/O-heavy operations (handling multiple NGO requests).
- **Express.js (v5.2.1)**: Minimalist framework handling route definitions, CORS configurations, and parsing JSON payloads.
- **Nodemailer (v8.0.7)**: SMTP wrapping for real-time notification dispatching.

### 3.3 Database Tier
- **MySQL (v5.7+)**: A highly reliable Relational Database Management System.
- **mysql2 Package**: A Node.js driver optimized for speed, utilizing Connection Pools to reuse overhead limits and keep connections alive.

---

## Chapter 4: Database Management System (DBMS) Concepts Deep Dive

The FoodBridge database architecture heavily implements academic and enterprise DBMS concepts to ensure absolute data integrity.

### 4.1 Data Normalization
The database schema has been normalized up to the **Third Normal Form (3NF)**:
- **First Normal Form (1NF):** Eradicating multi-valued attributes. E.g., The `location` and `contact` fields in the `Restaurant` table contain atomic values.
- **Second Normal Form (2NF):** Eliminating partial dependencies. All non-key attributes depend entirely on the primary keys. E.g., the `Request` table relies entirely on `request_id`, whereas donor details remain purely in the `Restaurant` table referenced by FK.
- **Third Normal Form (3NF):** Eliminating transitive dependencies. We segregated `Delivery` info from `Request` info. A Delivery only exists if a Request is approved, structurally isolating fulfillment data from negotiation data.

### 4.2 ACID Properties Enforcement
- **Atomicity**: When an NGO requests food, the transaction either entirely succeeds (creating the Request row, updating Food listing status), or entirely fails. Node.js parameter execution wraps these constraints.
- **Consistency**: Status schemas utilize strict `ENUM` types (e.g., `Available`, `Requested`, `Allocated`, `Expired`). It is impossible to insert an invalid state like 'Half-Eaten' into the database, preserving integrity.
- **Isolation**: Handled actively via MySQL's InnoDB engine, preventing two NGOs from concurrently claiming the exact same `restautant_id` listing at the exact same millisecond via row-level locking.
- **Durability**: Guaranteed by the cloud-based SQL host with constant state-writes and transaction logs.

### 4.3 Database Constraints & Integrity
Every table heavily utilizes declarative constraints:
- **Primary Keys (PK):** Implementing `AUTO_INCREMENT` INTs for optimal clustered B-Tree indexing.
- **Foreign Keys (FK):** Strict relationships utilizing `ON DELETE CASCADE`. If a `Restaurant` is deleted, all their `Food_Listings`, subsequent `Requests`, and `Deliveries` are cleared out down the hierarchy to avoid orphaned memory leaks.
- **Unique Constraints:** Applied to `email` across `NGO` and `Restaurant` tables, and crucially on `(ngo_id, restaurant_id)` inside the `Review` table to prevent review bombing/spamming.

### 4.4 Advanced Triggers and Audit Logging
To meet charity compliance standards, FoodBridge utilizes native MySQL Triggers. `AFTER INSERT` and `AFTER UPDATE` triggers are bound to `Food_Listing`, `Request`, and `Delivery`. Whenever a row mutates, the database intrinsically spawns an internal query to insert the raw `JSON_OBJECT` payload of the change into the `Audit_Log` table. This provides an immutable history of who changed what, natively independent of the application logic.

### 4.5 Caching & Spatial Indexing
To accelerate geospatial queries, composite indexing is applied: `INDEX(latitude, longitude)`. Furthermore, the `Geolocation_Cache` table saves API query overhead by storing address-to-coordinate resolutions, adhering to the database practice of caching expensive deterministic spatial evaluations.

---

## Chapter 5: Database Schema & Entity-Relationship Details

### 5.1 Core Tables Specifications

#### Table: `Restaurant` (Food Donors)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `restaurant_id` | INT | PK, AUTO_INC | Unique identifier. |
| `name` | VARCHAR(150) | NOT NULL | Business Name. |
| `location` | VARCHAR(300) | NOT NULL | Physical raw address. |
| `latitude` | DECIMAL(10,8) | DEFAULT NULL | Spatial Y coordinate. |
| `longitude` | DECIMAL(11,8) | DEFAULT NULL | Spatial X coordinate. |
| `contact` | VARCHAR(15) | NOT NULL | Phone contact. |
| `email` | VARCHAR(100) | UNIQUE, NOT NULL | Authentication identifier. |
| `password` | VARCHAR(255) | NOT NULL | Bcrypt hashed string. |

#### Table: `NGO` (Food Receivers)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `ngo_id` | INT | PK, AUTO_INC | Unique identifier. |
| `name` | VARCHAR(150) | NOT NULL | Organization Name. |
| `location` | VARCHAR(300) | NOT NULL | Physical raw delivery address. |
| `latitude` | DECIMAL(10,8) | DEFAULT NULL | Spatial Y coordinate. |
| `longitude` | DECIMAL(11,8) | DEFAULT NULL | Spatial X coordinate. |
| `email` | VARCHAR(100) | UNIQUE, NOT NULL | Authentication identifier. |
| `password` | VARCHAR(255) | NOT NULL | Bcrypt hashed string. |

#### Table: `Food_Listing` (Surplus Inventory)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `food_id` | INT | PK, AUTO_INC | Unique identifier. |
| `restaurant_id` | INT | FK (Restaurant) | Link to donor. |
| `food_name` | VARCHAR(200) | NOT NULL | Item description. |
| `quantity` | VARCHAR(50) | NOT NULL | Measurement (e.g., "5 kg"). |
| `category` | VARCHAR(50) | NOT NULL | Produce, Bakery, Cooked. |
| `expiry_time` | DATETIME | NOT NULL | Temporal death limit of food. |
| `status` | ENUM | DEFAULT 'Available' | Available, Requested, Allocated. |

#### Table: `Request` (Transaction Negotiation)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `request_id` | INT | PK, AUTO_INC | Unique identifier. |
| `ngo_id` | INT | FK (NGO) | Link to requesting organzation. |
| `food_id` | INT | FK (Food_Listing) | Link to targeted surplus. |
| `status` | ENUM | DEFAULT 'Pending' | Pending, Approved, Rejected. |
| `remarks` | TEXT | NULL | Context or rejection reasons. |

#### Table: `Delivery` (Fulfillment Logistics)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `delivery_id` | INT | PK, AUTO_INC | Unique identifier. |
| `request_id` | INT | FK (Request), UNIQUE | Strict 1:1 Mapping to an Approved Request. |
| `delivery_status`| ENUM | DEFAULT 'Pending' | Pending, In Transit, Delivered. |
| `delivery_agent` | VARCHAR(100)| NULL | Name of logistics person. |

### 5.2 Auxiliary Tables

#### Table: `Review` (Accountability Ecosystem)
| Column Name | Data Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `review_id` | INT | PK, AUTO_INC | Unique identifier. |
| `ngo_id` | INT | FK (NGO) | Reviewer. |
| `restaurant_id` | INT | FK (Restaurant) | Reviewee. |
| `rating` | INT | NOT NULL | 1-5 scale constraint. |
| `comment` | TEXT | NULL | Additional text. |
*(Has a UNIQUE KEY constraint on `ngo_id, restaurant_id` to prevent rating manipulation).*

#### Table: `Geology Cache & Audit Log`
- **Location_History:** Stores live `latitude`, `longitude`, `timestamp` mapped to `delivery_id` for path-drawing visualizations.
- **Geolocation_Cache:** Stores string `address` matching to evaluated `latitude/longitude` preventing API quota burn.
- **Audit_Log:** Generic storage catching trigger data (`table_name`, `action`, `payload`, `changed_at`).

---

## Chapter 6: Core Features & Subsystem Implementations

### 6.1 Advanced Search, Filtering, and Sorting Engine
Implemented querying mechanics allow NGOs to narrow down surplus food efficiently:
- **Spatial Filtering:** "Show food near me".
- **Categorical Filtering:** Checking the `category` column to isolate Dairy or Cooked foods requiring specific handling.
- **Urgency Sorting:** `ORDER BY expiry_time ASC` to surface items that are about to expire in the coming hours, directly driving food rescue efficiency.

### 6.2 Geolocation & Mapping Subsystem
The geocoding subsystem converts traditional addresses into coordinate pairs.
- **Distance Analytics:** Implements the Haversine formula backend:
  `A = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlong/2)`
  `C = 2 * atan2(√A, √(1−A))`
  `D = R * C` (Where R represents Earth's radius in KM).
This generates immediate ETA projections and geographical routing lines on frontend maps utilizing Leaflet.

### 6.3 Ratings and Review Ecosystem
Trust is central to food donations. If a restaurant consistently provides substandard or borderline spoiled goods, NGOs can leave 1-star ratings.
- Aggregation is performed at the database level (`SELECT AVG(rating) FROM Review WHERE restaurant_id = ?`) ensuring raw speed when displaying the restaurant profile to querying NGOs.

---

## Chapter 7: API Documentation & Data Contracts

FoodBridge utilizes a RESTful API layout. Below are key execution paths:

### 7.1 Geolocation Endpoints
**Endpoint:** `POST /api/geolocation/geocode`
**Payload:** `{"address": "Koramangala, Bangalore"}`
**Response:**
```json
{
  "source": "nominatim",
  "latitude": 12.9279,
  "longitude": 77.6271,
  "display_name": "Koramangala, Bengaluru, Karnataka, India"
}
```

### 7.2 Core Operational Endpoints
- `GET /api/food/search?category=Produce&sort_by=expiry_asc` : Yields filtered inventory.
- `PUT /api/requests/:id/approve` : Restaurant triggers status change. Spawns Database Trigger to mutate `Food_Listing` state to `Allocated`, and generates a `Delivery` table row automatically via backend logic.
- `POST /api/reviews` : Inserts or updates review. Enforces JWT auth ownership.

---

## Chapter 8: Security & Privacy Measures

### 8.1 JWT Authentication & Middlewares
The application acts entirely stateless. Upon login, the server evaluates `Bcryptjs.compare()` on the password. Upon success, an asynchronous JWT is signed containing the user's `id` and `role`. This JWT must be passed physically in the `Authorization: Bearer <TOKEN>` header of every subsequent API request. Custom Express middlewares validate token expiry and cryptographic integrity.

### 8.2 Endpoint Hardening & Output Formatting
All inputs are passed directly to `mysql2` execute parameters (`?`), inherently neutralizing SQL injection paths. Passwords are never returned in JSON payloads (utilizing `DELETE user.password` prior to serialization).

---

## Chapter 9: System Workflows & User Journeys

### 9.1 Donor Journey (Restaurant)
1. Registers providing Geolocation address.
2. At 10:00 PM, identifies 15 unserved meals.
3. Accesses dashboard, lists "15x Baked Goods", Category "Bakery", Expiry: "Tomorrow 6:00 AM".
4. Database records listing. UI returns to Dashboard waiting for Requests.
5. Receives Email notification of a hit. Uses Dashboard -> "Incoming Requests" to approve.

### 9.2 Receiver Journey (NGO)
1. Logs into the platform.
2. Browses the grid filtered by "Expires Soonest" and "Distance < 5km".
3. Clicks "Request" on the Bakery listing. Submits remarks: "We have an insulated van."
4. Wait for approval. Tracks delivery agent GPS markers visually on Leaflet UI as the agent approaches the shelter.

### 9.3 Delivery & Fulfillment State Flow
`PENDING` (Agent assigning) -> `IN_TRANSIT` (Agent picks up food; GPS coordinate array appending begins) -> `DELIVERED` (NGO digitally signs off; triggers Review prompt UI).

---

## Chapter 10: Conclusion, Limitations, and Future Scope

### 10.1 Known Limitations
- The integration of Nominatim (OpenStreetMap) relies on public rate limits. Excessive geocoding necessitates rigorous local DB caching to avoid temporary IP bans.
- The platform relies on asynchronous polling for GPS tracking currently, which creates mild temporal delays compared to WebSocket setups.

### 10.2 Future Roadmap
- **Phase 2:** Deployment of WebSockets (`Socket.io`) to replace polling for truly instantaneous delivery tracking grids.
- **Phase 3:** Integrations with crowdsourced 3rd-party logistics APIs (e.g., Dunzo/Uber Connect APIs) removing the requirement for NGOs to possess their own physical pickup fleets natively.
- **Phase 4:** Artificial Intelligence Integration. Running ML over historical data to warn restaurants of recurring surplus waste trends intuitively to adjust their initial cooking margins.

### 10.3 Conclusion
FoodBridge represents a complete, technically superlative approach to solving a paramount humanitarian issue. By deploying modern web standards married to a strictly normalized, rigid MySQL instance, the platform securely guarantees transactional safety, absolute geospatial awareness, and logical trust systems. It is massively scalable and establishes a blueprint for sustainable surplus bridging everywhere.
