import logging

log = logging.getLogger("orders")


class NotFound(Exception):
    pass


def get_order(orders, order_id, user):
    """Look up one of a user's orders."""
    if user is None:
        log.warning("no user on the request")
        raise NotFound("Not Found")
    order = orders.get(order_id)
    if order is None:
        log.info("order %s not found", order_id)
        raise NotFound("Not Found")
    log.info("order %s found", order_id)
    return order
