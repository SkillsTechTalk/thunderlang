-- Where an order is in its life.
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled');

-- People who buy from the shop.
CREATE TABLE customers (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One purchase by one customer.
CREATE TABLE orders (
    id           SERIAL PRIMARY KEY,
    customer_id  INTEGER NOT NULL REFERENCES customers(id),
    status       order_status NOT NULL DEFAULT 'pending',
    total        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount     NUMERIC(10, 2) DEFAULT 0,
    CONSTRAINT total_not_negative CHECK (total >= 0),
    CHECK (discount <= total)
);

-- Paid orders from the last 30 days, biggest first.
CREATE VIEW recent_big_orders AS
SELECT o.id, c.name AS customer_name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'paid' AND o.total >= 100
ORDER BY o.total DESC
LIMIT 20;

-- Marks an order as paid, if it can be.
CREATE OR REPLACE FUNCTION pay_order(p_order_id INTEGER, p_amount NUMERIC)
RETURNS TEXT AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT total INTO v_total FROM orders WHERE id = p_order_id;
    IF v_total IS NULL THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id;
    ELSIF p_amount < v_total THEN
        RAISE EXCEPTION 'Not enough money';
    END IF;
    UPDATE orders SET status = 'paid' WHERE id = p_order_id;
    INSERT INTO payments (order_id, amount) VALUES (p_order_id, p_amount);
    RETURN 'paid';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_audit AFTER INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION log_order_change();
