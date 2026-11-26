import threading
import unittest

from billing import Billing, FakeProvider


class BillingTests(unittest.TestCase):
    def test_a_charge_is_recorded(self):
        billing = Billing(FakeProvider())
        payment = billing.charge("cart-1", 5400, "key-1")
        self.assertEqual(payment.status, "charged")
        self.assertEqual(billing.charged_total(), 5400)

    def test_nothing_is_charged_for_zero(self):
        billing = Billing(FakeProvider())
        with self.assertRaises(ValueError):
            billing.charge("cart-1", 0, "key-1")
        self.assertEqual(billing.payments, [])

    def test_a_retried_charge_is_charged_once(self):
        provider = FakeProvider(delay_seconds=0.2)
        billing = Billing(provider)
        first = threading.Thread(target=billing.charge, args=("cart-1", 5400, "key-1"))
        first.start()
        again = billing.charge("cart-1", 5400, "key-1")  # the caller gave up waiting and asked again
        first.join()
        self.assertEqual(len(provider.charges), 1)
        self.assertEqual(again.payment_id, "ch_1")

    def test_a_key_used_for_another_amount_is_refused(self):
        billing = Billing(FakeProvider())
        billing.charge("cart-1", 5400, "key-1")
        with self.assertRaises(ValueError):
            billing.charge("cart-1", 9900, "key-1")
        self.assertEqual(billing.charged_total(), 5400)

    def test_a_charge_without_a_key_is_refused(self):
        billing = Billing(FakeProvider())
        with self.assertRaises(ValueError):
            billing.charge("cart-1", 5400, None)
        self.assertEqual(billing.payments, [])


if __name__ == "__main__":
    unittest.main()
