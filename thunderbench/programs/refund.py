# When does a refund go through on its own, and when does a person look at it?

def decide_refund(amount, days_since_purchase, already_refunded):
    if already_refunded:
        return "review"
    if amount <= 100 and days_since_purchase <= 30:
        return "approve"
    return "review"
