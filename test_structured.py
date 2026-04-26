from backend.profilers.structured.structured_profiler import profile_structured

result = profile_structured('demo_data/structured/sample_loans.csv')

print('Profile ID:', result.profile_id)
print('Rows:', result.row_count)
print('Columns:', result.column_count)
print('Health Score:', result.health_score)
print('Health Breakdown:', result.health_breakdown)
print()
print('Column Summary:')
for col in result.columns:
    pii = 'PII' if col.is_pii else ''
    print(f'  {col.column_name:25} {col.data_type:15} {col.semantic_type or "":20} missing={col.missing_pct}% {pii}')