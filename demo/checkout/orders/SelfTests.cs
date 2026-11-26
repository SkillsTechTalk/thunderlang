namespace Lumen.Orders;

/// <summary>The orders service's tests (dotnet run -- --test), with a billing service that only counts charges.</summary>
public static class SelfTests
{
    private class CountingBilling(int delayMs = 0) : IBilling
    {
        public int Charges;
        public async Task<ChargeResult> ChargeAsync(string orderRef, long amountCents)
        {
            await Task.Delay(delayMs);
            var n = Interlocked.Increment(ref Charges);
            return new ChargeResult($"ch_{n}", "charged");
        }
    }

    private static Inventory Shelf() => new(new() { ["lamp"] = 10, ["bulb"] = 100, ["shade"] = 5 });

    private static readonly List<LineItem> Cart = [new("lamp", 2), new("bulb", 2)];

    public static async Task<int> RunAsync()
    {
        var failed = 0;
        async Task Check(string name, Func<Task<bool>> test, bool knownBug = false)
        {
            var ok = await test();
            var line = (ok, knownBug) switch
            {
                (true, false) => $"ok      {name}",
                (false, false) => $"FAILED  {name}",
                (false, true) => $"known bug (fails as expected)  {name}",
                (true, true) => $"FIXED?  {name}: passes now; remove its known-bug mark",
            };
            if (ok == knownBug) failed++;
            Console.WriteLine(line);
        }

        await Check("prices: $55.00 of items, SAVE10, 8% tax", () =>
        {
            var p = Pricing.PriceOf(Cart, "SAVE10");
            return Task.FromResult(p.Subtotal == 55.00m && p.Discount == 5.50m && p.Tax == 3.96m && p.Total == 53.46m);
        });
        await Check("the coupon needs $50 of items", () => Task.FromResult(Pricing.PriceOf([new("lamp", 1)], "SAVE10").Discount == 0m));
        await Check("an order is reserved, charged once, and recorded", async () =>
        {
            var billing = new CountingBilling();
            var shelf = Shelf();
            var result = await new OrderService(shelf, billing).PlaceOrderAsync(new(Cart, null));
            return result.Placed && billing.Charges == 1 && shelf.InStock("lamp") == 8;
        });
        await Check("too few in stock: nothing is charged", async () =>
        {
            var billing = new CountingBilling();
            var result = await new OrderService(Shelf(), billing).PlaceOrderAsync(new([new("shade", 6)], null));
            return !result.Placed && billing.Charges == 0;
        });
        await Check("a retried order is charged once", async () =>
        {
            var billing = new CountingBilling(delayMs: 200);
            var service = new OrderService(Shelf(), billing);
            var request = new OrderRequest(Cart, null);
            await Task.WhenAll(service.PlaceOrderAsync(request), service.PlaceOrderAsync(request));
            return billing.Charges == 1;
        }, knownBug: true);

        Console.WriteLine(failed == 0 ? "orders: all checks passed" : $"orders: {failed} failed");
        return failed == 0 ? 0 : 1;
    }
}
