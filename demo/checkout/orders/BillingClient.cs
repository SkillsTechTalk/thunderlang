using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Lumen.Orders;

public record ChargeResult(string PaymentId, string Status);

public interface IBilling
{
    Task<ChargeResult> ChargeAsync(string orderRef, long amountCents, string idempotencyKey);
}

/// <summary>Asks the billing service to charge the customer.</summary>
public class BillingClient(HttpClient http) : IBilling
{
    public async Task<ChargeResult> ChargeAsync(string orderRef, long amountCents, string idempotencyKey)
    {
        var json = JsonSerializer.Serialize(new { order_ref = orderRef, amount_cents = amountCents, idempotency_key = idempotencyKey });
        var response = await http.PostAsync("/charges", new StringContent(json, Encoding.UTF8, "application/json"));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        return new ChargeResult(body!["payment_id"].ToString()!, body["status"].ToString()!);
    }
}
