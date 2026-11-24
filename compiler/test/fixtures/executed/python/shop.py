"""A small shop: fees, discounts, and stock, with known paths for proof by running."""


class OutOfStock(Exception):
    pass


def delivery_fee(distance_km: float, is_member: bool) -> float:
    if is_member:
        return 0
    if distance_km <= 5:
        return 2.5
    elif distance_km <= 20:
        return 5
    return 10


def discount(total: float, code: str) -> float:
    if not code:
        return total
    if code == "HALF":
        total = total / 2
    else:
        total = total - 1
    if total < 0:
        total = 0
    return total


def take(stock: int, wanted: int) -> int:
    if wanted > stock:
        raise OutOfStock("not enough left")
    return stock - wanted


def count_big(values: list) -> int:
    count = 0
    for v in values:
        if v > 10:
            count += 1
    return count


def countdown(n: int) -> int:
    steps = 0
    while n > 0:
        n -= 1
        steps += 1
    return steps


def safe_ratio(a: float, b: float) -> float:
    try:
        result = a / b
    except ZeroDivisionError:
        result = 0
    return result


def label(n: int) -> str:
    if n < 0: return "negative"
    return "positive or zero"


def describe(kind: str) -> str:
    match kind:
        case "a":
            return "first"
        case "b":
            return "second"
        case _:
            return "other"


def remember(items: list, item: str) -> None:
    if item in items:
        return
    items.append(item)
