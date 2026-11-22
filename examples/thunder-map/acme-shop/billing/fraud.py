# Billing service: flags risky refunds.
def fraud_risk(amount: float, refunds_this_month: int) -> str:
    if amount > 500:
        return "High"
    if refunds_this_month >= 3:
        return "High"
    return "Low"
