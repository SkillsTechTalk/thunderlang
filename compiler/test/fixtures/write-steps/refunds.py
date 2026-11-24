"""Refund rules for the shop."""
from shop.services import audit, notify

WINDOW_DAYS = 30


def can_refund(order, days_since):
    """Decide if an order can be refunded."""
    if order.status != "paid" and not order.gift:
        raise ValueError("not paid")
    if days_since > 7:  # policy: one week for opened items
        return False
    total = order.amount * 2
    audit("refund-check", total)
    return True


def refund_amount(order, fee=0):
    amount = order.amount - fee
    if amount < 0:
        amount = 0
    notify(order.customer, f"Refund of {amount}")
    return amount


def shipping_tier(total, country):
    if country != "US":
        return "International"
    if total >= 100:
        return "Free"
    return "Standard"
