namespace Lumen.Orders;

public record LineItem(string Sku, int Quantity);

public record Price(decimal Subtotal, decimal Discount, decimal Tax, decimal Total);

/// <summary>What an order costs: item prices, a coupon, and sales tax.</summary>
public static class Pricing
{
    public const decimal TaxRate = 0.08m;
    public const decimal CouponMinimum = 50m;

    public static readonly Dictionary<string, decimal> UnitPrices = new()
    {
        ["lamp"] = 24.00m,
        ["bulb"] = 3.50m,
        ["shade"] = 18.00m,
    };

    public static Price PriceOf(IEnumerable<LineItem> items, string? coupon)
    {
        decimal subtotal = items.Sum(i => UnitPrices[i.Sku] * i.Quantity);
        decimal discount = 0m;
        if (coupon == "SAVE10" && subtotal >= CouponMinimum)
        {
            discount = Math.Round(subtotal * 0.10m, 2, MidpointRounding.AwayFromZero);
        }
        decimal tax = Math.Round((subtotal - discount) * TaxRate, 2, MidpointRounding.AwayFromZero);
        return new Price(subtotal, discount, tax, subtotal - discount + tax);
    }
}
