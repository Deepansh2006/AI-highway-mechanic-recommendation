"""
Database Migration Script
Run this once to add new columns to existing tables without losing data.

Usage:
    cd backend
    python -m app.db.migrate
"""
from app.core.database import engine
from sqlalchemy import text, inspect

def get_existing_columns(table_name: str) -> set:
    """Get the set of existing column names for a table."""
    inspector = inspect(engine)
    try:
        columns = inspector.get_columns(table_name)
        return {col["name"] for col in columns}
    except Exception:
        return set()

def add_column_if_missing(table: str, column: str, col_type: str, default: str = None):
    """Add a column to a table if it doesn't already exist."""
    existing = get_existing_columns(table)
    if column not in existing:
        default_clause = f" DEFAULT {default}" if default else ""
        sql = f'ALTER TABLE {table} ADD COLUMN "{column}" {col_type}{default_clause}'
        with engine.connect() as conn:
            conn.execute(text(sql))
            conn.commit()
        print(f"  + Added {table}.{column}")
    else:
        print(f"  = {table}.{column} already exists")

def run_migration():
    print("\nRunning database migration...\n")

    # ---- MechanicNode (mechanics table) ----
    print("Table: mechanics")
    add_column_if_missing("mechanics", "owner_name", "VARCHAR(255)")
    add_column_if_missing("mechanics", "vehicle_label", "VARCHAR(100)", "'Service vehicle'")
    add_column_if_missing("mechanics", "vehicle_plate", "VARCHAR(20)")
    add_column_if_missing("mechanics", "verified", "BOOLEAN", "true")
    add_column_if_missing("mechanics", "area", "VARCHAR(255)", "'Jaipur'")
    add_column_if_missing("mechanics", "typical_arrival_min", "INTEGER", "15")

    # ---- ServiceRequest (service_requests table) ----
    print("\nTable: service_requests")
    add_column_if_missing("service_requests", "vehicle", "VARCHAR(20)")
    add_column_if_missing("service_requests", "issue", "VARCHAR(20)")
    add_column_if_missing("service_requests", "location_lat", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "location_lng", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "location_label", "VARCHAR(500)")
    add_column_if_missing("service_requests", "diagnosis_json", "TEXT")
    add_column_if_missing("service_requests", "verification_code", "VARCHAR(6)")
    add_column_if_missing("service_requests", "accept_deadline", "TIMESTAMPTZ")
    add_column_if_missing("service_requests", "accepted_at", "TIMESTAMPTZ")
    add_column_if_missing("service_requests", "arrived_at", "TIMESTAMPTZ")
    add_column_if_missing("service_requests", "completed_at", "TIMESTAMPTZ")
    add_column_if_missing("service_requests", "line_items_json", "TEXT")
    add_column_if_missing("service_requests", "final_amount", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "payment_method", "VARCHAR(10)")
    add_column_if_missing("service_requests", "reassigned", "BOOLEAN", "false")
    add_column_if_missing("service_requests", "previous_mechanic_name", "VARCHAR(255)")
    add_column_if_missing("service_requests", "distance_km", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "eta_min", "INTEGER")
    add_column_if_missing("service_requests", "price_min", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "price_max", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "driver_name", "VARCHAR(255)")
    add_column_if_missing("service_requests", "driver_vehicle_model", "VARCHAR(255)")
    add_column_if_missing("service_requests", "driver_plate", "VARCHAR(20)")
    add_column_if_missing("service_requests", "mechanic_live_lat", "DOUBLE PRECISION")
    add_column_if_missing("service_requests", "mechanic_live_lng", "DOUBLE PRECISION")

    # Update the status enum to include new values
    print("\nUpdating RequestStatus enum...")
    new_values = ["ARRIVED", "REPAIRING", "BILLING", "CANCELLED", "UNASSIGNED"]
    with engine.connect() as conn:
        for val in new_values:
            try:
                conn.execute(text(f"ALTER TYPE requeststatus ADD VALUE IF NOT EXISTS '{val}'"))
                conn.commit()
                print(f"  + Added enum value: {val}")
            except Exception as e:
                print(f"  = Enum value {val}: {e}")

    print("\nMigration complete!\n")


if __name__ == "__main__":
    run_migration()
