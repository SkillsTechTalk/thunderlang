using Lumen.Orders;

if (args.Contains("--test"))
{
    return await SelfTests.RunAsync();
}

var port = args.Length > 0 ? args[0] : "8102";
var billingUrl = args.Length > 1 ? args[1] : "http://127.0.0.1:8101";

var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.Services.AddSingleton(new Inventory(new() { ["lamp"] = 10, ["bulb"] = 100, ["shade"] = 5 }));
builder.Services.AddSingleton<IBilling>(new BillingClient(new HttpClient { BaseAddress = new Uri(billingUrl), Timeout = TimeSpan.FromSeconds(30) }));
builder.Services.AddSingleton<OrderService>();
var app = builder.Build();

app.MapPost("/orders", async (OrderRequest request, OrderService orders) =>
{
    return await orders.PlaceOrderAsync(request);
});

app.MapGet("/stock", (Inventory inventory) => Pricing.UnitPrices.Keys.ToDictionary(sku => sku, inventory.InStock));

Console.WriteLine($"orders listening on {port}, billing at {billingUrl}");
await app.RunAsync($"http://127.0.0.1:{port}");
return 0;
