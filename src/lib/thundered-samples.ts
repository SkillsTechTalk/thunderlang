// The same refund rule, written the usual way in every language the Thunder code reader supports
// (compiler/src/read.mjs READ_LANGUAGES). Each is read live by the real reader on the home page.
export const THUNDERED_SAMPLES: Array<{ key: string; label: string; lang: string; source: string }> = [
  { key: "python", label: "Python", lang: "python", source: `def refund(amount: float, within_window: bool) -> str:
    if amount >= 0 and amount <= 100 and within_window:
        return "Approve"
    return "Review"` },
  { key: "typescript", label: "TypeScript", lang: "typescript", source: `export function refund(amount: number, withinWindow: boolean): string {
  if (amount >= 0 && amount <= 100 && withinWindow) {
    return "Approve";
  }
  return "Review";
}` },
  { key: "javascript", label: "JavaScript", lang: "javascript", source: `function refund(amount, withinWindow) {
  if (amount >= 0 && amount <= 100 && withinWindow) {
    return "Approve";
  }
  return "Review";
}` },
  { key: "java", label: "Java", lang: "java", source: `public static String refund(double amount, boolean withinWindow) {
    if (amount >= 0 && amount <= 100 && withinWindow) {
        return "Approve";
    }
    return "Review";
}` },
  { key: "csharp", label: "C#", lang: "csharp", source: `public static string Refund(decimal amount, bool withinWindow)
{
    if (amount >= 0 && amount <= 100 && withinWindow)
    {
        return "Approve";
    }
    return "Review";
}` },
  { key: "go", label: "Go", lang: "go", source: `func Refund(amount float64, withinWindow bool) string {
	if amount >= 0 && amount <= 100 && withinWindow {
		return "Approve"
	}
	return "Review"
}` },
  { key: "rust", label: "Rust", lang: "rust", source: `pub fn refund(amount: f64, within_window: bool) -> &'static str {
    if amount >= 0.0 && amount <= 100.0 && within_window {
        return "Approve";
    }
    "Review"
}` },
  { key: "kotlin", label: "Kotlin", lang: "kotlin", source: `fun refund(amount: Double, withinWindow: Boolean): String {
    if (amount >= 0 && amount <= 100 && withinWindow) {
        return "Approve"
    }
    return "Review"
}` },
  { key: "php", label: "PHP", lang: "php", source: `function refund(float $amount, bool $withinWindow): string {
    if ($amount >= 0 && $amount <= 100 && $withinWindow) {
        return "Approve";
    }
    return "Review";
}` },
  { key: "ruby", label: "Ruby", lang: "ruby", source: `def refund(amount, within_window)
  if amount >= 0 && amount <= 100 && within_window
    return "Approve"
  end
  "Review"
end` },
];
