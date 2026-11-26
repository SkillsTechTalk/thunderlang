import threading
import unittest

from billing import Billing, FakeProvider


class BillingTests(unittest.TestCase):
    def test_a_charge_is_recorded(self):
        billing = Billing(FakeProvider())
        payment = billing.charge("cart-1", 5400)
        self.assertEqual(payment.status, "charged")
        self.assertEqual(billing.charged_total(), 5400)

    def test_nothing_is_charged_for_zero(self):
        billing = Billing(FakeProvider())
        with self.assertRaises(ValueError):
            billing.charge("cart-1", 0)
        self.assertEqual(billing.payments, [])

    @unittest.expectedFailure  # Known bug: a retried charge request charges the customer again.
    def test_a_retried_charge_is_charged_once(self):
        provider = FakeProvider(delay_seconds=0.2)
        billing = Billing(provider)
        first = threading.Thread(target=billing.charge, args=("cart-1", 5400))
        first.start()
        billing.charge("cart-1", 5400)  # the caller gave up waiting and asked again
        first.join()
        self.assertEqual(len(provider.charges), 1)


if __name__ == "__main__":
    unittest.main()
