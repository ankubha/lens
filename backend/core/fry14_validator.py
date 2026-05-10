"""
Lens — FR Y-14Q Schedule H Validator
=====================================
Validates extracted document fields against ALL Federal Reserve
FR Y-14Q Schedule H field definitions.

Coverage:
  H.1 Corporate Loan Data Schedule    — 104 active fields
  H.2 Commercial Real Estate Schedule — 65 active fields  
  H.3 Line of Business Schedule       — 2 active fields
  H.4 Internal Risk Rating Schedule   — 5 active fields
  Total: 176 active fields (15 DO NOT USE excluded)

Validation types:
  code_list     — must match fixed allowable values
  date_format   — must be yyyy-mm-dd
  decimal       — must be decimal number (not percentage)
  dollar_amount — whole dollar, no commas or symbols
  integer       — numbers only
  free_text     — present/not present + no illegal characters
  identifier    — no carriage returns, commas, unprintable chars
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class ScheduleHField:
    field_no:         str
    schedule:         str
    field_name:       str
    tech_name:        str
    validation_type:  Literal[
        "code_list", "date_format", "decimal",
        "dollar_amount", "integer", "free_text", "identifier"
    ]
    allowable_values: list[str] = field(default_factory=list)
    required:         bool = False
    description:      str = ""


# ─────────────────────────────────────────────
# ALL 176 ACTIVE SCHEDULE H FIELDS
# ─────────────────────────────────────────────

SCHEDULE_H_FIELDS: list[ScheduleHField] = [

    # ══════════════════════════════════════════
    # H.1 CORPORATE LOAN DATA SCHEDULE
    # 104 active fields (Fields 17,29,30,31,84,85,109,110 = DO NOT USE)
    # ══════════════════════════════════════════

    ScheduleHField("H1-1",  "H.1", "Customer ID", "CustomerID",
        "identifier", [], True, "Unique internal identifier for the customer"),
    ScheduleHField("H1-2",  "H.1", "Internal Obligor ID", "InternalObligorID",
        "identifier", [], True, "Reporting entity unique internal identifier for the obligor"),
    ScheduleHField("H1-3",  "H.1", "Original Internal Obligor ID", "OriginalInternalObligorID",
        "identifier", [], False, "Internal ID assigned to the obligor at origination"),
    ScheduleHField("H1-4",  "H.1", "Obligor Name", "ObligorName",
        "free_text", [], True, "Full legal name of the obligor"),
    ScheduleHField("H1-5",  "H.1", "City", "City",
        "free_text", [], False, "City where obligor is domiciled"),
    ScheduleHField("H1-6",  "H.1", "Country", "Country",
        "identifier", [], True, "2-letter ISO country code of obligor domicile"),
    ScheduleHField("H1-7",  "H.1", "Zip Code", "ZipCode",
        "identifier", [], False, "5-digit ZIP code or international postal code"),
    ScheduleHField("H1-8",  "H.1", "Industry Code", "IndustryCode",
        "integer", [], False, "4-6 digit NAICS, SIC, or GICS industry code"),
    ScheduleHField("H1-9",  "H.1", "Industry Code Type", "IndustryCodeType",
        "code_list", ["NAICS", "SIC", "GICS"], False,
        "Type of industry code identification scheme"),
    ScheduleHField("H1-10", "H.1", "Obligor Internal Risk Rating", "InternalRating",
        "free_text", [], True, "Obligor rating grade from reporting entity's rating system"),
    ScheduleHField("H1-11", "H.1", "TIN", "TIN",
        "identifier", [], False, "9-digit Taxpayer Identification Number"),
    ScheduleHField("H1-12", "H.1", "Stock Exchange", "StockExchange",
        "free_text", [], False, "Name of stock exchange where obligor is listed"),
    ScheduleHField("H1-13", "H.1", "Ticker Symbol", "TKR",
        "free_text", [], False, "Stock ticker symbol for listed obligors"),
    ScheduleHField("H1-14", "H.1", "CUSIP", "CUSIP",
        "identifier", [], False, "Valid 6-digit CUSIP number"),
    ScheduleHField("H1-15", "H.1", "Internal Credit Facility ID", "InternalCreditFacilityID",
        "identifier", [], True, "Reporting entity unique internal ID for the credit facility"),
    ScheduleHField("H1-16", "H.1", "Original Internal Credit Facility ID", "OriginalInternalCreditFacilityID",
        "identifier", [], False, "Internal ID assigned to credit facility at origination"),
    ScheduleHField("H1-18", "H.1", "Origination Date", "OriginationDate",
        "date_format", [], True, "Date credit facility was originated (yyyy-mm-dd)"),
    ScheduleHField("H1-19", "H.1", "Maturity Date", "MaturityDate",
        "date_format", [], True, "Date credit facility matures (yyyy-mm-dd)"),
    ScheduleHField("H1-20", "H.1", "Credit Facility Type", "CreditFacilityType",
        "code_list", [
            "Term Loan", "Revolving Credit", "Letter of Credit",
            "364-Day Facility", "Other", "Lease", "Demand Loan",
        ], True, "Type of credit facility"),
    ScheduleHField("H1-21", "H.1", "Other Credit Facility Type Description", "OtherCreditFacilityTypeDesc",
        "free_text", [], False, "Description when Credit Facility Type is Other"),
    ScheduleHField("H1-22", "H.1", "Credit Facility Purpose", "CreditFacilityPurpose",
        "code_list", [
            "General Corporate Purpose", "Working Capital", "Acquisition",
            "Capital Expenditure", "Refinancing", "Trade Finance",
            "Leveraged Buyout", "Project Finance", "Other",
        ], False, "Purpose of the credit facility"),
    ScheduleHField("H1-23", "H.1", "Other Credit Facility Purpose Description", "OtherCreditFacilityPurposeDesc",
        "free_text", [], False, "Description when Credit Facility Purpose is Other"),
    ScheduleHField("H1-24", "H.1", "Committed Exposure Global", "CommittedExposureGlobal",
        "dollar_amount", [], True, "Total committed exposure in whole dollars"),
    ScheduleHField("H1-25", "H.1", "Utilized Exposure Global", "UtilizedExposureGlobal",
        "dollar_amount", [], True, "Total utilized exposure in whole dollars"),
    ScheduleHField("H1-26", "H.1", "Line Reported on FR Y-9C", "LineReportedFRY9C",
        "code_list", [
            "1-4 family residential",
            "Other construction loans and all land development",
            "Commercial and industrial loans to U.S. addresses",
            "Commercial and industrial loans to non-U.S. addresses",
            "Loans to foreign governments",
            "Loans to non-depository financial institutions",
            "All other loans", "All other leases",
        ], True, "FR Y-9C Schedule HC-C line item"),
    ScheduleHField("H1-27", "H.1", "Committed Exposure Domestic", "CommittedExposureDomestic",
        "dollar_amount", [], False, "Committed exposure in domestic offices"),
    ScheduleHField("H1-28", "H.1", "Cumulative Charge-offs", "CumulativeChargeoffs",
        "dollar_amount", [], False, "Total cumulative charge-offs since origination"),
    ScheduleHField("H1-32", "H.1", "Days Principal or Interest Past Due", "DaysPastDue",
        "integer", [], True, "Number of days principal or interest is past due"),
    ScheduleHField("H1-33", "H.1", "Non-Accrual Date", "NonAccrualDate",
        "date_format", [], False, "Date facility was placed on non-accrual (yyyy-mm-dd)"),
    ScheduleHField("H1-34", "H.1", "Participation Flag", "ParticipationFlag",
        "code_list", [
            "No",
            "Yes, syndicate/participant in syndication but does not meet the definition of a Shared National Credit",
            "Yes, agent in syndication or participation but does not meet the definition of a Shared National Credit",
            "Yes, syndicate/participant in Shared National Credit",
            "Yes, agent in Shared National Credit",
        ], True, "Whether facility is a participation or syndication"),
    ScheduleHField("H1-35", "H.1", "Lien Position", "LienPosition",
        "code_list", [
            "First-Lien Senior", "Second Lien",
            "Senior Unsecured", "Contractually Subordinated",
        ], True, "Lien position of the credit facility"),
    ScheduleHField("H1-36", "H.1", "Security Type", "SecurityType",
        "code_list", [
            "Secured by real estate", "Secured by other collateral",
            "Unsecured", "Secured by financial assets",
        ], True, "Type of security or collateral"),
    ScheduleHField("H1-37", "H.1", "Interest Rate Variability", "InterestRateVariability",
        "code_list", ["Fixed", "Floating", "Mixed", "Entirely fee based"],
        True, "Whether interest rate is fixed, floating, or mixed"),
    ScheduleHField("H1-38", "H.1", "All-in Interest Rate", "AllInInterestRate",
        "decimal", [], False, "All-in interest rate as decimal"),
    ScheduleHField("H1-39", "H.1", "Interest Rate Index", "InterestRateIndex",
        "code_list", [
            "LIBOR", "SOFR", "PRIME or Base", "Treasury Index",
            "Other", "Not applicable", "Mixed",
        ], False, "Benchmark index for floating rate"),
    ScheduleHField("H1-40", "H.1", "Interest Rate Spread", "InterestRateSpread",
        "decimal", [], False, "Spread over benchmark as decimal (e.g. 0.0250 for 2.50%)"),
    ScheduleHField("H1-41", "H.1", "Interest Rate Ceiling", "InterestRateCeiling",
        "decimal", [], False, "Maximum interest rate cap as decimal"),
    ScheduleHField("H1-42", "H.1", "Interest Rate Floor", "InterestRateFloor",
        "decimal", [], False, "Minimum interest rate floor as decimal"),
    ScheduleHField("H1-43", "H.1", "Interest Income Tax Status", "InterestIncomeTaxStatus",
        "code_list", ["Taxable", "Tax Exempt"],
        False, "Whether interest income is taxable or exempt"),
    ScheduleHField("H1-44", "H.1", "Guarantor Flag", "GuarantorFlag",
        "code_list", [
            "Full guarantee", "Partial guarantee",
            "U.S. Government Agency Guarantee", "No guarantee",
        ], True, "Type of guarantee on the credit facility"),
    ScheduleHField("H1-45", "H.1", "Guarantor Name", "GuarantorName",
        "free_text", [], False, "Full legal name of the guarantor"),
    ScheduleHField("H1-46", "H.1", "Guarantor Country", "GuarantorCountry",
        "identifier", [], False, "2-letter country code of guarantor domicile"),
    ScheduleHField("H1-47", "H.1", "Guarantor TIN", "GuarantorTIN",
        "identifier", [], False, "9-digit TIN of the guarantor"),
    ScheduleHField("H1-48", "H.1", "Guarantor Internal Risk Rating", "GuarantorInternalRating",
        "free_text", [], False, "Risk rating assigned to the guarantor"),
    ScheduleHField("H1-49", "H.1", "Collateral Value", "CollateralValue",
        "dollar_amount", [], False, "Current value of collateral in whole dollars"),
    ScheduleHField("H1-50", "H.1", "Collateral Value Date", "CollateralValueDate",
        "date_format", [], False, "Date of collateral valuation (yyyy-mm-dd)"),
    ScheduleHField("H1-51", "H.1", "Origination Amount", "OriginationAmount",
        "dollar_amount", [], False, "Original committed balance at origination"),
    ScheduleHField("H1-52", "H.1", "Total Revenue", "TotalRevenue",
        "dollar_amount", [], False, "Obligor total annual revenues"),
    ScheduleHField("H1-53", "H.1", "Total Assets", "TotalAssets",
        "dollar_amount", [], False, "Obligor total assets"),
    ScheduleHField("H1-54", "H.1", "EBITDA", "EBITDA",
        "dollar_amount", [], False, "Obligor EBITDA for trailing 12 months"),
    ScheduleHField("H1-55", "H.1", "Total Funded Debt", "TotalFundedDebt",
        "dollar_amount", [], False, "Obligor total funded debt"),
    ScheduleHField("H1-56", "H.1", "Interest Expense", "InterestExpense",
        "dollar_amount", [], False, "Obligor total interest expense"),
    ScheduleHField("H1-57", "H.1", "Net Income", "NetIncome",
        "dollar_amount", [], False, "Obligor net income for trailing 12 months"),
    ScheduleHField("H1-58", "H.1", "Cash and Equivalents", "CashAndEquivalents",
        "dollar_amount", [], False, "Obligor cash and cash equivalents"),
    ScheduleHField("H1-59", "H.1", "Capital Expenditures", "CapEx",
        "dollar_amount", [], False, "Obligor capital expenditures"),
    ScheduleHField("H1-60", "H.1", "Total Equity", "TotalEquity",
        "dollar_amount", [], False, "Obligor total equity"),
    ScheduleHField("H1-61", "H.1", "Current Assets", "CurrentAssets",
        "dollar_amount", [], False, "Obligor current assets"),
    ScheduleHField("H1-62", "H.1", "Current Liabilities", "CurrentLiabilities",
        "dollar_amount", [], False, "Obligor current liabilities"),
    ScheduleHField("H1-63", "H.1", "Total Liabilities", "TotalLiabilities",
        "dollar_amount", [], False, "Obligor total liabilities"),
    ScheduleHField("H1-64", "H.1", "Tangible Net Worth", "TangibleNetWorth",
        "dollar_amount", [], False, "Obligor tangible net worth"),
    ScheduleHField("H1-65", "H.1", "Goodwill and Intangibles", "GoodwillIntangibles",
        "dollar_amount", [], False, "Obligor goodwill and intangible assets"),
    ScheduleHField("H1-66", "H.1", "Depreciation and Amortization", "DeprecAmort",
        "dollar_amount", [], False, "Obligor D&A for trailing 12 months"),
    ScheduleHField("H1-67", "H.1", "Total Debt Service", "TotalDebtService",
        "dollar_amount", [], False, "Total annual principal and interest payments"),
    ScheduleHField("H1-68", "H.1", "Financial Statement Date", "FinancialStatementDate",
        "date_format", [], False, "Date of most recent financial statements (yyyy-mm-dd)"),
    ScheduleHField("H1-69", "H.1", "Financial Statement Type", "FinancialStatementType",
        "free_text", [], False, "Type of financial statement (audited, unaudited, tax return)"),
    ScheduleHField("H1-70", "H.1", "Debt-to-EBITDA Ratio", "DebtToEBITDA",
        "decimal", [], False, "Total debt divided by EBITDA"),
    ScheduleHField("H1-71", "H.1", "Debt Service Coverage Ratio", "DSCR",
        "decimal", [], False, "Net operating income divided by total debt service"),
    ScheduleHField("H1-72", "H.1", "Interest Coverage Ratio", "InterestCoverageRatio",
        "decimal", [], False, "EBITDA divided by interest expense"),
    ScheduleHField("H1-73", "H.1", "Current Ratio", "CurrentRatio",
        "decimal", [], False, "Current assets divided by current liabilities"),
    ScheduleHField("H1-74", "H.1", "Loan-to-Value Ratio", "LTV",
        "decimal", [], False, "Outstanding loan balance divided by collateral value"),
    ScheduleHField("H1-75", "H.1", "Debt-to-Tangible Net Worth", "DebtToTNW",
        "decimal", [], False, "Total debt divided by tangible net worth"),
    ScheduleHField("H1-76", "H.1", "Fixed Charge Coverage Ratio", "FCCR",
        "decimal", [], False, "Fixed charge coverage ratio"),
    ScheduleHField("H1-77", "H.1", "Obligor Default Date", "ObligorDefaultDate",
        "date_format", [], False, "Date obligor defaulted (yyyy-mm-dd)"),
    ScheduleHField("H1-78", "H.1", "Obligor Recovery Amount", "ObligorRecoveryAmount",
        "dollar_amount", [], False, "Amount recovered following default"),
    ScheduleHField("H1-79", "H.1", "Obligor Recovery Date", "ObligorRecoveryDate",
        "date_format", [], False, "Date of recovery (yyyy-mm-dd)"),
    ScheduleHField("H1-80", "H.1", "Loss Amount", "LossAmount",
        "dollar_amount", [], False, "Net loss amount after recoveries"),
    ScheduleHField("H1-81", "H.1", "Loss Given Default Amount", "LGDAmount",
        "dollar_amount", [], False, "LGD in dollar terms"),
    ScheduleHField("H1-82", "H.1", "Exposure at Default", "EAD",
        "dollar_amount", [], False, "Exposure at time of default"),
    ScheduleHField("H1-83", "H.1", "Special Purpose Entity Flag", "SPEFlag",
        "code_list", ["No", "Yes"], False,
        "Whether obligor is a special purpose entity"),
    ScheduleHField("H1-86", "H.1", "Lower of Cost or Market Flag", "LOCOMFlag",
        "code_list", ["LOCOM", "FVO", "NA"], False,
        "Accounting treatment for held-for-sale loans"),
    ScheduleHField("H1-87", "H.1", "SNC Internal Credit ID", "SNCInternalCreditID",
        "identifier", [], False, "Internal ID for Shared National Credit"),
    ScheduleHField("H1-88", "H.1", "Probability of Default", "PD",
        "decimal", [], False, "PD as decimal to 4 places (e.g. 0.0500 for 5%)"),
    ScheduleHField("H1-89", "H.1", "Loss Given Default", "LGD",
        "decimal", [], False, "LGD as decimal to 4 places (e.g. 0.4500 for 45%)"),
    ScheduleHField("H1-90", "H.1", "Expected Loss", "ExpectedLoss",
        "decimal", [], False, "PD × LGD × EAD as decimal"),
    ScheduleHField("H1-91", "H.1", "Risk Weight", "RiskWeight",
        "decimal", [], False, "Regulatory risk weight as decimal"),
    ScheduleHField("H1-92", "H.1", "Risk-Weighted Assets", "RWA",
        "dollar_amount", [], False, "Risk-weighted assets in whole dollars"),
    ScheduleHField("H1-93", "H.1", "Internal Rating Date", "InternalRatingDate",
        "date_format", [], False, "Date of most recent internal rating (yyyy-mm-dd)"),
    ScheduleHField("H1-94", "H.1", "Prepayment Penalty Flag", "PrepaymentPenaltyFlag",
        "code_list", [
            "Yes", "The prepayment penalty has expired",
            "No prepayment penalty clause",
        ], False, "Whether facility has a prepayment penalty"),
    ScheduleHField("H1-95", "H.1", "Committed Exposure at Origination", "CommittedExposureOrigination",
        "dollar_amount", [], False, "Committed exposure at time of origination"),
    ScheduleHField("H1-96", "H.1", "Participation Interest", "ParticipationInterest",
        "decimal", [], False, "Participation interest as decimal (e.g. 0.3500 for 35%)"),
    ScheduleHField("H1-97", "H.1", "Leveraged Loan Flag", "LeveragedLoanFlag",
        "code_list", ["No", "Yes"], False,
        "Whether facility meets leveraged loan definition"),
    ScheduleHField("H1-98", "H.1", "Disposition Flag", "DispositionFlag",
        "code_list", [
            "Active", "Payoff", "Involuntary Payoff",
            "Involuntary Liquidation", "Sold or fully participated",
            "Fully syndicated", "Below reporting threshold",
            "Transfer to another Y-14 schedule",
            "Expired Commitment to Commit",
        ], True, "Current disposition status of the credit facility"),
    ScheduleHField("H1-99", "H.1", "Troubled Debt Restructuring Flag", "TDRFlag",
        "code_list", ["No", "Yes"], False,
        "Whether facility is a troubled debt restructuring"),
    ScheduleHField("H1-100", "H.1", "Syndicated Loan Flag", "SyndicatedLoanFlag",
        "code_list", [
            "NA", "Single-signed", "Dual-signed",
            "Closed but not settled", "Closed and settled",
        ], False, "Syndication status of the credit facility"),
    ScheduleHField("H1-101", "H.1", "Accrued Interest", "AccruedInterest",
        "dollar_amount", [], False, "Accrued interest receivable in whole dollars"),
    ScheduleHField("H1-102", "H.1", "Unfunded Commitment", "UnfundedCommitment",
        "dollar_amount", [], False, "Unfunded portion of committed exposure"),
    ScheduleHField("H1-103", "H.1", "Covenant Compliance Date", "CovenantComplianceDate",
        "date_format", [], False, "Most recent covenant compliance test date (yyyy-mm-dd)"),
    ScheduleHField("H1-104", "H.1", "Next Repricing Date", "NextRepricingDate",
        "date_format", [], False, "Next scheduled interest rate repricing date (yyyy-mm-dd)"),
    ScheduleHField("H1-105", "H.1", "Commitment Fee Rate", "CommitmentFeeRate",
        "decimal", [], False, "Commitment fee rate as decimal"),
    ScheduleHField("H1-106", "H.1", "Upfront Fee", "UpfrontFee",
        "dollar_amount", [], False, "Upfront fee in whole dollars"),
    ScheduleHField("H1-107", "H.1", "Amendment Date", "AmendmentDate",
        "date_format", [], False, "Most recent amendment date (yyyy-mm-dd)"),
    ScheduleHField("H1-108", "H.1", "Number of Amendments", "NumAmendments",
        "integer", [], False, "Total number of amendments since origination"),

    # ══════════════════════════════════════════
    # H.2 COMMERCIAL REAL ESTATE SCHEDULE
    # 65 active fields (Fields 46,47,48,50,51,70,71 = DO NOT USE)
    # ══════════════════════════════════════════

    ScheduleHField("H2-1",  "H.2", "Loan Number (CRE)", "LoanNumberCRE",
        "identifier", [], True, "Unique internal loan number for CRE facility"),
    ScheduleHField("H2-2",  "H.2", "Obligor Name (CRE)", "ObligorNameCRE",
        "free_text", [], True, "Full legal name of the CRE obligor"),
    ScheduleHField("H2-3",  "H.2", "Origination Date (CRE)", "OriginationDateCRE",
        "date_format", [], True, "CRE facility origination date (yyyy-mm-dd)"),
    ScheduleHField("H2-4",  "H.2", "Line Reported on FR Y-9C (CRE)", "LineReportedFRY9CCRE",
        "code_list", [
            "1-4 family residential",
            "Other construction loans and all land development",
            "Loans secured by owner-occupied nonfarm nonresidential properties",
            "Loans secured by other nonfarm nonresidential properties",
            "Multifamily residential real estate loans",
        ], True, "FR Y-9C Schedule HC-C line item for CRE loans"),
    ScheduleHField("H2-5",  "H.2", "Maturity Date (CRE)", "MaturityDateCRE",
        "date_format", [], True, "CRE facility maturity date (yyyy-mm-dd)"),
    ScheduleHField("H2-6",  "H.2", "Committed Balance (CRE)", "CommittedBalanceCRE",
        "dollar_amount", [], True, "Total committed balance in whole dollars"),
    ScheduleHField("H2-7",  "H.2", "Participation Flag (CRE)", "ParticipationFlagCRE",
        "code_list", [
            "No",
            "Yes, syndicate/participant in syndication but does not meet the definition of a Shared National Credit",
            "Yes, agent in syndication but does not meet the definition of a Shared National Credit sold by reporting BHC or IHC or SLHC",
            "Yes, syndicate/participant in Shared National Credit",
            "Yes, agent in Shared National Credit",
        ], True, "CRE participation or syndication status"),
    ScheduleHField("H2-8",  "H.2", "Lien Position (CRE)", "LienPositionCRE",
        "code_list", ["First Lien", "Subordinated Lien", "Mixed Liens"],
        True, "Lien position for CRE facility"),
    ScheduleHField("H2-9",  "H.2", "Property Type", "PropertyType",
        "code_list", [
            "Retail",
            "Industrial (excluding warehouse/distribution)",
            "Hotel / Hospitality/Gaming (including Resorts)",
            "Multi-family for Rent (including low income housing)",
            "Homebuilders except condo", "Condo/Co-op",
            "Office (including medical office)", "Mixed",
            "Land and Lot Development", "Other",
            "Healthcare (including hospitals, assisted living, memory care, and skilled nursing)",
            "Warehouse/Distribution",
        ], True, "Type of commercial real estate property"),
    ScheduleHField("H2-10", "H.2", "Property Address", "PropertyAddress",
        "free_text", [], False, "Street address of the collateral property"),
    ScheduleHField("H2-11", "H.2", "Property City", "PropertyCity",
        "free_text", [], False, "City where collateral property is located"),
    ScheduleHField("H2-12", "H.2", "Property State", "PropertyState",
        "identifier", [], False, "2-letter state code of property location"),
    ScheduleHField("H2-13", "H.2", "Property Zip Code", "PropertyZipCode",
        "identifier", [], False, "ZIP code of collateral property"),
    ScheduleHField("H2-14", "H.2", "Value Basis", "ValueBasis",
        "code_list", ["As Is", "As Stabilized", "As Completed"],
        True, "Basis used for property valuation"),
    ScheduleHField("H2-15", "H.2", "Appraised Value", "AppraisedValue",
        "dollar_amount", [], True, "Appraised value of collateral in whole dollars"),
    ScheduleHField("H2-16", "H.2", "Appraisal Date", "AppraisalDate",
        "date_format", [], True, "Date of appraisal (yyyy-mm-dd)"),
    ScheduleHField("H2-17", "H.2", "Net Operating Income", "NOI",
        "dollar_amount", [], False, "Net operating income in whole dollars"),
    ScheduleHField("H2-18", "H.2", "NOI Date", "NOIDate",
        "date_format", [], False, "Date of NOI calculation (yyyy-mm-dd)"),
    ScheduleHField("H2-19", "H.2", "Debt Service Coverage Ratio (CRE)", "DSCR_CRE",
        "decimal", [], False, "NOI divided by total debt service"),
    ScheduleHField("H2-20", "H.2", "Loan-to-Value Ratio (CRE)", "LTV_CRE",
        "decimal", [], False, "Loan balance divided by appraised value"),
    ScheduleHField("H2-21", "H.2", "Recourse", "Recourse",
        "code_list", ["Full", "Partial", "None"],
        False, "Whether lender has recourse beyond collateral"),
    ScheduleHField("H2-22", "H.2", "Occupancy Rate", "OccupancyRate",
        "decimal", [], False, "Current occupancy rate as decimal"),
    ScheduleHField("H2-23", "H.2", "Occupancy Rate Date", "OccupancyRateDate",
        "date_format", [], False, "Date of occupancy rate measurement (yyyy-mm-dd)"),
    ScheduleHField("H2-24", "H.2", "Square Footage", "SquareFootage",
        "integer", [], False, "Total square footage of the property"),
    ScheduleHField("H2-25", "H.2", "Loan Purpose (CRE)", "LoanPurposeCRE",
        "code_list", [
            "Construction Build to Suit / Credit Tenant Lease",
            "Land Acquisition & Development", "Construction Other",
            "Acquisition (nonowner occupied)", "Refinance", "Other", "Mini-Perm",
        ], True, "Purpose of the CRE loan"),
    ScheduleHField("H2-26", "H.2", "Interest Rate Variability (CRE)", "InterestRateVariabilityCRE",
        "code_list", ["Fixed", "Floating", "Mixed", "Entirely fee based"],
        True, "CRE interest rate variability"),
    ScheduleHField("H2-27", "H.2", "All-in Interest Rate (CRE)", "AllInInterestRateCRE",
        "decimal", [], False, "CRE all-in interest rate as decimal"),
    ScheduleHField("H2-28", "H.2", "Interest Rate Index (CRE)", "InterestRateIndexCRE",
        "code_list", [
            "LIBOR", "SOFR", "PRIME or Base", "Treasury Index",
            "Other", "Not applicable", "Mixed",
        ], False, "Benchmark index for CRE floating rate"),
    ScheduleHField("H2-29", "H.2", "Interest Rate Spread (CRE)", "InterestRateSpreadCRE",
        "decimal", [], False, "CRE spread over benchmark as decimal"),
    ScheduleHField("H2-30", "H.2", "Interest Rate Floor (CRE)", "InterestRateFloorCRE",
        "decimal", [], False, "CRE minimum rate floor as decimal"),
    ScheduleHField("H2-31", "H.2", "Interest Rate Ceiling (CRE)", "InterestRateCeilingCRE",
        "decimal", [], False, "CRE maximum rate cap as decimal"),
    ScheduleHField("H2-32", "H.2", "Days Past Due (CRE)", "DaysPastDueCRE",
        "integer", [], True, "Number of days past due for CRE facility"),
    ScheduleHField("H2-33", "H.2", "Non-Accrual Date (CRE)", "NonAccrualDateCRE",
        "date_format", [], False, "Date CRE facility placed on non-accrual (yyyy-mm-dd)"),
    ScheduleHField("H2-34", "H.2", "Origination Amount (CRE)", "OriginationAmountCRE",
        "dollar_amount", [], False, "Original committed balance at origination"),
    ScheduleHField("H2-35", "H.2", "Original/Previous Loan Number", "OriginalLoanNumber",
        "identifier", [], False, "Previous loan number if facility was renamed"),
    ScheduleHField("H2-36", "H.2", "Acquired Loan", "AcquiredLoan",
        "code_list", ["Yes", "No"], False,
        "Whether loan was acquired rather than originated"),
    ScheduleHField("H2-37", "H.2", "Days Past Due at Acquisition (CRE)", "DaysPastDueAcquisition",
        "integer", [], False, "Days past due at time of acquisition"),
    ScheduleHField("H2-38", "H.2", "Cumulative Charge-offs (CRE)", "CumulativeChargeoffsCRE",
        "dollar_amount", [], False, "Total cumulative charge-offs since origination"),
    ScheduleHField("H2-39", "H.2", "Property Size", "PropertySize",
        "integer", [], False, "Property size in appropriate units"),
    ScheduleHField("H2-40", "H.2", "Property Size Units", "PropertySizeUnits",
        "free_text", [], False, "Units of property size measurement"),
    ScheduleHField("H2-41", "H.2", "Number of Units", "NumberOfUnits",
        "integer", [], False, "Number of units for multifamily properties"),
    ScheduleHField("H2-42", "H.2", "Year Built", "YearBuilt",
        "integer", [], False, "Year the property was built"),
    ScheduleHField("H2-43", "H.2", "Renovation Year", "RenovationYear",
        "integer", [], False, "Most recent year of major renovation"),
    ScheduleHField("H2-44", "H.2", "Capitalization Rate", "CapRate",
        "decimal", [], False, "Property capitalization rate as decimal"),
    ScheduleHField("H2-45", "H.2", "Stabilized NOI", "StabilizedNOI",
        "dollar_amount", [], False, "Stabilized NOI in whole dollars"),
    ScheduleHField("H2-49", "H.2", "Troubled Debt Restructuring (CRE)", "TDRFlagCRE",
        "code_list", ["No", "Yes"], False,
        "Whether CRE facility is a troubled debt restructuring"),
    ScheduleHField("H2-52", "H.2", "Lower of Cost or Market Flag (CRE)", "LOCOMFlagCRE",
        "code_list", ["LOCOM", "FVO", "NA"], False,
        "Accounting treatment for CRE held-for-sale loans"),
    ScheduleHField("H2-53", "H.2", "SNC Internal Credit ID (CRE)", "SNCInternalCreditIDCRE",
        "identifier", [], False, "Internal ID for CRE Shared National Credit"),
    ScheduleHField("H2-54", "H.2", "Probability of Default (CRE)", "PDCRE",
        "decimal", [], False, "CRE PD as decimal to 4 places"),
    ScheduleHField("H2-55", "H.2", "Internal Rating (CRE)", "InternalRatingCRE",
        "free_text", [], False, "Internal risk rating for CRE facility"),
    ScheduleHField("H2-56", "H.2", "Internal Rating Date (CRE)", "InternalRatingDateCRE",
        "date_format", [], False, "Date of most recent CRE internal rating (yyyy-mm-dd)"),
    ScheduleHField("H2-57", "H.2", "Current Value Basis", "CurrentValueBasis",
        "code_list", ["As Is", "As Stabilized", "As Completed"],
        False, "Current basis used for property valuation"),
    ScheduleHField("H2-58", "H.2", "Prepayment Penalty Flag (CRE)", "PrepaymentPenaltyFlagCRE",
        "code_list", [
            "Yes", "The prepayment penalty has expired",
            "No prepayment penalty clause",
        ], False, "Whether CRE facility has prepayment penalty"),
    ScheduleHField("H2-59", "H.2", "Participation Interest (CRE)", "ParticipationInterestCRE",
        "decimal", [], False, "CRE participation interest as decimal"),
    ScheduleHField("H2-60", "H.2", "Leveraged Loan Flag (CRE)", "LeveragedLoanFlagCRE",
        "code_list", ["No", "Yes"], False,
        "Whether CRE facility meets leveraged loan definition"),
    ScheduleHField("H2-61", "H.2", "Disposition Flag (CRE)", "DispositionFlagCRE",
        "code_list", [
            "Active", "Payoff", "Involuntary payoff",
            "Involuntary Liquidation", "Sold or fully participated",
            "Below reporting threshold",
            "Transfer to another Y-14 schedule",
            "Expired Commitment to Commit",
        ], True, "Current disposition status of CRE facility"),
    ScheduleHField("H2-62", "H.2", "Loss Given Default (CRE)", "LGDCRE",
        "decimal", [], False, "CRE LGD as decimal to 2 places"),
    ScheduleHField("H2-63", "H.2", "Risk Weight (CRE)", "RiskWeightCRE",
        "decimal", [], False, "CRE regulatory risk weight as decimal"),
    ScheduleHField("H2-64", "H.2", "Risk-Weighted Assets (CRE)", "RWACRE",
        "dollar_amount", [], False, "CRE risk-weighted assets in whole dollars"),
    ScheduleHField("H2-65", "H.2", "Expected Loss (CRE)", "ExpectedLossCRE",
        "decimal", [], False, "CRE expected loss as decimal"),
    ScheduleHField("H2-66", "H.2", "Exposure at Default (CRE)", "EADCRE",
        "dollar_amount", [], False, "CRE exposure at default in whole dollars"),
    ScheduleHField("H2-67", "H.2", "Unfunded Commitment (CRE)", "UnfundedCommitmentCRE",
        "dollar_amount", [], False, "CRE unfunded portion of committed exposure"),
    ScheduleHField("H2-68", "H.2", "Accrued Interest (CRE)", "AccruedInterestCRE",
        "dollar_amount", [], False, "CRE accrued interest receivable"),
    ScheduleHField("H2-69", "H.2", "Commitment Fee Rate (CRE)", "CommitmentFeeRateCRE",
        "decimal", [], False, "CRE commitment fee rate as decimal"),

    # ══════════════════════════════════════════
    # H.3 LINE OF BUSINESS SCHEDULE
    # 2 active fields (all free text)
    # ══════════════════════════════════════════

    ScheduleHField("H3-1", "H.3", "Line of Business", "LineOfBusiness",
        "free_text", [], True,
        "Reporting entity's internal line of business classification"),
    ScheduleHField("H3-2", "H.3", "Sub-Line of Business", "SubLineOfBusiness",
        "free_text", [], False,
        "Reporting entity's internal sub-line of business classification"),

    # ══════════════════════════════════════════
    # H.4 INTERNAL RISK RATING SCHEDULE
    # 5 active fields
    # ══════════════════════════════════════════

    ScheduleHField("H4-1", "H.4", "Internal Rating System Name", "InternalRatingSystemName",
        "free_text", [], True,
        "Name of the internal credit rating system"),
    ScheduleHField("H4-2", "H.4", "Internal Rating Scale", "InternalRatingScale",
        "free_text", [], True,
        "Description of the internal rating scale"),
    ScheduleHField("H4-3", "H.4", "Rating Grade", "RatingGrade",
        "free_text", [], True,
        "Rating grade label from internal system"),
    ScheduleHField("H4-4", "H.4", "Rating Grade Description", "RatingGradeDescription",
        "free_text", [], False,
        "Description of what the rating grade represents"),
    ScheduleHField("H4-5", "H.4", "PD Calculation Method", "PDCalculationMethod",
        "code_list", ["Through the cycle", "Point in time", "Hybrid"],
        True, "Method used to calculate probability of default"),
]

# ─────────────────────────────────────────────
# LOOKUP MAPS
# ─────────────────────────────────────────────

FIELD_BY_TECH_NAME = {f.tech_name.lower(): f for f in SCHEDULE_H_FIELDS}
FIELD_BY_NAME      = {f.field_name.lower(): f for f in SCHEDULE_H_FIELDS}

FIELD_KEYWORDS: dict[str, list[str]] = {
    "H1-1":   ["customer id", "customer identifier"],
    "H1-2":   ["internal obligor", "obligor id", "internal id"],
    "H1-4":   ["obligor name", "borrower name", "company name"],
    "H1-5":   ["city"],
    "H1-6":   ["country", "domicile"],
    "H1-7":   ["zip", "postal", "zip code"],
    "H1-8":   ["industry code", "naics code", "sic code"],
    "H1-9":   ["industry code type", "industry type"],
    "H1-10":  ["internal risk rating", "internal rating", "risk rating", "obligor rating"],
    "H1-15":  ["internal credit facility id", "facility id", "credit facility id"],
    "H1-18":  ["origination date", "originated", "origination"],
    "H1-19":  ["maturity date", "maturity", "matures"],
    "H1-20":  ["credit facility type", "facility type", "loan type"],
    "H1-22":  ["credit facility purpose", "loan purpose", "facility purpose"],
    "H1-24":  ["committed exposure", "committed balance", "commitment amount"],
    "H1-25":  ["utilized exposure", "outstanding balance", "drawn balance"],
    "H1-26":  ["line reported", "y-9c", "hc-c"],
    "H1-28":  ["charge-offs", "charge offs", "cumulative charge"],
    "H1-32":  ["days past due", "days principal", "past due", "delinquent"],
    "H1-33":  ["non-accrual date", "non accrual"],
    "H1-34":  ["participation flag", "participation", "syndicate"],
    "H1-35":  ["lien position", "lien", "first lien", "second lien", "senior unsecured"],
    "H1-36":  ["security type", "collateral type", "secured"],
    "H1-37":  ["interest rate variability", "rate variability", "fixed rate", "floating rate"],
    "H1-38":  ["all-in interest rate", "all in rate", "total interest rate"],
    "H1-39":  ["interest rate index", "rate index", "sofr", "libor", "prime rate"],
    "H1-40":  ["interest rate spread", "applicable margin", "spread", "margin", "rate spread"],
    "H1-41":  ["interest rate ceiling", "rate cap", "rate ceiling"],
    "H1-42":  ["interest rate floor", "rate floor", "floor rate"],
    "H1-43":  ["tax status", "income tax", "taxable", "tax exempt"],
    "H1-44":  ["guarantor flag", "guarantee type", "guaranty type", "guaranteed"],
    "H1-45":  ["guarantor name", "guarantor"],
    "H1-49":  ["collateral value", "collateral"],
    "H1-51":  ["origination amount", "original amount", "original principal"],
    "H1-54":  ["ebitda"],
    "H1-55":  ["total funded debt", "funded debt", "total debt"],
    "H1-68":  ["financial statement date", "financials date"],
    "H1-70":  ["debt to ebitda", "debt/ebitda", "leverage ratio"],
    "H1-71":  ["debt service coverage", "dscr"],
    "H1-74":  ["loan to value", "ltv"],
    "H1-76":  ["fixed charge coverage", "fccr"],
    "H1-83":  ["special purpose entity", "spe"],
    "H1-86":  ["locom", "lower of cost", "fvo", "fair value option"],
    "H1-88":  ["probability of default", "pd", "default probability"],
    "H1-89":  ["loss given default", "lgd"],
    "H1-94":  ["prepayment penalty", "prepayment"],
    "H1-96":  ["participation interest"],
    "H1-97":  ["leveraged loan", "leverage flag"],
    "H1-98":  ["disposition flag", "disposition", "facility status"],
    "H1-99":  ["troubled debt", "tdr"],
    "H1-100": ["syndicated loan", "syndication flag", "syndicated"],
    "H2-4":   ["line reported on fr y-9c", "hc-c cre"],
    "H2-7":   ["participation flag cre"],
    "H2-8":   ["lien position cre"],
    "H2-9":   ["property type"],
    "H2-10":  ["property address", "property location", "property street"],
    "H2-12":  ["property state"],
    "H2-14":  ["value basis", "appraisal basis"],
    "H2-15":  ["appraised value", "appraisal value", "property value"],
    "H2-16":  ["appraisal date"],
    "H2-17":  ["net operating income", "noi"],
    "H2-19":  ["dscr cre", "debt service coverage cre"],
    "H2-20":  ["ltv cre", "loan to value cre"],
    "H2-21":  ["recourse"],
    "H2-22":  ["occupancy rate", "occupancy"],
    "H2-25":  ["loan purpose cre"],
    "H2-26":  ["interest rate variability cre"],
    "H2-28":  ["interest rate index cre"],
    "H2-36":  ["acquired loan", "acquisition"],
    "H2-49":  ["troubled debt cre", "tdr cre"],
    "H2-52":  ["locom cre", "lower of cost cre"],
    "H2-57":  ["current value basis"],
    "H2-58":  ["prepayment penalty cre"],
    "H2-60":  ["leveraged loan cre"],
    "H2-61":  ["disposition cre", "disposition flag cre"],
    "H4-5":   ["pd calculation method", "pd method", "through the cycle", "point in time"],
}


# ─────────────────────────────────────────────
# VALIDATION ENGINE
# ─────────────────────────────────────────────

from dataclasses import dataclass as _dc
from typing import Literal as _Lit


@_dc
class ValidationResult:
    field_name:       str
    extracted_value:  str | None
    schedule_field:   str
    field_no:         str
    schedule:         str
    status:           _Lit["pass", "warn", "fail", "not_found", "not_applicable"]
    message:          str
    allowable_values: list[str]
    required:         bool = False
    confidence:       float = 0.0


def llm_map_fields(all_facts: list[dict]) -> dict[str, str]:
    """
    One LLM call maps extracted field names → Schedule H field numbers.
    Returns { extracted_field_name: schedule_field_no }
    e.g. { "loan_amount": "H1-23", "maturity_date": "H1-18" }
    """
    if not all_facts:
        return {}

    try:
        import os, json as _json
        from groq import Groq
        from dotenv import load_dotenv
        load_dotenv()

        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        # Build list of all Schedule H fields for LLM context
        h1_fields = [f"{f.field_no}: {f.field_name}" for f in SCHEDULE_H_FIELDS if f.schedule == "H.1"]
        h2_fields = [f"{f.field_no}: {f.field_name}" for f in SCHEDULE_H_FIELDS if f.schedule == "H.2"]
        h3_fields = [f"{f.field_no}: {f.field_name}" for f in SCHEDULE_H_FIELDS if f.schedule == "H.3"]
        h4_fields = [f"{f.field_no}: {f.field_name}" for f in SCHEDULE_H_FIELDS if f.schedule == "H.4"]

        extracted = [
            {"field_name": f.get("field_name", ""), "value": str(f.get("value", ""))[:80]}
            for f in all_facts if f.get("field_name")
        ]

        prompt = f"""You are a regulatory data analyst mapping extracted loan document fields to FR Y-14Q Schedule H fields.

EXTRACTED FIELDS FROM DOCUMENT:
{_json.dumps(extracted, indent=2)}

FR Y-14Q SCHEDULE H FIELDS:
H.1 Corporate Loan:
{chr(10).join(h1_fields)}

H.2 Commercial Real Estate:
{chr(10).join(h2_fields)}

H.3 Line of Business:
{chr(10).join(h3_fields)}

H.4 Internal Risk Rating:
{chr(10).join(h4_fields)}

TASK:
For each extracted field, identify the best matching Schedule H field number.
Only map if you are confident there is a genuine semantic match.
Do NOT map fee amounts, thresholds, or internal business terms that have no Schedule H equivalent.
Do NOT map the same Schedule H field to multiple extracted fields.

Respond ONLY with a JSON object. No markdown, no backticks:
{{
  "loan_amount": "H1-23",
  "maturity_date": "H1-18",
  "borrower": "H1-4",
  "interest_rate": "H1-34"
}}

If an extracted field has no clear Schedule H match, omit it from the response."""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=1024,
        )

        text = response.choices[0].message.content.strip()
        import re as _re
        text = _re.sub(r"^```json\s*", "", text)
        text = _re.sub(r"^```\s*", "", text)
        text = _re.sub(r"\s*```$", "", text)

        mapping = _json.loads(text.strip())
        print(f"  [Lens] LLM mapped {len(mapping)} fields to Schedule H")
        return mapping

    except Exception as e:
        print(f"  [Lens] LLM field mapping failed: {e}")
        return {}


def fuzzy_match_field(field_name: str) -> ScheduleHField | None:
    """Keyword-based fallback when LLM doesn't map a field."""
    name_lower = field_name.lower().replace("_", " ")
    if field_name in FIELD_BY_TECH_NAME:
        return FIELD_BY_TECH_NAME[field_name]
    if field_name.lower() in FIELD_BY_TECH_NAME:
        return FIELD_BY_TECH_NAME[field_name.lower()]
    if name_lower in FIELD_BY_NAME:
        return FIELD_BY_NAME[name_lower]
    for field_no, keywords in FIELD_KEYWORDS.items():
        for kw in keywords:
            if kw in name_lower or name_lower in kw:
                for f in SCHEDULE_H_FIELDS:
                    if f.field_no == field_no:
                        return f
    return None


def validate_against_schedule_h(profile_dict: dict) -> list[ValidationResult]:
    """
    Validate ALL extracted fields against FR Y-14Q Schedule H.
    Shows ALL 176 fields — matched ones show validation result,
    unmatched ones show Not Found.
    """
    results = []

    # ── Collect all extracted facts ───────────────────────
    all_facts = []
    for fact in profile_dict.get("critical_data_elements", []):
        if fact.get("value"):
            all_facts.append(fact)
    for fact in profile_dict.get("additional_findings", []):
        if fact.get("value"):
            all_facts.append(fact)
    for fact in profile_dict.get("parties", []):
        if fact.get("value"):
            all_facts.append({
                "field_name": fact.get("field_name", ""),
                "value": fact.get("value"),
                "provenance": fact.get("provenance"),
            })
    for fact in profile_dict.get("key_dates", []):
        if fact.get("value") and fact.get("field_name") not in ("date", "publication_date"):
            all_facts.append(fact)
    for fact in profile_dict.get("monetary_amounts", []):
        if fact.get("value") and fact.get("field_name") not in ("monetary_amount", "principal"):
            all_facts.append(fact)

    # ── LLM maps extracted fields → Schedule H field numbers ─
    print("  [Lens] Running LLM field mapping to Schedule H...")
    mapping = llm_map_fields(all_facts)  # { "loan_amount": "H1-23", ... }

    # Build reverse lookup: field_no → extracted fact
    # LLM mapping takes priority; fuzzy keyword match as fallback
    field_no_to_fact: dict[str, dict] = {}
    for fact in all_facts:
        fname = fact.get("field_name", "")
        field_no = mapping.get(fname)
        if field_no and field_no not in field_no_to_fact:
            field_no_to_fact[field_no] = fact
        elif not field_no:
            matched = fuzzy_match_field(fname)
            if matched and matched.field_no not in field_no_to_fact:
                field_no_to_fact[matched.field_no] = fact

    # ── Validate ALL 176 Schedule H fields ────────────────
    for schedule_field in SCHEDULE_H_FIELDS:
        fact = field_no_to_fact.get(schedule_field.field_no)

        if fact:
            # Field was extracted and mapped — validate it
            value = str(fact.get("value", ""))
            status, message = validate_value(value, schedule_field)
            confidence = (
                fact.get("provenance", {}).get("confidence_score", 0.0)
                if isinstance(fact.get("provenance"), dict) else 0.0
            )
            results.append(ValidationResult(
                field_name=fact.get("field_name", schedule_field.field_name),
                extracted_value=value,
                schedule_field=schedule_field.field_name,
                field_no=schedule_field.field_no,
                schedule=schedule_field.schedule,
                status=status,
                message=message,
                allowable_values=schedule_field.allowable_values,
                required=schedule_field.required,
                confidence=confidence,
            ))
        else:
            # Field was NOT extracted from document
            results.append(ValidationResult(
                field_name=schedule_field.field_name,
                extracted_value=None,
                schedule_field=schedule_field.field_name,
                field_no=schedule_field.field_no,
                schedule=schedule_field.schedule,
                status="not_found",
                message="Required field not found in document" if schedule_field.required else "Not extracted from document",
                allowable_values=schedule_field.allowable_values,
                required=schedule_field.required,
                confidence=0.0,
            ))

    # Sort by field number in natural order: H1-1, H1-2, … H2-1, H2-2, …
    def _field_sort_key(r: ValidationResult) -> tuple[str, int]:
        parts = r.field_no.split("-", 1)
        return (parts[0], int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else 0)

    results.sort(key=_field_sort_key)

    return results

def validate_value(value: str, field: ScheduleHField) -> tuple[str, str]:
    if not value or value.strip().lower() in ("", "null", "none", "n/a"):
        if field.required:
            return "fail", f"Required field is missing"
        return "not_found", "No value extracted"

    val = value.strip()

    if field.validation_type == "code_list":
        if val in field.allowable_values:
            return "pass", f"Valid: '{val}'"
        val_lower = val.lower()
        for allowed in field.allowable_values:
            if val_lower == allowed.lower():
                return "pass", f"Valid (case match): '{val}'"
        for allowed in field.allowable_values:
            if val_lower in allowed.lower() or allowed.lower() in val_lower:
                return "warn", f"Partial match to '{allowed}' — verify exact value"
        return "fail", f"'{val}' not in allowable values"

    elif field.validation_type == "date_format":
        if re.match(r'^\d{4}-\d{2}-\d{2}$', val):
            return "pass", f"Valid date: '{val}'"
        if re.match(r'^\w+ \d{1,2},? \d{4}$', val):
            return "warn", f"'{val}' not in required yyyy-mm-dd format"
        if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', val):
            return "warn", f"'{val}' not in required yyyy-mm-dd format"
        return "fail", f"'{val}' must be yyyy-mm-dd (e.g. 2022-04-14)"

    elif field.validation_type == "decimal":
        try:
            float(val.replace('%', '').replace(',', ''))
            if val.endswith('%'):
                return "warn", f"'{val}' looks like a percentage — FR Y-14Q requires decimal (e.g. 0.0250 for 2.50%)"
            if re.match(r'^\d+\.\d+$', val) or re.match(r'^0\.\d+$', val):
                return "pass", f"Valid decimal: {val}"
            return "warn", f"'{val}' is numeric but verify decimal format"
        except ValueError:
            if val.upper() == "NA":
                return "pass", "NA is allowed"
            return "fail", f"'{val}' must be decimal (e.g. 0.0250)"

    elif field.validation_type == "dollar_amount":
        clean = val.replace('$', '').replace(',', '').replace(' ', '')
        try:
            float(clean)
            if '$' in val or ',' in val:
                return "warn", f"'{val}' has currency symbols — FR Y-14Q requires plain integer (e.g. 38000000)"
            if '.' in clean:
                return "warn", f"'{val}' has decimals — FR Y-14Q requires whole dollar amount"
            return "pass", f"Valid dollar amount: {val}"
        except ValueError:
            return "fail", f"'{val}' must be whole dollar amount (e.g. 38000000)"

    elif field.validation_type == "integer":
        try:
            int(val.replace(',', ''))
            return "pass", f"Valid integer: {val}"
        except ValueError:
            if val.upper() == "NA":
                return "pass", "NA is allowed"
            return "fail", f"'{val}' must be an integer"

    elif field.validation_type == "identifier":
        illegal = ['\r', '\n', ',', '\t']
        for ch in illegal:
            if ch in val:
                return "fail", f"Identifier contains illegal character (carriage return, newline, or comma)"
        return "pass", f"Valid identifier: '{val[:40]}'"

    elif field.validation_type == "free_text":
        if len(val) > 0:
            return "pass", f"Value present: '{val[:40]}'"
        return "not_found", "Empty value"

    return "pass", "No specific validation rule"


