"""The lines on a Lumen Supply receipt. Shipping follows the same rule the orders service charges by
(orders/Shipping.cs) and the cart page shows (web/shipping.ts): three copies of one rule."""


def shipping_fee(subtotal):
    """Shipping on the receipt: free for larger orders."""
    if subtotal >= 50:
        return 0
    return 5.99


def receipt_lines(subtotal, discount, tax):
    """Each line of the receipt as (label, amount), ending with the total."""
    shipping = shipping_fee(subtotal)
    lines = [("Items", subtotal)]
    if discount:
        lines.append(("Coupon", -discount))
    lines.append(("Shipping", shipping))
    lines.append(("Tax", tax))
    lines.append(("Total", round(subtotal - discount + shipping + tax, 2)))
    return lines
