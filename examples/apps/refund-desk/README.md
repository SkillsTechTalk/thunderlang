# Refund Desk

A small shop's back office, written in Thunder™: products and their stock, orders, and refunds decided by one rule.
It is ThunderLang's reference application, built only from features that have shipped, and it runs the same on
Python, TypeScript, and the Thunder engine.

```
thunder run examples/apps/refund-desk                       # answers on http://127.0.0.1:8080
thunder run examples/apps/refund-desk --engine thunder      # no Python needed
thunder run examples/apps/refund-desk --target typescript   # compiled to TypeScript
thunder test examples/apps/refund-desk                      # the rule and every endpoint, no network
```

## What it does

| Request | Does | Answers |
|---|---|---|
| `GET /products` | lists the products | 200 |
| `POST /products` with `code`, `name`, `price`, `stock` | adds a product | 201, or 409 if the code is taken |
| `POST /orders` with `code`, `quantity` | takes stock and makes an order | 201, 404 for an unknown product, 409 when stock is short |
| `GET /orders/{number}` | one order, with how much is refunded | 200, or 404 |
| `POST /orders/{number}/refunds` with `amount` | decides the refund and records it | 201 with the decision |
| `GET /refunds` | every decision so far | 200 |

**The refund rule** (`decide refund` in `src/desk.thunder`): more than what is left of the order is refused; $100 or
more goes to a person for review; anything else is approved, and counts against the order. The decision is an
either/or value, so each answer carries only its own fields:

```json
{"which":"approved","order_number":1,"amount":"40.00"}
{"which":"review","order_number":1,"amount":"120.00","reason":"Refunds of $100.00 or more are checked by a person."}
{"which":"refused","order_number":1,"reason":"Only $210.00 of order 1 can still be refunded."}
```

Data is saved in `data/products.json`, `data/orders.json`, and `data/refunds.json` after each request that finishes
well. Money and numbers are exact text (`"250.00"`), so the files and the answers mean the same everywhere.

## Try it

```
thunder run examples/apps/refund-desk
curl -X POST localhost:8080/products -d '{"code":"DESK","name":"Desk","price":"250.00","stock":1}'
curl -X POST localhost:8080/orders -d '{"code":"DESK","quantity":1}'
curl -X POST localhost:8080/orders/1/refunds -d '{"amount":"120"}'
```

## What building it showed

A reference app is meant to find what is missing. These were found and fixed while writing it:

- A `Stop … and status 404` can be written in a helper (`find order`), not only in an endpoint.
- Tests in `tests/` can call the endpoints in `src/` (`calling GET /orders/9`).
- When `src/` has problems, Thunder reports those and does not also report the tests as full of unknown names.
- `orders where number is number` kept every order (inside `where`, `number` is each order's field). That is now a
  problem the checker reports (TC219), with the fix.
- JSON for an either/or value carries only its alternative's fields, and a request may name a two-word input the
  way answers do (`order_number`).

Still missing, so not in this app yet: sign-in, screens that call the API (the React target has no HTTP yet), and
date arithmetic (days between two dates), which a habit or booking app would need.
