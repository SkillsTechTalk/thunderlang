// Sample code for /read, one per language. compiler/test/read-samples.test.mjs proves each sample
// reads into the decisions listed in `expect`, so the page never shows a broken example.

/** @typedef {{ key: string, label: string, language: string, file: string, source: string, expect: { decisions: string[], functions: string[] } }} ReadSample */

/** @type {ReadSample[]} */
export const READ_SAMPLES = [
  {
    key: 'go-shipping',
    label: 'Go: shipping service',
    language: 'go',
    file: 'shipping.go',
    source: `package shipping

import "errors"

var ErrNoAddress = errors.New("no address")

// ShippingFee decides what a customer pays to ship an order.
func ShippingFee(total float64, member bool, oversized bool) string {
	if oversized {
		return "Freight"
	}
	if total >= 50 || member {
		return "Free"
	}
	return "Standard"
}

// DeliveryWindow promises a delivery speed by region.
func DeliveryWindow(region string, express bool) string {
	if express && region == "domestic" {
		return "NextDay"
	} else if region == "domestic" {
		return "ThreeDays"
	}
	return "TwoWeeks"
}

func Label(order Order) (string, error) {
	if order.Address == "" {
		return "", ErrNoAddress
	}
	return fmt.Sprintf("%s\\n%s", order.Name, order.Address), nil
}
`,
    expect: { decisions: ['ShippingFee', 'DeliveryWindow'], functions: ['Label'] },
  },
  {
    key: 'rust-fraud',
    label: 'Rust: fraud check',
    language: 'rust',
    file: 'fraud.rs',
    source: `pub enum Verdict { Allow, Review, Block }

/// Score a card payment before it is captured.
pub fn check_payment(amount: f64, country_matches: bool, attempts_last_hour: u32) -> Verdict {
    if attempts_last_hour > 5 {
        return Verdict::Block;
    }
    if amount > 2000.0 && !country_matches {
        return Verdict::Review;
    }
    Verdict::Allow
}

pub fn needs_3ds(amount: f64, saved_card: bool) -> bool {
    if saved_card { false } else { amount >= 30.0 }
}

#[test]
fn blocks_card_testing() {
    assert!(matches!(check_payment(1.0, true, 9), Verdict::Block));
}
`,
    expect: { decisions: ['check_payment'], functions: ['needs_3ds'] },
  },
  {
    key: 'java-loans',
    label: 'Java: loan rules',
    language: 'java',
    file: 'LoanPolicy.java',
    source: `package bank.loans;

public class LoanPolicy {

    /** First-pass decision on a personal loan application. */
    public static String decide(double amount, int creditScore, boolean verifiedIncome) {
        if (creditScore < 500) {
            return "Decline";
        }
        if (amount <= 5000 && creditScore >= 700 && verifiedIncome) {
            return "Approve";
        }
        return "Review";
    }

    public static String rateBand(int creditScore) {
        return creditScore >= 760 ? "Prime" : creditScore >= 660 ? "NearPrime" : "Subprime";
    }

    public static double monthlyPayment(double principal, double rate, int months) {
        double r = rate / 12;
        return principal * r / (1 - Math.pow(1 + r, -months));
    }
}
`,
    expect: { decisions: ['decide', 'rateBand'], functions: ['monthlyPayment'] },
  },
  {
    key: 'python-grading',
    label: 'Python: course grading',
    language: 'python',
    file: 'grading.py',
    source: `class LateSubmission(Exception):
    pass


def letter_grade(score: float) -> str:
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    return "F"


def can_resubmit(attempts: int, days_late: int) -> str:
    return "Allowed" if attempts < 2 and days_late <= 3 else "Closed"


def average(scores):
    if not scores:
        raise LateSubmission("no scores")
    return sum(scores) / len(scores)


def test_boundary():
    assert letter_grade(90) == "A"
`,
    expect: { decisions: ['letter_grade', 'can_resubmit'], functions: ['average', 'test_boundary'] },
  },
  {
    key: 'csharp-access',
    label: 'C#: document access',
    language: 'csharp',
    file: 'AccessPolicy.cs',
    source: `namespace Docs.Security
{
    public static class AccessPolicy
    {
        // Who may open a document, and how.
        public static string CanOpen(string role, bool isOwner, bool documentLocked)
        {
            if (isOwner) return "Edit";
            if (documentLocked) return "Deny";
            if (role == "admin" || role == "editor") return "Edit";
            if (role == "viewer") return "Read";
            return "Deny";
        }

        public static void Audit(string user, string doc)
        {
            Logger.Info($"{user} opened {doc}");
        }
    }
}
`,
    expect: { decisions: ['CanOpen'], functions: ['Audit'] },
  },
  {
    key: 'kotlin-delivery',
    label: 'Kotlin: delivery speed',
    language: 'kotlin',
    file: 'Delivery.kt',
    source: `package shop.delivery

// How fast an order can ship, from its weight and the customer's plan.
fun speed(weightKg: Double, plan: String): String = when {
    weightKg > 30.0 -> "Freight"
    plan == "prime" -> "NextDay"
    weightKg <= 2.0 -> "Express"
    else -> "Standard"
}

fun schedule(orderId: String, weightKg: Double): Shipment {
    require(weightKg > 0.0) { "weight must be positive" }
    return Shipment(orderId, speed(weightKg, "basic"))
}
`,
    expect: { decisions: ['speed'], functions: ['schedule'] },
  },
  {
    key: 'php-coupons',
    label: 'PHP: coupon check',
    language: 'php',
    file: 'Coupons.php',
    source: `<?php
namespace Shop\\Checkout;

class Coupons
{
    // Whether a coupon can be applied to a cart.
    public function check(string $code, float $cartTotal, bool $firstOrder): string
    {
        if ($code === 'WELCOME' && !$firstOrder) {
            return 'NotEligible';
        }
        if ($cartTotal < 20) {
            return 'BelowMinimum';
        }
        return 'Applied';
    }

    public function apply(Cart $cart, string $code): Cart
    {
        abort_if($cart->locked, 409);
        return $cart->withCoupon($code);
    }
}
`,
    expect: { decisions: ['check'], functions: ['apply'] },
  },
  {
    key: 'ruby-support',
    label: 'Ruby: support ticket priority',
    language: 'ruby',
    file: 'priority.rb',
    source: `class TicketPriority
  # How urgent a support ticket is.
  def priority(plan, outage, hours_open)
    return :urgent if outage
    return :high if plan == :pro && hours_open > 24
    case plan
    when :enterprise then :high
    when :pro then :normal
    else
      :low
    end
  end

  def escalate(ticket)
    raise ArgumentError, "ticket is closed" if ticket.closed
    ticket.assign_to_lead
  end
end
`,
    expect: { decisions: ['priority'], functions: ['escalate'] },
  },
  {
    key: 'sql-orders',
    label: 'SQL: orders and payments',
    language: 'sql',
    file: 'orders.sql',
    source: `-- One purchase by one customer.
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status      TEXT NOT NULL DEFAULT 'pending',
    total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    CONSTRAINT total_not_negative CHECK (total >= 0)
);

-- Paid orders of $100 or more, biggest first.
CREATE VIEW big_paid_orders AS
SELECT o.id, o.total
FROM orders o
WHERE o.status = 'paid' AND o.total >= 100
ORDER BY o.total DESC;

-- Marks an order as paid, if the payment covers it.
CREATE FUNCTION pay_order(p_order_id INTEGER, p_amount NUMERIC) RETURNS TEXT AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT total INTO v_total FROM orders WHERE id = p_order_id;
    IF p_amount < v_total THEN
        RAISE EXCEPTION 'Not enough money';
    END IF;
    UPDATE orders SET status = 'paid' WHERE id = p_order_id;
    RETURN 'paid';
END;
$$ LANGUAGE plpgsql;
`,
    expect: { decisions: [], functions: ['total_not_negative', 'big_paid_orders', 'pay_order'] },
  },
  {
    key: 'r-orders',
    label: 'R: shipping and sales',
    language: 'r',
    file: 'orders.R',
    source: `library(dplyr)

#' Decide how fast an order ships.
shipping_speed <- function(total, member = FALSE) {
  if (total >= 100 && member) {
    "Express"
  } else if (total >= 50) {
    "Standard"
  } else {
    "Economy"
  }
}

#' Sales by region, biggest first.
region_sales <- function(orders) {
  if (nrow(orders) == 0) {
    stop("No orders to summarise")
  }
  orders |>
    filter(status == "paid", total > 0) |>
    group_by(region) |>
    summarise(revenue = sum(total)) |>
    arrange(desc(revenue))
}
`,
    expect: { decisions: ['shipping_speed'], functions: ['region_sales'] },
  },
  {
    key: 'shell-deploy',
    label: 'Shell (Bash): deploy script',
    language: 'shell',
    file: 'deploy.sh',
    source: `#!/usr/bin/env bash
# Builds the web app and rolls it out to Kubernetes.
set -euo pipefail

# Builds the image and uploads it.
build_image() {
  local tag="$1"
  docker build -t "registry.example.com/web:$tag" .
  docker push "registry.example.com/web:$tag"
}

deploy() {
  local env="\${1:-staging}"
  if [[ ! -f "k8s/$env.yaml" ]]; then
    echo "No settings for $env" >&2
    exit 1
  fi
  case "$env" in
    prod) kubectl apply -f k8s/prod.yaml -n web ;;
    *) kubectl apply -f "k8s/$env.yaml" ;;
  esac
  kubectl rollout status deployment/web -n web
}

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
build_image "$(git rev-parse --short HEAD)"
deploy "$@"
`,
    expect: { decisions: [], functions: ['build_image', 'deploy'] },
  },
  {
    key: 'powershell-release',
    label: 'PowerShell: release',
    language: 'powershell',
    file: 'Release.ps1',
    source: `<#
.SYNOPSIS
Chooses which ring a release goes to first.
#>
function Get-ReleaseRing {
    param([int]$Users, [bool]$Pilot)
    if ($Users -ge 1000 -and -not $Pilot) {
        'Broad'
    } elseif ($Users -ge 100) {
        'Early'
    } else {
        'Canary'
    }
}

function Publish-Release {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Version,
        [string]$ResourceGroup = 'rg-web'
    )
    if (-not (Test-Path ".\\release\\$Version")) {
        throw "No build for version $Version"
    }
    $rg = Get-AzResourceGroup -Name $ResourceGroup -ErrorAction SilentlyContinue
    if ($null -eq $rg) {
        New-AzResourceGroup -Name $ResourceGroup -Location 'eastus'
    }
    try {
        Invoke-RestMethod -Method Post -Uri 'https://deploy.example.com/releases' -Body @{ version = $Version }
    } catch {
        Write-Warning "Could not announce $Version"
    } finally {
        Remove-Item -Path ".\\release\\tmp" -Recurse -Force
    }
}
`,
    expect: { decisions: ['Get-ReleaseRing'], functions: ['Publish-Release'] },
  },
];
