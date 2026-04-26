from backend.profilers.unstructured.unstructured_profiler import profile_unstructured
import json

print("Starting Lens unstructured profiler...")
print("This will take 60-90 seconds for LLM layers.")
print()

result = profile_unstructured(
    'demo_data/unstructured/loan_agreement.pdf',
    include_page_summaries=False,
)

print()
print("=" * 60)
print("LENS — UNSTRUCTURED PROFILE RESULT")
print("=" * 60)
print(f"Profile ID      : {result.profile_id}")
print(f"Document Type   : {result.document_type} (confidence: {result.document_type_confidence})")
print(f"Pages           : {result.page_count}")
print(f"Health Score    : {result.health_score}/100")
print(f"Completeness    : {result.completeness_score}% ({result.found_fields_count}/{result.expected_fields_count} fields)")
print()

print("── CRITICAL BUSINESS ELEMENTS ──")
for cbe in result.critical_business_elements:
    status = str(cbe.value) if cbe.value else f"NOT FOUND ({cbe.not_found_reason})"
    page = f"p.{cbe.provenance.page}" if cbe.provenance and cbe.provenance.page else ""
    print(f"  {cbe.field_name:20} : {status:40} {page}")

print()
print("── MONETARY AMOUNTS FOUND ──")
for amt in result.monetary_amounts[:10]:
    page = f"p.{amt.provenance.page}" if amt.provenance and amt.provenance.page else ""
    print(f"  [{amt.field_name:15}] {amt.value:20} {page}")

print()
print("── KEY DATES FOUND ──")
seen = set()
for d in result.key_dates[:10]:
    if d.value not in seen:
        seen.add(d.value)
        page = f"p.{d.provenance.page}" if d.provenance and d.provenance.page else ""
        print(f"  [{d.field_name:20}] {d.value:25} {page}")

print()
print("── EXECUTIVE SUMMARY ──")
print(result.summary.executive)

print()
print("── ADDITIONAL FINDINGS ──")
for f in result.additional_findings:
    print(f"  {f.field_name}: {f.value}")
    if f.business_definition:
        print(f"    → {f.business_definition}")