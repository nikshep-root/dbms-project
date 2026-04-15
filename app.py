import os
import hashlib
import csv
import io
from datetime import datetime
from functools import wraps

from flask import Flask, Response, flash, redirect, render_template, request, session, url_for
from mysql.connector import Error

from db import get_db_connection

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")


VALID_REQUEST_STATUSES = {"Pending", "Approved", "Rejected"}
VALID_DELIVERY_STATUSES = {"Pending", "In Transit", "Delivered", "Cancelled"}
VALID_ROLES = {"admin", "restaurant", "ngo"}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def sync_expired_food(cursor) -> None:
    """Mark stale available/requested listings as expired."""
    cursor.execute(
        """
        UPDATE Food_Listing
        SET status = 'Expired'
        WHERE expiry_time <= NOW()
          AND status IN ('Available', 'Requested')
        """
    )


def build_request_filter(status_filter: str, search_query: str):
    conditions = []
    query_params = []

    if status_filter != "All":
        conditions.append("r.status = %s")
        query_params.append(status_filter)

    if search_query:
        conditions.append("(n.name LIKE %s OR f.food_name LIKE %s)")
        like_value = f"%{search_query}%"
        query_params.extend([like_value, like_value])

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    return where_clause, query_params


def log_admin_action(cursor, admin_user_id: int, action_type: str, request_id: int, details: str = ""):
    cursor.execute(
        """
        INSERT INTO Audit_Log (admin_user_id, action_type, request_id, details)
        VALUES (%s, %s, %s, %s)
        """,
        (admin_user_id, action_type, request_id, details),
    )


def current_user():
    return session.get("user")


def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if not current_user():
            flash("Please log in to continue.", "error")
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)

    return wrapper


def role_required(*allowed_roles):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                flash("Please log in to continue.", "error")
                return redirect(url_for("login"))
            if user.get("role") not in allowed_roles:
                flash("You are not authorized to perform this action.", "error")
                return redirect(url_for("home"))
            return view_func(*args, **kwargs)

        return wrapper

    return decorator


@app.context_processor
def inject_auth_context():
    return {
        "current_user": current_user(),
        "is_logged_in": current_user() is not None,
    }


@app.route("/login", methods=["GET", "POST"])
def login():
    conn = None
    cursor = None

    if current_user():
        return redirect(url_for("home"))

    if request.method == "GET":
        return render_template("login.html")

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()

    if not username or not password:
        flash("Username and password are required.", "error")
        return redirect(url_for("login"))

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT user_id, username, password_hash, role, restaurant_id, ngo_id
            FROM App_User
            WHERE username = %s AND is_active = 1
            """,
            (username,),
        )
        user_row = cursor.fetchone()

        if user_row is None or user_row["password_hash"] != hash_password(password):
            flash("Invalid username or password.", "error")
            return redirect(url_for("login"))

        display_name = user_row["username"]
        if user_row["role"] == "restaurant" and user_row["restaurant_id"]:
            cursor.execute(
                "SELECT name FROM Restaurant WHERE restaurant_id = %s",
                (user_row["restaurant_id"],),
            )
            row = cursor.fetchone()
            if row:
                display_name = row["name"]
        elif user_row["role"] == "ngo" and user_row["ngo_id"]:
            cursor.execute("SELECT name FROM NGO WHERE ngo_id = %s", (user_row["ngo_id"],))
            row = cursor.fetchone()
            if row:
                display_name = row["name"]

        session["user"] = {
            "user_id": user_row["user_id"],
            "username": user_row["username"],
            "role": user_row["role"],
            "display_name": display_name,
            "restaurant_id": user_row["restaurant_id"],
            "ngo_id": user_row["ngo_id"],
        }
        flash("Logged in successfully.", "success")
        return redirect(url_for("home"))

    except (RuntimeError, Error) as exc:
        flash(f"Login failed: {exc}", "error")
        return redirect(url_for("login"))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.pop("user", None)
    flash("You have been logged out.", "success")
    return redirect(url_for("login"))


@app.route("/", methods=["GET"])
@login_required
def home():
    conn = None
    cursor = None
    foods = []
    ngos = []

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        sync_expired_food(cursor)
        conn.commit()

        cursor.execute(
            """
            SELECT food_id, food_name, quantity, expiry_time, restaurant_id
            FROM Food_Listing
            WHERE status = 'Available' AND expiry_time > NOW()
            ORDER BY expiry_time ASC
            """
        )
        foods = cursor.fetchall()

        user = current_user()
        if user and user.get("role") == "ngo" and user.get("ngo_id"):
            cursor.execute("SELECT ngo_id, name FROM NGO WHERE ngo_id = %s", (user["ngo_id"],))
        else:
            cursor.execute("SELECT ngo_id, name FROM NGO ORDER BY name")
        ngos = cursor.fetchall()

    except (RuntimeError, Error) as exc:
        flash(f"Unable to load data: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return render_template("index.html", foods=foods, ngos=ngos)


@app.route("/add_food", methods=["GET", "POST"])
@role_required("admin", "restaurant")
def add_food():
    conn = None
    cursor = None

    user = current_user()

    if request.method == "GET":
        restaurants = []
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            if user and user.get("role") == "restaurant" and user.get("restaurant_id"):
                cursor.execute(
                    "SELECT restaurant_id, name FROM Restaurant WHERE restaurant_id = %s",
                    (user["restaurant_id"],),
                )
            else:
                cursor.execute("SELECT restaurant_id, name FROM Restaurant ORDER BY name")
            restaurants = cursor.fetchall()
        except (RuntimeError, Error) as exc:
            flash(f"Unable to load restaurants: {exc}", "error")
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

        return render_template("add_food.html", restaurants=restaurants)

    restaurant_id = request.form.get("restaurant_id", "").strip()
    food_name = request.form.get("food_name", "").strip()
    quantity = request.form.get("quantity", "").strip()
    expiry_time = request.form.get("expiry_time", "").strip()

    if user and user.get("role") == "restaurant":
        restaurant_id = str(user.get("restaurant_id", ""))

    if not (restaurant_id and food_name and quantity and expiry_time):
        flash("All fields are required.", "error")
        return redirect(url_for("add_food"))

    try:
        restaurant_id_int = int(restaurant_id)
        quantity_int = int(quantity)
        expiry_dt = datetime.strptime(expiry_time, "%Y-%m-%dT%H:%M")
    except ValueError:
        flash("Invalid input format. Check quantity and expiry date/time.", "error")
        return redirect(url_for("add_food"))

    if quantity_int <= 0:
        flash("Quantity must be greater than 0.", "error")
        return redirect(url_for("add_food"))

    if expiry_dt <= datetime.now():
        flash("Expiry time must be in the future.", "error")
        return redirect(url_for("add_food"))

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT 1 FROM Restaurant WHERE restaurant_id = %s",
            (restaurant_id_int,),
        )
        if cursor.fetchone() is None:
            flash("Restaurant not found.", "error")
            return redirect(url_for("add_food"))

        cursor.execute(
            """
            INSERT INTO Food_Listing (restaurant_id, food_name, quantity, expiry_time, status)
            VALUES (%s, %s, %s, %s, 'Available')
            """,
            (restaurant_id_int, food_name, quantity_int, expiry_dt),
        )
        conn.commit()
        flash("Food item added successfully.", "success")

    except (RuntimeError, Error) as exc:
        if conn:
            conn.rollback()
        flash(f"Failed to add food item: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return redirect(url_for("add_food"))


@app.route("/request_food", methods=["POST"])
@role_required("admin", "ngo")
def request_food():
    conn = None
    cursor = None

    user = current_user()
    ngo_id = request.form.get("ngo_id", "").strip()
    food_id = request.form.get("food_id", "").strip()

    if user and user.get("role") == "ngo":
        ngo_id = str(user.get("ngo_id", ""))

    if not (ngo_id and food_id):
        flash("NGO and food item are required.", "error")
        return redirect(url_for("home"))

    try:
        ngo_id_int = int(ngo_id)
        food_id_int = int(food_id)
    except ValueError:
        flash("Invalid request data.", "error")
        return redirect(url_for("home"))

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        sync_expired_food(cursor)
        conn.commit()

        cursor.execute("SELECT 1 FROM NGO WHERE ngo_id = %s", (ngo_id_int,))
        if cursor.fetchone() is None:
            flash("NGO not found.", "error")
            return redirect(url_for("home"))

        cursor.execute(
            """
            SELECT food_id, status, expiry_time
            FROM Food_Listing
            WHERE food_id = %s
            """,
            (food_id_int,),
        )
        food = cursor.fetchone()

        if food is None:
            flash("Food listing not found.", "error")
            return redirect(url_for("home"))

        if food["status"] != "Available":
            flash("This food item is no longer available.", "error")
            return redirect(url_for("home"))

        if food["expiry_time"] <= datetime.now():
            flash("Cannot request expired food.", "error")
            return redirect(url_for("home"))

        # Guard against repeated active requests for the same NGO-food pair.
        cursor.execute(
            """
            SELECT 1
            FROM `Request`
            WHERE ngo_id = %s AND food_id = %s AND status IN ('Pending', 'Approved')
            LIMIT 1
            """,
            (ngo_id_int, food_id_int),
        )
        if cursor.fetchone() is not None:
            flash("You already have an active request for this food item.", "error")
            return redirect(url_for("home"))

        cursor.execute(
            """
            INSERT INTO `Request` (ngo_id, food_id, request_time, status)
            VALUES (%s, %s, NOW(), 'Pending')
            """,
            (ngo_id_int, food_id_int),
        )

        cursor.execute(
            "UPDATE Food_Listing SET status = 'Requested' WHERE food_id = %s",
            (food_id_int,),
        )

        conn.commit()
        flash("Food request submitted successfully.", "success")

    except (RuntimeError, Error) as exc:
        if conn:
            conn.rollback()
        flash(f"Failed to submit request: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return redirect(url_for("home"))


@app.route("/requests", methods=["GET"])
@role_required("admin")
def requests_dashboard():
    conn = None
    cursor = None
    request_rows = []
    metrics = {
        "available_food": 0,
        "pending_requests": 0,
        "approved_requests": 0,
        "delivered_count": 0,
    }

    status_filter = request.args.get("status", "All").strip().title()
    search_query = request.args.get("q", "").strip()
    page_raw = request.args.get("page", "1").strip()
    per_page = 10
    total_count = 0
    total_pages = 1

    try:
        page = int(page_raw)
        if page < 1:
            page = 1
    except ValueError:
        page = 1

    if status_filter not in {"All", "Pending", "Approved", "Rejected"}:
        status_filter = "All"

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        sync_expired_food(cursor)
        conn.commit()

        cursor.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM Food_Listing WHERE status = 'Available' AND expiry_time > NOW()) AS available_food,
                (SELECT COUNT(*) FROM `Request` WHERE status = 'Pending') AS pending_requests,
                (SELECT COUNT(*) FROM `Request` WHERE status = 'Approved') AS approved_requests,
                (SELECT COUNT(*) FROM Delivery WHERE delivery_status = 'Delivered') AS delivered_count
            """
        )
        metrics_row = cursor.fetchone()
        if metrics_row:
            metrics = metrics_row

        where_clause, query_params = build_request_filter(status_filter, search_query)

        cursor.execute(
            f"""
            SELECT COUNT(*) AS total_count
            FROM `Request` r
            INNER JOIN NGO n ON n.ngo_id = r.ngo_id
            INNER JOIN Food_Listing f ON f.food_id = r.food_id
            {where_clause}
            """,
            tuple(query_params),
        )
        total_count = cursor.fetchone()["total_count"]
        total_pages = max(1, (total_count + per_page - 1) // per_page)
        if page > total_pages:
            page = total_pages
        offset = (page - 1) * per_page

        paged_params = list(query_params)
        paged_params.extend([per_page, offset])

        cursor.execute(
            f"""
            SELECT
                r.request_id,
                r.request_time,
                r.status AS request_status,
                n.name AS ngo_name,
                f.food_name,
                f.quantity,
                COALESCE(d.delivery_status, 'Pending') AS delivery_status,
                d.delivery_time
            FROM `Request` r
            INNER JOIN NGO n ON n.ngo_id = r.ngo_id
            INNER JOIN Food_Listing f ON f.food_id = r.food_id
            LEFT JOIN Delivery d ON d.request_id = r.request_id
            {where_clause}
            ORDER BY r.request_time DESC
            LIMIT %s OFFSET %s
            """,
            tuple(paged_params),
        )
        request_rows = cursor.fetchall()

    except (RuntimeError, Error) as exc:
        flash(f"Unable to load requests: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return render_template(
        "requests.html",
        requests=request_rows,
        metrics=metrics,
        status_filter=status_filter,
        search_query=search_query,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        total_count=total_count,
    )


@app.route("/audit_logs", methods=["GET"])
@role_required("admin")
def audit_logs():
    conn = None
    cursor = None
    logs = []

    action_filter = request.args.get("action", "All").strip().upper()
    admin_search = request.args.get("admin", "").strip()
    start_date = request.args.get("start", "").strip()
    end_date = request.args.get("end", "").strip()
    page_raw = request.args.get("page", "1").strip()
    per_page = 12
    total_count = 0
    total_pages = 1

    valid_actions = {"All", "REQUEST_APPROVED", "REQUEST_REJECTED", "DELIVERY_UPDATED"}
    if action_filter not in valid_actions:
        action_filter = "All"

    try:
        page = int(page_raw)
        if page < 1:
            page = 1
    except ValueError:
        page = 1

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        conditions = []
        params = []

        if action_filter != "All":
            conditions.append("a.action_type = %s")
            params.append(action_filter)

        if admin_search:
            conditions.append("u.username LIKE %s")
            params.append(f"%{admin_search}%")

        if start_date:
            conditions.append("DATE(a.created_at) >= %s")
            params.append(start_date)

        if end_date:
            conditions.append("DATE(a.created_at) <= %s")
            params.append(end_date)

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        cursor.execute(
            f"""
            SELECT COUNT(*) AS total_count
            FROM Audit_Log a
            INNER JOIN App_User u ON u.user_id = a.admin_user_id
            {where_clause}
            """,
            tuple(params),
        )
        total_count = cursor.fetchone()["total_count"]
        total_pages = max(1, (total_count + per_page - 1) // per_page)
        if page > total_pages:
            page = total_pages
        offset = (page - 1) * per_page

        paged_params = list(params)
        paged_params.extend([per_page, offset])

        cursor.execute(
            f"""
            SELECT
                a.log_id,
                a.action_type,
                a.request_id,
                a.details,
                a.created_at,
                u.username AS admin_username
            FROM Audit_Log a
            INNER JOIN App_User u ON u.user_id = a.admin_user_id
            {where_clause}
            ORDER BY a.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(paged_params),
        )
        logs = cursor.fetchall()

    except (RuntimeError, Error) as exc:
        flash(f"Unable to load audit logs: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return render_template(
        "audit_logs.html",
        logs=logs,
        action_filter=action_filter,
        admin_search=admin_search,
        start_date=start_date,
        end_date=end_date,
        page=page,
        total_pages=total_pages,
        total_count=total_count,
    )


@app.route("/export_requests_csv", methods=["GET"])
@role_required("admin")
def export_requests_csv():
    conn = None
    cursor = None
    status_filter = request.args.get("status", "All").strip().title()
    search_query = request.args.get("q", "").strip()

    if status_filter not in {"All", "Pending", "Approved", "Rejected"}:
        status_filter = "All"

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        sync_expired_food(cursor)
        conn.commit()

        where_clause, query_params = build_request_filter(status_filter, search_query)
        cursor.execute(
            f"""
            SELECT
                r.request_id,
                n.name AS ngo_name,
                f.food_name,
                f.quantity,
                r.request_time,
                r.status AS request_status,
                COALESCE(d.delivery_status, 'Pending') AS delivery_status,
                d.delivery_time
            FROM `Request` r
            INNER JOIN NGO n ON n.ngo_id = r.ngo_id
            INNER JOIN Food_Listing f ON f.food_id = r.food_id
            LEFT JOIN Delivery d ON d.request_id = r.request_id
            {where_clause}
            ORDER BY r.request_time DESC
            """,
            tuple(query_params),
        )
        rows = cursor.fetchall()

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Request ID",
                "NGO",
                "Food",
                "Quantity",
                "Requested At",
                "Request Status",
                "Delivery Status",
                "Delivery Time",
            ]
        )

        for row in rows:
            writer.writerow(
                [
                    row["request_id"],
                    row["ngo_name"],
                    row["food_name"],
                    row["quantity"],
                    row["request_time"].strftime("%Y-%m-%d %H:%M:%S") if row["request_time"] else "",
                    row["request_status"],
                    row["delivery_status"],
                    row["delivery_time"].strftime("%Y-%m-%d %H:%M:%S") if row["delivery_time"] else "",
                ]
            )

        csv_data = buffer.getvalue()
        filename = f"requests_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response = Response(csv_data, mimetype="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response

    except (RuntimeError, Error) as exc:
        flash(f"CSV export failed: {exc}", "error")
        return redirect(url_for("requests_dashboard", status=status_filter, q=search_query))
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/update_request", methods=["POST"])
@role_required("admin")
def update_request():
    conn = None
    cursor = None

    request_id = request.form.get("request_id", "").strip()
    status = request.form.get("status", "").strip().title()

    if not request_id or status not in VALID_REQUEST_STATUSES:
        flash("Invalid request update.", "error")
        return redirect(url_for("requests_dashboard"))

    try:
        request_id_int = int(request_id)
    except ValueError:
        flash("Invalid request ID.", "error")
        return redirect(url_for("requests_dashboard"))

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        admin = current_user()

        cursor.execute(
            "SELECT request_id, food_id FROM `Request` WHERE request_id = %s",
            (request_id_int,),
        )
        req_row = cursor.fetchone()
        if req_row is None:
            flash("Request not found.", "error")
            return redirect(url_for("requests_dashboard"))

        cursor.execute(
            "UPDATE `Request` SET status = %s WHERE request_id = %s",
            (status, request_id_int),
        )

        if status == "Approved":
            cursor.execute(
                "UPDATE Food_Listing SET status = 'Allocated' WHERE food_id = %s",
                (req_row["food_id"],),
            )
            cursor.execute(
                """
                INSERT INTO Delivery (request_id, delivery_status, delivery_time)
                VALUES (%s, 'Pending', NULL)
                ON DUPLICATE KEY UPDATE delivery_status = 'Pending', delivery_time = NULL
                """,
                (request_id_int,),
            )
            log_admin_action(
                cursor,
                admin["user_id"],
                "REQUEST_APPROVED",
                request_id_int,
                "Approved request and initialized delivery.",
            )
        elif status == "Rejected":
            cursor.execute(
                "UPDATE Food_Listing SET status = 'Available' WHERE food_id = %s",
                (req_row["food_id"],),
            )
            cursor.execute("DELETE FROM Delivery WHERE request_id = %s", (request_id_int,))
            log_admin_action(
                cursor,
                admin["user_id"],
                "REQUEST_REJECTED",
                request_id_int,
                "Rejected request and released food listing.",
            )

        conn.commit()
        flash(f"Request {status.lower()} successfully.", "success")

    except (RuntimeError, Error) as exc:
        if conn:
            conn.rollback()
        flash(f"Failed to update request: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return redirect(url_for("requests_dashboard"))


@app.route("/update_delivery", methods=["POST"])
@role_required("admin")
def update_delivery():
    conn = None
    cursor = None

    request_id = request.form.get("request_id", "").strip()
    delivery_status = request.form.get("delivery_status", "").strip().title()

    if not request_id or delivery_status not in VALID_DELIVERY_STATUSES:
        flash("Invalid delivery update.", "error")
        return redirect(url_for("requests_dashboard"))

    try:
        request_id_int = int(request_id)
    except ValueError:
        flash("Invalid request ID for delivery.", "error")
        return redirect(url_for("requests_dashboard"))

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        admin = current_user()

        if delivery_status == "Delivered":
            cursor.execute(
                """
                UPDATE Delivery
                SET delivery_status = %s, delivery_time = NOW()
                WHERE request_id = %s
                """,
                (delivery_status, request_id_int),
            )
        else:
            cursor.execute(
                """
                UPDATE Delivery
                SET delivery_status = %s
                WHERE request_id = %s
                """,
                (delivery_status, request_id_int),
            )

        if cursor.rowcount == 0:
            flash("Delivery entry not found for this request.", "error")
            return redirect(url_for("requests_dashboard"))

        log_admin_action(
            cursor,
            admin["user_id"],
            "DELIVERY_UPDATED",
            request_id_int,
            f"Updated delivery status to {delivery_status}.",
        )

        conn.commit()
        flash("Delivery status updated.", "success")

    except (RuntimeError, Error) as exc:
        if conn:
            conn.rollback()
        flash(f"Failed to update delivery: {exc}", "error")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return redirect(url_for("requests_dashboard"))


if __name__ == "__main__":
    app.run(debug=True)
