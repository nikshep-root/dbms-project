# FoodBridge DBMS Project

A full-stack DBMS mini project using Node.js, Express, MySQL, and a modern HTML/CSS/JS UI.

## Features

- Role-based authentication for Restaurant and NGO users.
- Restaurant can post food listings.
- NGO can browse available listings and request food.
- Profile and activity history APIs.
- Dashboard stats APIs for each role.
- JWT-protected API routes.
- Responsive premium landing page and dashboard UI.
- Vercel-ready API routing via `api/index.js`.

## Tech Stack

- Backend: Node.js + Express
- Database: MySQL
- Frontend: HTML + Tailwind + Vanilla JavaScript
- Auth: JWT + bcrypt

## Project Structure

```text
food-waste-project/
|-- api/
|   |-- index.js
|-- images/
|-- app.js
|-- index.html
|-- styles.css
|-- server.js
|-- database.sql
|-- seed.js
|-- fix_passwords.js
|-- package.json
|-- vercel.json
|-- README.md
```

## Prerequisites

- Node.js 18+
- MySQL Server

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create a `.env` file in the project root:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=foodbridge
JWT_SECRET=change-this-secret
PORT=3000
```

3. Create database, tables, and sample data:

```powershell
node seed.js
```

4. Hash sample passwords for login:

```powershell
node fix_passwords.js
```

5. Start the app:

```powershell
node server.js
```

6. Open in browser:

```text
http://localhost:3000
```

## Main API Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/profile`
- `GET /api/dashboard/stats/restaurant`
- `GET /api/dashboard/stats/ngo`
- `POST /api/food-listings`
- `GET /api/food-listings/me`
- `GET /api/food/available`
- `POST /api/requests`

## Notes

- The canonical database schema is `database.sql`.
- Frontend app calls backend at `http://localhost:3000`.
- For Vercel deployments, API requests are routed through `api/index.js` using `vercel.json`.
