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
];
