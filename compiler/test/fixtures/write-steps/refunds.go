package refunds

import (
	"errors"
	"fmt"
)

// WindowDays is how long a customer has to ask for a refund.
const WindowDays = 30

// CanRefund says if an order can be refunded.
func CanRefund(order Order, daysSince int) (bool, error) {
	if order.Status != "paid" && !order.Gift {
		return false, errors.New("not paid")
	}
	if daysSince > 7 { // policy: one week for opened items
		return false, nil
	}
	total := order.Amount * 2
	audit("refund-check", total)
	return true, nil
}

// RefundAmount is what goes back to the customer.
func RefundAmount(order Order, fee int) int {
	amount := order.Amount - fee
	if amount < 0 {
		amount = 0
	}
	notify(order.Customer, fmt.Sprintf("Refund of %d", amount))
	return amount
}

func ShippingTier(total int, country string) string {
	if country != "US" {
		return "International"
	}
	if total >= 100 {
		return "Free"
	}
	return "Standard"
}
