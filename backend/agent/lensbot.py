"""
Lens — LensBot Agent
====================
LangGraph-powered agent for answering questions about profiled data.
Anti-hallucination: only answers from profile data, never invents.
Every answer cites its source.
"""

from __future__ import annotations
import os
import json
from typing import Annotated, TypedDict, Literal
from dotenv import load_dotenv

from groq import Groq
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from backend.models.profile_contract import ProfileContract

load_dotenv()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
LLM_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


# ─────────────────────────────────────────────
# STATE
# ─────────────────────────────────────────────

class AgentState(TypedDict):
    messages:        Annotated[list, add_messages]
    profile:         dict
    tool_results:    list[dict]
    final_answer:    str
    citations:       list[str]


# ─────────────────────────────────────────────
# TOOLS
# ─────────────────────────────────────────────

def tool_search_profile(profile: dict, query: str) -> dict:
    """
    Search the structured profile for relevant fields.
    Returns matching CBEs, columns, health metrics, findings.
    """
    query_lower = query.lower()
    results = {}

    modality = profile.get("modality", "")

    # Health score
    if any(w in query_lower for w in ["health", "score", "quality"]):
        results["health_score"] = profile.get("health_score")
        results["health_breakdown"] = profile.get("health_breakdown")

    # Structured — column search
    if modality == "structured":
        cols = profile.get("columns", [])
        matching_cols = [
            c for c in cols
            if (query_lower in c.get("column_name", "").lower() or
                query_lower in (c.get("semantic_type") or "").lower() or
                any(w in query_lower for w in ["missing", "null"]) and c.get("missing_pct", 0) > 0 or
                any(w in query_lower for w in ["pii", "sensitive", "personal"]) and c.get("is_pii") or
                any(w in query_lower for w in ["column", "field", "all"]))
        ]
        if matching_cols:
            results["columns"] = matching_cols[:10]

        # Stats
        if any(w in query_lower for w in ["row", "record", "count", "size", "dimension"]):
            results["row_count"] = profile.get("row_count")
            results["column_count"] = profile.get("column_count")
            results["duplicate_row_count"] = profile.get("duplicate_row_count")

        # Drift
        if any(w in query_lower for w in ["drift", "change", "shift"]):
            results["drift_alerts"] = profile.get("drift_alerts", [])

        # Cross-column intelligence
        if any(w in query_lower for w in ["primary key", "join", "dependency", "intelligence", "pattern"]):
            results["cross_column_intelligence"] = profile.get("raw_llm_narrative", "")

    # Unstructured — CDE search
    if modality == "unstructured":
        cdes = profile.get("critical_data_elements", [])
        matching = [
            f for f in cdes
            if (query_lower in f.get("field_name", "").lower() or
                query_lower in str(f.get("value") or "").lower() or
                any(w in query_lower for w in ["all", "every", "list"]))
        ]
        if matching:
            results["critical_data_elements"] = matching[:15]

        findings = profile.get("additional_findings", [])
        matching_findings = [
            f for f in findings
            if query_lower in f.get("field_name", "").lower() or
               query_lower in str(f.get("value") or "").lower() or
               any(w in query_lower for w in ["all", "every", "additional", "more"])
        ]
        if matching_findings:
            results["additional_findings"] = matching_findings[:10]

        if any(w in query_lower for w in ["summary", "overview", "executive", "describe"]):
            results["executive_summary"] = (profile.get("summary") or {}).get("executive", "")[:500]

        if any(w in query_lower for w in ["party", "parties", "borrower", "lender", "guarantor"]):
            results["parties"] = profile.get("parties", [])

        if any(w in query_lower for w in ["date", "maturity", "effective", "payment"]):
            results["key_dates"] = profile.get("key_dates", [])

        if any(w in query_lower for w in ["amount", "money", "dollar", "payment", "principal"]):
            results["monetary_amounts"] = profile.get("monetary_amounts", [])

        if any(w in query_lower for w in ["obligation", "covenant", "default", "condition"]):
            results["obligations"] = profile.get("obligations", [])[:10]

        if any(w in query_lower for w in ["page", "page count", "pages"]):
            results["page_count"] = profile.get("page_count")

        if any(w in query_lower for w in ["completeness", "complete", "missing field"]):
            results["completeness_score"] = profile.get("completeness_score")
            results["found_fields_count"] = profile.get("found_fields_count")
            results["expected_fields_count"] = profile.get("expected_fields_count")

    # Semi-structured
    if modality == "semi_structured":
        results["row_count"] = profile.get("row_count")
        results["column_count"] = profile.get("column_count")
        results["schema_fields"] = profile.get("critical_data_elements", [])[:10]

    return results if results else {"message": "No relevant data found for this query in the profile."}


def tool_compute(profile: dict, expression: str) -> dict:
    """
    Run simple computations on profile data.
    E.g. average interest rate, total loan amount, days until maturity.
    """
    try:
        expr_lower = expression.lower()
        result = {}

        modality = profile.get("modality", "")

        if modality == "structured":
            cols = profile.get("columns", [])
            numeric_cols = {c["column_name"]: c for c in cols if c.get("mean") is not None}

            # Average
            if "average" in expr_lower or "mean" in expr_lower:
                for col_name, col in numeric_cols.items():
                    if col_name.lower() in expr_lower:
                        result = {
                            "computation": f"Average of {col_name}",
                            "result": col.get("mean"),
                            "note": f"Based on {profile.get('row_count')} rows",
                        }

            # Sum approximation
            if "total" in expr_lower or "sum" in expr_lower:
                for col_name, col in numeric_cols.items():
                    if col_name.lower() in expr_lower:
                        approx_sum = (col.get("mean") or 0) * (profile.get("row_count") or 1)
                        result = {
                            "computation": f"Approximate total of {col_name}",
                            "result": round(approx_sum, 2),
                            "note": "Approximation: mean × row count",
                        }

            # Missing count
            if "missing" in expr_lower:
                for col_name, col in {c["column_name"]: c for c in cols}.items():
                    if col_name.lower() in expr_lower:
                        result = {
                            "computation": f"Missing values in {col_name}",
                            "result": col.get("missing_count"),
                            "percentage": f"{col.get('missing_pct')}%",
                        }

        if modality == "unstructured":
            # Days until maturity
            if "days" in expr_lower or "maturity" in expr_lower:
                from datetime import datetime
                dates = profile.get("key_dates", [])
                maturity = next((d for d in dates if "maturity" in d.get("field_name", "").lower()), None)
                if maturity and maturity.get("value"):
                    try:
                        mat_date = datetime.strptime(maturity["value"], "%B %d, %Y")
                        days = (mat_date - datetime.utcnow()).days
                        result = {
                            "computation": "Days until maturity",
                            "result": days,
                            "maturity_date": maturity["value"],
                            "note": f"{'Future' if days > 0 else 'Past'} date",
                        }
                    except Exception:
                        result = {"message": "Could not parse maturity date"}

        return result if result else {"message": f"Could not compute: {expression}"}

    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
# AGENT NODES
# ─────────────────────────────────────────────

def node_router(state: AgentState) -> AgentState:
    """
    Decides which tool to call based on the question.
    Runs the tool and stores results.
    """
    messages = state["messages"]
    last = messages[-1]
    question = last.content if hasattr(last, 'content') else last.get("content", "") if isinstance(last, dict) else str(last)
    profile = state["profile"]
    question_lower = question.lower()

    tool_results = []

    # Always search profile first
    search_result = tool_search_profile(profile, question)
    tool_results.append({
        "tool": "search_profile",
        "query": question,
        "result": search_result,
    })

    # Also compute if mathematical question
    compute_keywords = ["average", "mean", "total", "sum", "how many", "count",
                        "days until", "calculate", "compute", "how much"]
    if any(kw in question_lower for kw in compute_keywords):
        compute_result = tool_compute(profile, question)
        tool_results.append({
            "tool": "compute",
            "expression": question,
            "result": compute_result,
        })

    return {**state, "tool_results": tool_results}


def node_synthesise(state: AgentState) -> AgentState:
    """
    Takes tool results and generates a cited, accurate answer.
    Anti-hallucination: if data not in tool results, says so.
    """
    messages = state["messages"]
    last = messages[-1]
    question = last.content if hasattr(last, 'content') else last.get("content", "") if isinstance(last, dict) else str(last)
    profile = state["profile"]
    tool_results = state["tool_results"]

    # Build context from tool results
    context_parts = []
    for tr in tool_results:
        context_parts.append(
            f"Tool: {tr['tool']}\n"
            f"Result: {json.dumps(tr['result'], indent=2, default=str)[:2000]}"
        )
    context = "\n\n".join(context_parts)

    modality = profile.get("modality", "structured")
    filename = profile.get("filename", "the document")

    system_prompt = f"""You are LensBot, an intelligent data assistant for Wells Fargo CDO.
You answer questions about data profiles generated by the Lens platform.

FILE: {filename}
MODALITY: {modality}

CRITICAL RULES — READ CAREFULLY:
1. ONLY use the tool results provided below to answer
2. If the answer is NOT in the tool results, say EXACTLY:
   "This information is not available in the current profile."
3. NEVER use your general knowledge or training data to answer
4. NEVER invent numbers, dates, or facts
5. Always be specific — cite column names, values, page numbers
6. Keep answers concise and professional
7. For banking professionals — use appropriate terminology

TOOL RESULTS (your ONLY source of truth):
{context}"""

    try:
        response = groq_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": question},
            ],
            temperature=0.1,
            max_tokens=1024,
        )
        answer = response.choices[0].message.content.strip()
    except Exception as e:
        answer = f"I encountered an error processing your question: {str(e)}"

    return {**state, "final_answer": answer}


# ─────────────────────────────────────────────
# BUILD GRAPH
# ─────────────────────────────────────────────

def build_agent():
    graph = StateGraph(AgentState)
    graph.add_node("router",    node_router)
    graph.add_node("synthesise", node_synthesise)
    graph.set_entry_point("router")
    graph.add_edge("router", "synthesise")
    graph.add_edge("synthesise", END)
    return graph.compile()


agent = build_agent()


# ─────────────────────────────────────────────
# PUBLIC INTERFACE
# ─────────────────────────────────────────────

def ask_lensbot(
    question: str,
    profile: ProfileContract,
    history: list[dict] | None = None,
) -> dict:
    """
    Main entry point.
    Returns: { answer, tool_results, citations }
    """
    profile_dict = profile.model_dump()

    messages = []
    if history:
        messages.extend(history[-6:])  # last 3 exchanges for context
    messages.append({"role": "user", "content": question})

    initial_state: AgentState = {
        "messages":     messages,
        "profile":      profile_dict,
        "tool_results": [],
        "final_answer": "",
        "citations":    [],
    }

    result = agent.invoke(initial_state)

    return {
        "answer":       result["final_answer"],
        "tool_results": result["tool_results"],
        "model":        LLM_MODEL,
    }