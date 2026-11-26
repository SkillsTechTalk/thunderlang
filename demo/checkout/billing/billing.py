"""Billing for Lumen Supply (a made-up shop): charge a customer through the payment provider, and record each payment."""

import threading
import time
from dataclasses import dataclass


@dataclass
class Payment:
    payment_id: str
    order_ref: str
    amount_cents: int
    status: str


class FakeProvider:
    """Stands in for a card processor. A delay makes it slow, so a caller can give up while the charge still happens."""

    def __init__(self, delay_seconds=0.0):
        self.delay_seconds = delay_seconds
        self.charges = []

    def charge(self, order_ref, amount_cents):
        time.sleep(self.delay_seconds)
        charge_id = f"ch_{len(self.charges) + 1}"
        self.charges.append((charge_id, order_ref, amount_cents))
        return charge_id


class Billing:
    def __init__(self, provider):
        self.provider = provider
        self.payments = []
        self.by_key = {}
        self.lock = threading.Lock()

    def charge(self, order_ref, amount_cents, idempotency_key):
        """Charge the customer once per idempotency key: asking again with the same key gives back the first payment."""
        if amount_cents <= 0:
            raise ValueError("The amount to charge must be more than zero")
        if not idempotency_key:
            raise ValueError("A charge needs an idempotency key, so a retry is never charged twice")
        with self.lock:
            first = self.by_key.get(idempotency_key)
            if first is not None:
                if first.amount_cents != amount_cents:
                    raise ValueError("This idempotency key was already used for a different amount")
                return first
            charge_id = self.provider.charge(order_ref, amount_cents)
            payment = Payment(charge_id, order_ref, amount_cents, "charged")
            self.payments.append(payment)
            self.by_key[idempotency_key] = payment
            return payment

    def charged_total(self):
        return sum(p.amount_cents for p in self.payments if p.status == "charged")
