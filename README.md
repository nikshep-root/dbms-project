# Food Waste Management System

A full-stack DBMS mini project using Flask, MySQL, and Jinja2 templates.

## Features

- Restaurants can add surplus food listings.
- NGOs can browse available food and submit requests.
- Admin can approve/reject requests.
- Delivery status can be tracked for approved requests.
- Role-based login for Admin, Restaurant, and NGO users.
- Duplicate active request prevention for same NGO + food item.
- Auto-expiry sync for stale food listings.
- Database indexes added for faster joins and lookups.
- Admin requests dashboard with filters, search, pagination, and CSV export.
- Audit log tracking for admin approvals/rejections/delivery updates.
- Modern premium UI with glassmorphism, gradients, and responsive cards.

## Folder Structure

```text
food-waste-project/
|-- app.py
|-- db.py
|-- .env.example
|-- schema.sql
|-- templates/
|   |-- index.html
|   |-- add_food.html
|   |-- requests.html
|   |-- login.html
|   |-- audit_logs.html
|-- static/
|   |-- style.css
|-- README.md
```

## Prerequisites

- Python 3.9+
- MySQL Server

## Setup (Step by Step)

1. Create a virtual environment and activate it:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install flask mysql-connector-python
```

3. Create database and tables:

```powershell
Get-Content .\schema.sql | mysql -u root -p
```

4. Configure environment variables:

```powershell
Copy .env.example to .env and update values:
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=food_waste_db
SECRET_KEY=change-this-secret
```

5. Run the Flask app:

```powershell
python app.py
```

6. Open in browser:

```text
http://127.0.0.1:5000
```

## Routes

- `GET /login` -> open login page
- `POST /login` -> authenticate user
- `POST /logout` -> logout current user
- `GET /` -> show all available food
- `GET /add_food` -> open add food form
- `POST /add_food` -> add food item
- `POST /request_food` -> NGO requests food
- `GET /requests` -> show requests dashboard
- `GET /export_requests_csv` -> export filtered request list as CSV
- `GET /audit_logs` -> view filtered admin audit logs
- `POST /update_request` -> approve/reject request
- `POST /update_delivery` -> update delivery status

## Notes

- Validation is included for required fields, positive quantity, valid IDs, and future expiry time.
- SQL uses foreign keys and enum statuses for data integrity.
- Default demo users from `schema.sql`:
	- `admin / admin123`
	- `freshbites / rest123`
	- `carehands / ngo123`
- Re-run schema safely after updates:
	- `Get-Content .\schema.sql | mysql -u root -p`
