"""
Lens — DataForge
================
Synthetic relational data generator.
LLM interprets schema description → Python engine generates data.
Enforces referential integrity and FK chain constraints.
"""

from __future__ import annotations
import os
import re
import uuid
import random
import string
import json
from datetime import datetime, timedelta
from typing import Any

from groq import Groq
from dotenv import load_dotenv

load_dotenv()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
LLM_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


# ─────────────────────────────────────────────
# SCHEMA GENERATION VIA LLM
# ─────────────────────────────────────────────

def generate_schema_from_prompt(prompt: str) -> list[dict]:
    """
    Takes plain English description → returns structured schema.
    LLM only used here — all data generation is deterministic Python.
    """
    system = """You are a database architect. Convert user descriptions into a structured schema.

Return ONLY a JSON array of tables. No markdown, no backticks.
Each table has:
- name: snake_case table name
- row_count: number of rows to generate
- columns: array of column definitions

Each column has:
- name: snake_case column name
- type: one of: uuid, string, integer, decimal, date, categorical, email, phone
- is_pk: boolean
- fk_table: (optional) name of parent table for foreign key
- fk_column: (optional) column name in parent table to reference
- categories: (optional, for categorical type) array of allowed values
- min: (optional, for integer/decimal) minimum value
- max: (optional, for integer/decimal) maximum value
- nullable: (optional) boolean

CRITICAL FK CHAIN RULE:
If user says table C can only link to B (not directly to A), only set fk_table on C pointing to B.
Never add a direct FK from C to A if the user says it should go via B.

Example output:
[
  {
    "id": "t1",
    "name": "customers",
    "row_count": 1000,
    "columns": [
      {"name": "customer_id", "type": "uuid", "is_pk": true},
      {"name": "name", "type": "string", "is_pk": false},
      {"name": "credit_score", "type": "integer", "is_pk": false, "min": 580, "max": 850}
    ]
  },
  {
    "id": "t2",
    "name": "loans",
    "row_count": 3000,
    "columns": [
      {"name": "loan_id", "type": "uuid", "is_pk": true},
      {"name": "customer_id", "type": "uuid", "is_pk": false, "fk_table": "customers", "fk_column": "customer_id"},
      {"name": "amount", "type": "decimal", "is_pk": false, "min": 100000, "max": 10000000},
      {"name": "status", "type": "categorical", "is_pk": false, "categories": ["Active", "Closed", "Defaulted"]}
    ]
  }
]"""

    response = groq_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.1,
        max_tokens=4096,
    )

    text = response.choices[0].message.content.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    tables = json.loads(text.strip())

    # Ensure each table has an id
    for i, t in enumerate(tables):
        if "id" not in t:
            t["id"] = f"t{i+1}"

    return tables


# ─────────────────────────────────────────────
# DATA GENERATION ENGINE (deterministic)
# ─────────────────────────────────────────────

FIRST_NAMES = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer",
               "Michael", "Linda", "William", "Barbara", "David", "Susan",
               "Richard", "Jessica", "Joseph", "Sarah", "Thomas", "Karen"]

LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
              "Miller", "Davis", "Wilson", "Taylor", "Martinez", "Anderson",
              "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson"]

COMPANY_SUFFIXES = ["LLC", "Inc", "Corp", "Ltd", "Partners LP", "Group", "Holdings"]

STREET_NAMES = ["Main St", "Oak Ave", "Park Blvd", "Elm St", "Washington Ave",
                "Lake Dr", "River Rd", "Hill Rd", "Forest Ln", "Valley Way"]

US_STATES = ["CA", "TX", "NY", "FL", "IL", "PA", "OH", "GA", "NC", "MI"]


def gen_value(col: dict, row_idx: int, pk_pools: dict[str, list]) -> Any:
    """Generate a single value for a column."""
    col_type = col.get("type", "string")
    name = col.get("name", "").lower()
    is_pk = col.get("is_pk", False)
    fk_table = col.get("fk_table")
    fk_column = col.get("fk_column")
    nullable = col.get("nullable", False)

    # Nullable — 5% chance of None
    if nullable and random.random() < 0.05:
        return ""

    # Foreign key — sample from parent table's PK pool
    if fk_table and fk_column:
        pool = pk_pools.get(f"{fk_table}.{fk_column}", [])
        if pool:
            return random.choice(pool)
        return ""

    # Primary key
    if is_pk:
        if col_type == "uuid":
            return str(uuid.uuid4())
        else:
            return row_idx + 1

    # Generate by type
    if col_type == "uuid":
        return str(uuid.uuid4())

    elif col_type == "integer":
        mn = col.get("min", 1)
        mx = col.get("max", 1000)
        return random.randint(int(mn), int(mx))

    elif col_type == "decimal":
        mn = col.get("min", 0.0)
        mx = col.get("max", 100.0)
        val = random.uniform(float(mn), float(mx))
        return round(val, 2)

    elif col_type == "date":
        start = datetime(2018, 1, 1)
        end = datetime(2024, 12, 31)
        delta = (end - start).days
        return (start + timedelta(days=random.randint(0, delta))).strftime("%Y-%m-%d")

    elif col_type == "email":
        first = random.choice(FIRST_NAMES).lower()
        last = random.choice(LAST_NAMES).lower()
        domains = ["gmail.com", "yahoo.com", "outlook.com", "company.com"]
        return f"{first}.{last}{random.randint(1, 999)}@{random.choice(domains)}"

    elif col_type == "phone":
        return f"+1-{random.randint(200, 999)}-{random.randint(200, 999)}-{random.randint(1000, 9999)}"

    elif col_type == "categorical":
        cats = col.get("categories", ["A", "B", "C"])
        return random.choice(cats)

    elif col_type == "string":
        # Smart string generation based on column name
        if any(w in name for w in ["name", "obligor", "borrower", "customer"]):
            if any(w in name for w in ["company", "corp", "entity", "obligor"]):
                return f"{random.choice(LAST_NAMES)} {random.choice(COMPANY_SUFFIXES)}"
            return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        elif "address" in name or "street" in name:
            return f"{random.randint(100, 9999)} {random.choice(STREET_NAMES)}"
        elif "city" in name:
            cities = ["New York", "Los Angeles", "Chicago", "Houston",
                      "Phoenix", "Philadelphia", "San Antonio", "Dallas"]
            return random.choice(cities)
        elif "state" in name:
            return random.choice(US_STATES)
        elif "zip" in name or "postal" in name:
            return str(random.randint(10000, 99999))
        elif "country" in name:
            return random.choice(["US", "GB", "CA", "DE", "FR", "JP", "AU"])
        elif "description" in name or "note" in name or "comment" in name:
            words = ["standard", "approved", "reviewed", "pending", "verified",
                     "complete", "partial", "conditional", "primary", "secondary"]
            return f"{random.choice(words).capitalize()} {random.choice(words)}"
        elif "code" in name or "id" in name or "ref" in name:
            prefix = name.split("_")[0].upper()[:3]
            return f"{prefix}-{random.randint(10000, 99999)}"
        else:
            return f"value_{row_idx}_{random.randint(1, 100)}"

    return f"val_{row_idx}"


def generate_table_data(table: dict, pk_pools: dict) -> list[dict]:
    """Generate all rows for a single table."""
    rows = []
    row_count = table.get("row_count", 100)
    columns = table.get("columns", [])

    # First pass — generate PK values to register in pool
    pk_cols = [c for c in columns if c.get("is_pk")]

    for row_idx in range(row_count):
        row = {}
        for col in columns:
            row[col["name"]] = gen_value(col, row_idx, pk_pools)
        rows.append(row)

    # Register PKs in pool for FK references
    for pk_col in pk_cols:
        pool_key = f"{table['name']}.{pk_col['name']}"
        pk_pools[pool_key] = [r[pk_col["name"]] for r in rows]

    return rows


def rows_to_csv(rows: list[dict]) -> str:
    """Convert rows to CSV string."""
    if not rows:
        return ""
    headers = list(rows[0].keys())
    lines = [",".join(str(h) for h in headers)]
    for row in rows:
        vals = []
        for h in headers:
            v = str(row.get(h, ""))
            # Escape commas and quotes
            if "," in v or '"' in v:
                v = f'"{v.replace(chr(34), chr(34)+chr(34))}"'
            vals.append(v)
        lines.append(",".join(vals))
    return "\n".join(lines)


def generate_all_tables(tables: list[dict]) -> list[dict]:
    """
    Generate data for all tables in topological order.
    Parent tables (no FK dependencies) are generated first.
    FK chain constraints are enforced.
    """
    # Topological sort — tables with no FKs first
    def has_fk(table: dict) -> bool:
        return any(c.get("fk_table") for c in table.get("columns", []))

    def fk_tables(table: dict) -> set[str]:
        return {c["fk_table"] for c in table.get("columns", []) if c.get("fk_table")}

    # Sort: tables with no deps first
    sorted_tables = []
    remaining = list(tables)
    generated_names = set()

    max_iterations = len(tables) * 2
    iterations = 0

    while remaining and iterations < max_iterations:
        iterations += 1
        for t in remaining[:]:
            deps = fk_tables(t)
            if deps.issubset(generated_names):
                sorted_tables.append(t)
                generated_names.add(t["name"])
                remaining.remove(t)

    # Any remaining (circular refs) — add at end
    sorted_tables.extend(remaining)

    # Generate data
    pk_pools: dict[str, list] = {}
    results = []

    for table in sorted_tables:
        rows = generate_table_data(table, pk_pools)
        csv_data = rows_to_csv(rows)
        results.append({
            "name":      table["name"],
            "row_count": len(rows),
            "columns":   [c["name"] for c in table.get("columns", [])],
            "csv":       csv_data,
        })

    return results