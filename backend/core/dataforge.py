"""
Lens — DataForge
================
Synthetic relational data generator.
LLM used twice: schema from prompt, noise rules from prompt.
All actual data generation is deterministic Python + Faker (no hardcoded lists).
"""

from __future__ import annotations
import os
import re
import random
import string
import json
from datetime import datetime, timedelta, date as date_type
from typing import Any, Optional

from faker import Faker
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
fake = Faker()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
LLM_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


# ─────────────────────────────────────────────
# SCHEMA GENERATION VIA LLM
# ─────────────────────────────────────────────

def generate_schema_from_prompt(prompt: str) -> list[dict]:
    """LLM interprets plain English → structured schema. All data gen is deterministic Python."""
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
    for i, t in enumerate(tables):
        if "id" not in t:
            t["id"] = f"t{i+1}"
    return tables


# ─────────────────────────────────────────────
# CLEAN DATA GENERATION  (Faker — no hardcoded lists)
# ─────────────────────────────────────────────

def gen_value(col: dict, row_idx: int, pk_pools: dict[str, list]) -> Any:
    col_type = col.get("type", "string")
    name     = col.get("name", "").lower()
    is_pk    = col.get("is_pk", False)
    fk_table = col.get("fk_table")
    fk_col   = col.get("fk_column")
    nullable = col.get("nullable", False)

    if nullable and random.random() < 0.05:
        return ""

    # FK — sample from parent pool
    if fk_table and fk_col:
        pool = pk_pools.get(f"{fk_table}.{fk_col}", [])
        return random.choice(pool) if pool else ""

    # Primary key
    if is_pk:
        return str(fake.uuid4()) if col_type == "uuid" else row_idx + 1

    if col_type == "uuid":
        return str(fake.uuid4())

    elif col_type == "integer":
        mn = int(col.get("min", 1))
        mx = int(col.get("max", 1000))
        if mn >= mx:
            mx = mn + 1
        return fake.random_int(min=mn, max=mx)

    elif col_type == "decimal":
        mn = float(col.get("min", 0.0))
        mx = float(col.get("max", 100.0))
        if mn >= mx:
            mx = mn + 1.0
        return round(fake.pyfloat(min_value=mn, max_value=mx), 2)

    elif col_type == "date":
        return fake.date_between(
            start_date=date_type(2018, 1, 1),
            end_date=date_type(2024, 12, 31),
        ).strftime("%Y-%m-%d")

    elif col_type == "email":
        return fake.email()

    elif col_type == "phone":
        return fake.phone_number()

    elif col_type == "categorical":
        cats = col.get("categories", ["A", "B", "C"])
        return random.choice(cats)

    elif col_type == "string":
        if any(w in name for w in ["company", "corp", "entity", "obligor", "employer", "vendor", "merchant", "org"]):
            return fake.company()
        if any(w in name for w in ["name", "borrower", "customer", "person", "client", "owner", "manager", "agent", "contact"]):
            return fake.name()
        if "first" in name:
            return fake.first_name()
        if "last" in name or "surname" in name:
            return fake.last_name()
        if "address" in name or "street" in name:
            return fake.street_address()
        if "city" in name:
            return fake.city()
        if "state" in name or "province" in name or "region" in name:
            return fake.state_abbr()
        if "zip" in name or "postal" in name or "postcode" in name:
            return fake.postcode()
        if "country" in name:
            return fake.country_code()
        if "description" in name or "note" in name or "comment" in name or "remark" in name or "detail" in name:
            return fake.sentence(nb_words=6)
        if "title" in name or "job" in name or "position" in name or "role" in name:
            return fake.job()
        if "department" in name or "dept" in name or "division" in name:
            return fake.bs().split()[0].capitalize() + " Dept"
        if "url" in name or "website" in name or "link" in name or "site" in name:
            return fake.url()
        if "gender" in name or "sex" in name:
            return random.choice(["Male", "Female", "Non-binary"])
        if "code" in name or "ref" in name or "num" in name or "number" in name:
            prefix = name.split("_")[0].upper()[:3]
            return f"{prefix}-{fake.numerify('######')}"
        if "status" in name or "stage" in name or "flag" in name:
            return fake.word().capitalize()
        # generic fallback — random word + row index so it stays unique
        return fake.word() + f"_{row_idx}"

    return f"val_{row_idx}"


def generate_table_data(table: dict, pk_pools: dict) -> list[dict]:
    rows      = []
    row_count = table.get("row_count", 100)
    columns   = table.get("columns", [])
    pk_cols   = [c for c in columns if c.get("is_pk")]

    for row_idx in range(row_count):
        row = {col["name"]: gen_value(col, row_idx, pk_pools) for col in columns}
        rows.append(row)

    for pk_col in pk_cols:
        pool_key = f"{table['name']}.{pk_col['name']}"
        pk_pools[pool_key] = [r[pk_col["name"]] for r in rows]

    return rows


# ─────────────────────────────────────────────
# NOISE RULES GENERATION VIA LLM
# ─────────────────────────────────────────────

def generate_noise_rules_from_prompt(noise_prompt: str, tables: list[dict]) -> list[dict]:
    """LLM interprets noise description → structured rules. Python applies them — 1 API call only."""
    schema_summary = json.dumps([
        {
            "name": t["name"],
            "columns": [{"name": c["name"], "type": c.get("type", "string")} for c in t.get("columns", [])],
        }
        for t in tables
    ], indent=2)

    system = """You are a data quality expert. Given a database schema and a noise description, return ONLY a JSON array of noise rules. No markdown, no backticks, no explanation.

Each rule object has exactly these fields:
- table: table name (must exactly match schema)
- column: column name (must exactly match schema), or "__all__" to affect all non-PK columns, or "__row__" for row-level operations
- noise_type: one of: null, malformed, out_of_range, negative, typo, whitespace, wrong_type, future_date, special_chars, duplicate
- rate: fraction of rows to affect (0.01 to 1.0)
- description: one line describing what this noise does

Noise type meanings:
- null          → replace value with blank/empty
- malformed     → corrupt the format (bad email address, broken date like 2024-99-99, invalid phone with letters)
- out_of_range  → numeric value far outside expected range (multiply by 1000x or negate+magnify)
- negative      → make numeric values negative
- typo          → random character swap, insertion, or deletion in the value
- whitespace    → add extra leading/trailing spaces
- wrong_type    → put a random word/string in a numeric column
- future_date   → replace date with one far in the future (post-2030)
- special_chars → inject special chars like $$$, ###, @@@, !!! into the value
- duplicate     → duplicate some rows in the table (use column="__row__" for this)

Rules:
- Match EXACTLY the table/column names from the schema provided.
- Never apply noise to primary key columns.
- Be precise about which table and column the user is describing.
- If the user says "all columns" or "entire table", use column="__all__".
- Return ONLY the JSON array, nothing else."""

    response = groq_client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": f"Schema:\n{schema_summary}\n\nNoise to inject:\n{noise_prompt}"},
        ],
        temperature=0.1,
        max_tokens=2048,
    )

    text = response.choices[0].message.content.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return json.loads(text.strip())


# ─────────────────────────────────────────────
# NOISE APPLICATION ENGINE
# ─────────────────────────────────────────────

def _corrupt(value: Any, noise_type: str, col_type: str) -> Any:
    v = str(value)

    if noise_type == "null":
        return ""

    if noise_type == "malformed":
        if col_type == "email" or "@" in v:
            return v.replace("@", "").replace(".", "") + "@@..invalid"
        if col_type == "phone":
            return re.sub(r"\d", lambda _: random.choice(string.ascii_uppercase), v, count=4)
        if col_type == "date":
            return v[:4] + "-99-99"
        if col_type in ("integer", "decimal"):
            return v + ".X.X"
        mid = len(v) // 2
        return v[:mid] + "##CORRUPT##" + v[mid:]

    if noise_type == "out_of_range":
        try:
            return round(float(value) * 1000 + 99999, 2)
        except (ValueError, TypeError):
            return value

    if noise_type == "negative":
        try:
            return -abs(float(value))
        except (ValueError, TypeError):
            return value

    if noise_type == "typo":
        chars = list(v)
        if len(chars) > 2:
            chars[random.randint(0, len(chars) - 1)] = random.choice(string.ascii_lowercase)
        return "".join(chars)

    if noise_type == "whitespace":
        pad = " " * random.randint(3, 6)
        return pad + v + pad

    if noise_type == "wrong_type":
        return fake.word()

    if noise_type == "future_date":
        start = datetime(2031, 1, 1)
        end   = datetime(2045, 12, 31)
        return (start + timedelta(days=random.randint(0, (end - start).days))).strftime("%Y-%m-%d")

    if noise_type == "special_chars":
        inject = random.choice(["$$$", "###", "@@@", "!!!", "???", "%%%", "***", "///"])
        pos = random.randint(0, len(v))
        return v[:pos] + inject + v[pos:]

    return value


def apply_noise_to_table(
    rows: list[dict],
    table_name: str,
    noise_rules: list[dict],
    table_schema: dict,
) -> list[dict]:
    if not rows or not noise_rules:
        return rows

    pk_cols      = {c["name"] for c in table_schema.get("columns", []) if c.get("is_pk")}
    col_type_map = {c["name"]: c.get("type", "string") for c in table_schema.get("columns", [])}

    duplicate_rate = 0.0
    col_rules: list[dict] = []

    for rule in noise_rules:
        if rule.get("table") != table_name:
            continue
        if rule.get("column") == "__row__" and rule.get("noise_type") == "duplicate":
            duplicate_rate = float(rule.get("rate", 0.0))
        else:
            col_rules.append(rule)

    for rule in col_rules:
        col_name   = rule.get("column")
        noise_type = rule.get("noise_type")
        rate       = float(rule.get("rate", 0.1))

        if col_name == "__all__":
            targets = [c for c in col_type_map if c not in pk_cols]
        elif col_name in col_type_map and col_name not in pk_cols:
            targets = [col_name]
        else:
            continue

        for row in rows:
            if random.random() < rate:
                for tc in targets:
                    row[tc] = _corrupt(row[tc], noise_type, col_type_map.get(tc, "string"))

    if duplicate_rate > 0:
        n_dupes = int(len(rows) * duplicate_rate)
        rows = rows + random.choices(rows, k=n_dupes)
        random.shuffle(rows)

    return rows


# ─────────────────────────────────────────────
# CSV SERIALIZATION
# ─────────────────────────────────────────────

def rows_to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    headers = list(rows[0].keys())
    lines   = [",".join(str(h) for h in headers)]
    for row in rows:
        vals = []
        for h in headers:
            v = str(row.get(h, ""))
            if "," in v or '"' in v:
                v = f'"{v.replace(chr(34), chr(34)+chr(34))}"'
            vals.append(v)
        lines.append(",".join(vals))
    return "\n".join(lines)


# ─────────────────────────────────────────────
# MAIN ORCHESTRATOR
# ─────────────────────────────────────────────

def generate_all_tables(
    tables: list[dict],
    noise_prompt: Optional[str] = None,
) -> tuple[list[dict], list[dict]]:
    """
    Generate data for all tables in topological order.
    Optionally inject noise as described by noise_prompt.
    Returns (results, noise_rules_applied).
    """
    def fk_tables(t: dict) -> set[str]:
        return {c["fk_table"] for c in t.get("columns", []) if c.get("fk_table")}

    sorted_tables: list[dict] = []
    remaining = list(tables)
    generated: set[str] = set()
    iters = 0

    while remaining and iters < len(tables) * 2:
        iters += 1
        for t in remaining[:]:
            if fk_tables(t).issubset(generated):
                sorted_tables.append(t)
                generated.add(t["name"])
                remaining.remove(t)
    sorted_tables.extend(remaining)

    noise_rules: list[dict] = []
    if noise_prompt and noise_prompt.strip():
        noise_rules = generate_noise_rules_from_prompt(noise_prompt, tables)

    pk_pools:  dict[str, list] = {}
    table_map: dict[str, dict] = {t["name"]: t for t in tables}
    results:   list[dict]      = []

    for table in sorted_tables:
        rows = generate_table_data(table, pk_pools)
        if noise_rules:
            rows = apply_noise_to_table(rows, table["name"], noise_rules, table_map.get(table["name"], table))
        results.append({
            "name":      table["name"],
            "row_count": len(rows),
            "columns":   [c["name"] for c in table.get("columns", [])],
            "csv":       rows_to_csv(rows),
        })

    return results, noise_rules
