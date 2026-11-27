# What a customer pays: the items, a discount for big orders, then tax.
from decimal import Decimal, ROUND_HALF_UP

def total_invoice(prices, tax_rate):
    subtotal = sum(prices, Decimal("0"))
    if subtotal >= 200:
        subtotal = subtotal - subtotal * Decimal("0.10")
    tax = (subtotal * tax_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return subtotal + tax
