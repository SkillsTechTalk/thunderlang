namespace Lumen.Orders;

/// <summary>What an order pays for shipping. The cart page (web/shipping.ts) and billing's receipt
/// (billing/receipt.py) say the same rule in their own words: three copies that must agree.</summary>
public static class Shipping
{
    public static decimal ShippingFee(decimal subtotal)
    {
        if (subtotal >= 50m)
        {
            return 0m;
        }
        return 5.99m;
    }
}
