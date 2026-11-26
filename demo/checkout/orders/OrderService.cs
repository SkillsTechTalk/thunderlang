using System.Collections.Concurrent;

namespace Lumen.Orders;

public record OrderRequest(List<LineItem> Items, string? Coupon, string? IdempotencyKey = null);

public record OrderResult(bool Placed, string Message, string? OrderId = null, decimal Total = 0m, string? PaymentId = null);

/// <summary>Placing an order: check the shelf, hold the items, work out the price, charge, and record it.</summary>
public class OrderService(Inventory inventory, IBilling billing)
{
    private readonly List<OrderResult> _orders = new();
    private readonly ConcurrentDictionary<string, Lazy<Task<OrderResult>>> _byKey = new();
    private int _next = 1000;

    public IReadOnlyList<OrderResult> Orders { get { lock (_orders) return _orders.ToList(); } }

    /// <summary>The same idempotency key is the same order: a retry gets the first answer, even while it is still running.</summary>
    public Task<OrderResult> PlaceOrderAsync(OrderRequest request)
    {
        if (string.IsNullOrEmpty(request.IdempotencyKey))
        {
            return Task.FromResult(new OrderResult(false, "An order needs an idempotency key, so a retry is never charged twice"));
        }
        return _byKey.GetOrAdd(request.IdempotencyKey, _ => new Lazy<Task<OrderResult>>(() => PlaceNewOrderAsync(request))).Value;
    }

    private async Task<OrderResult> PlaceNewOrderAsync(OrderRequest request)
    {
        if (request.Items.Count == 0)
        {
            return new OrderResult(false, "The cart is empty");
        }
        if (request.Items.Any(i => !Pricing.UnitPrices.ContainsKey(i.Sku)))
        {
            return new OrderResult(false, "Something in the cart is not sold here");
        }
        if (!inventory.Reserve(request.Items))
        {
            return new OrderResult(false, "Not enough stock for this order");
        }
        var price = Pricing.PriceOf(request.Items, request.Coupon);
        var orderId = $"ord-{Interlocked.Increment(ref _next)}";
        var payment = await billing.ChargeAsync(orderId, (long)(price.Total * 100), request.IdempotencyKey!);
        var order = new OrderResult(true, "Order placed", orderId, price.Total, payment.PaymentId);
        lock (_orders) _orders.Add(order);
        return order;
    }
}
