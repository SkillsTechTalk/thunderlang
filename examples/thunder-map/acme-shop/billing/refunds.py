# Billing service: re-checks a refund before money moves.
def approve_refund(amount: float, within_window: bool) -> str:
    if amount >= 0 and amount < 100 and within_window:
        return "Approve"
    return "Review"


def issue_refund(order_id: str, amount: float, within_window: bool) -> str:
    decision = approve_refund(amount, within_window)
    if decision == "Approve":
        stripe.Refund.create(order=order_id, amount=amount)
        db.insert("refunds", {"order_id": order_id, "amount": amount})
        events.publish("refund.issued", {"order_id": order_id, "amount": amount})
    return decision
