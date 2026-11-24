from shop import delivery_fee, discount, take, OutOfStock, count_big, safe_ratio, label, describe, remember


def test_fees():
    assert delivery_fee(3, True) == 0
    assert delivery_fee(3, False) == 2.5
    assert delivery_fee(12, False) == 5
    assert delivery_fee(30, False) == 10


def test_discount():
    assert discount(10, "") == 10
    assert discount(10, "HALF") == 5
    assert discount(0.5, "OTHER") == 0


def test_take():
    assert take(5, 2) == 3
    try:
        take(1, 2)
    except OutOfStock:
        pass


def test_others():
    assert count_big([1, 20, 30]) == 2
    assert safe_ratio(1, 0) == 0
    assert label(-1) == "negative"
    assert describe("b") == "second"
    items = ["a"]
    remember(items, "a")
    remember(items, "b")
