import unittest

from receipt import receipt_lines, shipping_fee


class ReceiptTests(unittest.TestCase):
    def test_a_55_dollar_order_ships_free(self):
        self.assertEqual(shipping_fee(55.00), 0)

    def test_a_small_order_pays_for_shipping(self):
        self.assertEqual(shipping_fee(24.00), 5.99)

    def test_the_receipt_adds_up(self):
        lines = receipt_lines(55.00, 5.50, 3.96)
        self.assertEqual(lines[-1], ("Total", 53.46))


if __name__ == "__main__":
    unittest.main()
