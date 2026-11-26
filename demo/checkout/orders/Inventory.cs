namespace Lumen.Orders;

/// <summary>How many of each item are on the shelf, and holding them for an order.</summary>
public class Inventory
{
    private readonly Dictionary<string, int> _stock;
    private readonly object _lock = new();

    public Inventory(Dictionary<string, int> stock) => _stock = new Dictionary<string, int>(stock);

    public int InStock(string sku) { lock (_lock) return _stock.GetValueOrDefault(sku); }

    public bool Reserve(IReadOnlyList<LineItem> items)
    {
        lock (_lock)
        {
            if (items.Any(i => !_stock.ContainsKey(i.Sku) || _stock[i.Sku] < i.Quantity))
            {
                return false;
            }
            foreach (var item in items)
            {
                _stock[item.Sku] -= item.Quantity;
            }
            return true;
        }
    }
}
