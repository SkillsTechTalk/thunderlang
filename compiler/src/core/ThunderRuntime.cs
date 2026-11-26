// ThunderRuntime.cs: written by the Thunder compiler next to compiled C#. Base class library only.
// The values and rules here are the Thunder engine's own (compiler/src/core/engine-values.mjs), ported line by line,
// so compiled C#, compiled TypeScript, the Thunder engine, and compiled Python say the same thing for the same program.
//
// Values:   whole number -> BigInteger      decimal number -> Dec (exact, like Python's Decimal)
//           money -> Money                  text -> string      yes/no -> bool      nothing -> null
//           list -> List<object> (a pair from a map is a Tuple)      map -> PyDict
//           record -> RecordVal             date -> PyDate
#nullable disable
#pragma warning disable CS0162, CS0168, CS0219, CS8321
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text;
using System.Threading;

namespace Thunder
{
    public sealed class Where { public string file; public int line; public Where(string f, int l) { file = f; line = l; } }

    /** Every error a Thunder program can raise: a Thunder error (TC5xx) or one Python itself would raise. */
    public abstract class TErr : Exception
    {
        public List<Where> where;
        public string pyType;
        public bool thunder;
        protected TErr(string message) : base(message) { }
    }
    public sealed class ThunderErr : TErr
    {
        public string code;
        public ThunderErr(string code, string message, string pyType = "ThunderError") : base(message) { this.code = code; this.pyType = pyType; thunder = true; }
    }
    public sealed class PyErr : TErr
    {
        public object[] args;
        public PyErr(string pyType, string message, object[] args = null) : base(message) { this.pyType = pyType; this.args = args ?? new object[] { message }; }
    }

    public sealed class Frame { public string file; public int line; public Frame(string f, int l) { file = f; line = l; } }

    // ── Exact decimals: Python's Decimal with its default context (28 digits, half-even when a result is too long) ──
    public sealed class Dec
    {
        public readonly int s; public readonly BigInteger c; public readonly int e; // sign (0 or 1), coefficient >= 0, exponent
        const int PREC = 28;
        static readonly BigInteger TEN = 10;
        public Dec(int s, BigInteger c, int e) { this.s = s; this.c = c; this.e = e; }
        public static BigInteger Pow10(int n) => BigInteger.Pow(TEN, n);
        static int Ndigits(BigInteger c) => c.IsZero ? 1 : c.ToString().Length;
        public static Dec Of(object x) => x is Dec d ? d : x is BigInteger b ? Int(b) : x is bool t ? Int(t ? BigInteger.One : BigInteger.Zero) : null;
        public static Dec Int(BigInteger n) => new Dec(n.Sign < 0 ? 1 : 0, BigInteger.Abs(n), 0);
        static readonly System.Text.RegularExpressions.Regex NUM = new System.Text.RegularExpressions.Regex(@"^([+-]?)([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$");
        public static Dec Parse(string text)
        {
            var m = NUM.Match(T.jsTrim(text).Replace("_", ""));
            if (!m.Success || (m.Groups[2].Value == "" && !m.Groups[3].Success)) return null;
            var frac = m.Groups[3].Success ? m.Groups[3].Value : "";
            var digits = (m.Groups[2].Value + frac);
            if (digits == "") digits = "0";
            return new Dec(m.Groups[1].Value == "-" ? 1 : 0, BigInteger.Parse(digits), (m.Groups[4].Success ? int.Parse(m.Groups[4].Value) : 0) - frac.Length);
        }
        public bool IsZero() => c.IsZero;
        public Dec Fix()
        {
            int d = Ndigits(c) - PREC;
            if (d <= 0) return this;
            var p = Pow10(d);
            var q = BigInteger.Divide(c, p);
            var r = BigInteger.Remainder(c, p);
            var half = 5 * Pow10(d - 1);
            if (r > half || (r == half && !q.IsEven)) q += 1;
            int ee = e + d;
            if (Ndigits(q) > PREC) { q /= TEN; ee += 1; }
            return new Dec(s, q, ee);
        }
        public BigInteger Signed() => s == 1 ? -c : c;
        public static Dec Add(Dec a, Dec b)
        {
            int ee = Math.Min(a.e, b.e);
            var x = a.Signed() * Pow10(a.e - ee); var y = b.Signed() * Pow10(b.e - ee);
            var sum = x + y;
            int sg;
            if (sum.IsZero) sg = a.s == 1 && b.s == 1 && a.c.IsZero && b.c.IsZero ? 1 : (a.c.IsZero && b.c.IsZero ? Math.Min(a.s, b.s) : 0);
            else sg = sum.Sign < 0 ? 1 : 0;
            return new Dec(sg, BigInteger.Abs(sum), ee).Fix();
        }
        public Dec Negated() => new Dec(s == 1 ? 0 : 1, c, e);
        public static Dec Sub(Dec a, Dec b) => Add(a, b.Negated());
        public static Dec Mul(Dec a, Dec b) => new Dec(a.s ^ b.s, a.c * b.c, a.e + b.e).Fix();
        public static Dec Div(Dec a, Dec b)
        {
            int sg = a.s ^ b.s;
            if (a.c.IsZero) return new Dec(sg, BigInteger.Zero, a.e - b.e).Fix();
            int shift = Ndigits(b.c) - Ndigits(a.c) + PREC + 1;
            int exp = a.e - b.e - shift;
            BigInteger coeff, rem;
            if (shift >= 0) { var n = a.c * Pow10(shift); coeff = BigInteger.DivRem(n, b.c, out rem); }
            else { var d = b.c * Pow10(-shift); coeff = BigInteger.DivRem(a.c, d, out rem); }
            if (!rem.IsZero) { if ((coeff % 5).IsZero) coeff += 1; }
            else { int ideal = a.e - b.e; while (exp < ideal && (coeff % TEN).IsZero) { coeff /= TEN; exp += 1; } }
            return new Dec(sg, coeff, exp).Fix();
        }
        public static Dec Rem(Dec a, Dec b)
        {
            int ee = Math.Min(a.e, b.e);
            var x = a.c * Pow10(a.e - ee); var y = b.c * Pow10(b.e - ee);
            return new Dec(a.s, x % y, ee).Fix();
        }
        public Dec Neg() => (c.IsZero ? new Dec(0, BigInteger.Zero, e) : Negated()).Fix();
        public Dec Abs() => new Dec(0, c, e).Fix();
        public static int Cmp(Dec a, Dec b)
        {
            int ee = Math.Min(a.e, b.e);
            var x = a.Signed() * Pow10(a.e - ee); var y = b.Signed() * Pow10(b.e - ee);
            return x < y ? -1 : x > y ? 1 : 0;
        }
        public Dec QuantizeHalfUp(int ee)
        {
            if (ee <= e) return new Dec(s, c * Pow10(e - ee), ee);
            var p = Pow10(ee - e);
            var q = BigInteger.Divide(c, p);
            if ((c % p) * 2 >= p) q += 1;
            return new Dec(s, q, ee);
        }
        public bool IsIntegral() { if (e >= 0) return true; return (c % Pow10(-e)).IsZero; }
        public BigInteger ToBigInt() { var v = e >= 0 ? c * Pow10(e) : BigInteger.Divide(c, Pow10(-e)); return s == 1 ? -v : v; }
        public override string ToString()
        {
            var digits = c.ToString();
            int left = e + digits.Length;
            int dot = e <= 0 && left > -6 ? left : 1;
            string ip, fp;
            if (dot <= 0) { ip = "0"; fp = "." + new string('0', -dot) + digits; }
            else if (dot >= digits.Length) { ip = digits + new string('0', dot - digits.Length); fp = ""; }
            else { ip = digits.Substring(0, dot); fp = "." + digits.Substring(dot); }
            var ex = left == dot ? "" : "E" + (left - dot >= 0 ? "+" : "") + (left - dot);
            return (s == 1 ? "-" : "") + ip + fp + ex;
        }
        public string ToFixed(int? places = null, bool group = false)
        {
            var d = this;
            if (places != null) d = d.RoundHalfEven(-places.Value);
            var digits = d.c.ToString();
            int dot = d.e + digits.Length;
            string ip, fp;
            if (dot < 0) { ip = "0"; fp = new string('0', -dot) + digits; }
            else if (dot > digits.Length) { ip = digits + new string('0', dot - digits.Length); fp = ""; }
            else { ip = digits.Substring(0, dot); if (ip == "") ip = "0"; fp = digits.Substring(dot); }
            if (group) ip = T.groupThousands(ip);
            return (d.s == 1 ? "-" : "") + ip + (fp != "" ? "." + fp : "");
        }
        public Dec RoundHalfEven(int ee)
        {
            if (ee <= e) return new Dec(s, c * Pow10(e - ee), ee);
            var p = Pow10(ee - e);
            var q = BigInteger.Divide(c, p);
            var r = BigInteger.Remainder(c, p);
            if (r * 2 > p || (r * 2 == p && !q.IsEven)) q += 1;
            return new Dec(s, q, ee);
        }
        public string Key()
        {
            if (c.IsZero) return "0";
            var cc = c; int ee = e;
            while ((cc % TEN).IsZero) { cc /= TEN; ee += 1; }
            return (s == 1 ? "-" : "") + cc.ToString() + "e" + ee;
        }
    }

    public sealed class Money
    {
        public readonly Dec amount;
        public Money(Dec amount) { this.amount = amount; }
        public static Money Of(object x)
        {
            if (x is Money m) return m;
            if (x is string str)
            {
                var d = Dec.Parse(str.Replace(",", "").Replace("$", "").Trim());
                if (d == null) throw new PyErr("InvalidOperation", "[<class 'decimal.ConversionSyntax'>]");
                return new Money(d);
            }
            return new Money(T.toDec(x));
        }
        public override string ToString()
        {
            var a = amount;
            int places = a.e < 0 ? Math.Max(2, -a.e) : 2;
            return (a.s == 1 && !a.c.IsZero ? "-$" : "$") + a.Abs().ToFixed(places, true);
        }
    }

    public sealed class PyDate
    {
        public readonly int y, m, d;
        public PyDate(int y, int m, int d) { this.y = y; this.m = m; this.d = d; }
        public string Iso() => y.ToString().PadLeft(4, '0') + "-" + m.ToString().PadLeft(2, '0') + "-" + d.ToString().PadLeft(2, '0');
        public int Num() => y * 10000 + m * 100 + d;
        public static PyDate Today() { var t = DateTime.Now; return new PyDate(t.Year, t.Month, t.Day); }
        static readonly System.Text.RegularExpressions.Regex DATE = new System.Text.RegularExpressions.Regex(@"^([0-9]{4})-?([0-9]{2})-?([0-9]{2})$");
        public static PyDate Parse(string text)
        {
            var mm = DATE.Match(text);
            if (!mm.Success) return null;
            int yy = int.Parse(mm.Groups[1].Value), mo = int.Parse(mm.Groups[2].Value), dd = int.Parse(mm.Groups[3].Value);
            int[] days = { 31, (yy % 4 == 0 && yy % 100 != 0) || yy % 400 == 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
            if (yy < 1 || mo < 1 || mo > 12 || dd < 1 || dd > days[mo - 1]) return null;
            return new PyDate(yy, mo, dd);
        }
    }

    public sealed class Tuple { public readonly List<object> items; public Tuple(List<object> items) { this.items = items; } }

    public sealed class NotGiven { }

    /** A Python dict: insertion order kept; keys equal the way Python compares them (1 == 1.0 == True). */
    public sealed class PyDict
    {
        public readonly Dictionary<string, object[]> m = new Dictionary<string, object[]>();
        public readonly List<string> order = new List<string>();
        public static string KeyOf(object k)
        {
            if (k == null) return "N";
            if (k is string str) return "s" + str;
            if (k is bool || k is BigInteger || k is Dec) return "n" + Dec.Of(k).Key();
            if (k is Money mo) return "m" + mo.amount.Key();
            if (k is PyDate d) return "d" + d.Iso();
            if (k is Tuple t) return "t(" + string.Join(",", t.items.Select(KeyOf)) + ")";
            if (k is NotGiven) return "G";
            throw T.TypeErr("unhashable type: '" + T.typeName(k) + "'");
        }
        public bool Has(object k) => m.ContainsKey(KeyOf(k));
        public object Get(object k) => m.TryGetValue(KeyOf(k), out var e) ? e[1] : null;
        public void Set(object k, object v)
        {
            var id = KeyOf(k);
            if (m.TryGetValue(id, out var e)) e[1] = v; else { m[id] = new object[] { k, v }; order.Add(id); }
        }
        public void Delete(object k) { var id = KeyOf(k); if (m.Remove(id)) order.Remove(id); }
        public int Size => m.Count;
        public IEnumerable<object[]> Entries() { foreach (var id in order) yield return m[id]; }
        public List<object> Keys() => Entries().Select(e => e[0]).ToList();
        public List<object> Values() => Entries().Select(e => e[1]).ToList();
        public List<object> Items() => Entries().Select(e => (object)new Tuple(new List<object> { e[0], e[1] })).ToList();
    }

    public sealed class FieldDef { public string py; public string k; public FieldDef(string py, string k) { this.py = py; this.k = k; } }
    public sealed class Rule { public Func<object, object> cond; public string text; public int line; public Rule(Func<object, object> c, string t, int l) { cond = c; text = t; line = l; } }
    public sealed class RecordKind
    {
        public string py; public List<FieldDef> fields; public Dictionary<string, Rule[]> rules;
    }
    public sealed class RecordVal
    {
        public readonly RecordKind cls;
        public readonly Dictionary<string, object> f = new Dictionary<string, object>();
        public RecordVal(RecordKind cls) { this.cls = cls; }
    }

    /** Sorting the way V8's Array.prototype.sort does (TimSort), so a comparison that fails fails on the same pair. */
    static class V8Sort
    {
        public static void Sort<TItem>(TItem[] a, Func<TItem, TItem, int> cmp)
        {
            int length = a.Length;
            if (length < 2) return;
            int remaining = length, low = 0;
            int minRun = MinRun(remaining);
            var runs = new List<(int, int)>();
            while (remaining != 0)
            {
                int run = CountAndMakeRun(a, low, low + remaining, cmp);
                if (run < minRun)
                {
                    int forced = Math.Min(minRun, remaining);
                    BinaryInsertion(a, low, low + run, low + forced, cmp);
                    run = forced;
                }
                runs.Add((low, run));
                low += run; remaining -= run;
            }
            // Longer arrays (64 or more items): merge the runs in order (stable).
            while (runs.Count > 1)
            {
                var (b1, l1) = runs[0]; var (b2, l2) = runs[1];
                var merged = new TItem[l1 + l2];
                int i = b1, j = b2, k = 0;
                while (i < b1 + l1 && j < b2 + l2) merged[k++] = cmp(a[j], a[i]) < 0 ? a[j++] : a[i++];
                while (i < b1 + l1) merged[k++] = a[i++];
                while (j < b2 + l2) merged[k++] = a[j++];
                Array.Copy(merged, 0, a, b1, merged.Length);
                runs.RemoveAt(1); runs[0] = (b1, l1 + l2);
            }
        }
        static int MinRun(int n) { int r = 0; while (n >= 64) { r |= n & 1; n >>= 1; } return n + r; }
        static int CountAndMakeRun<TItem>(TItem[] a, int lowArg, int high, Func<TItem, TItem, int> cmp)
        {
            int low = lowArg + 1;
            if (low == high) return 1;
            int runLength = 2;
            var elementLow = a[low]; var elementLowPre = a[low - 1];
            int order = cmp(elementLow, elementLowPre);
            bool desc = order < 0;
            var previous = elementLow;
            for (int idx = low + 1; idx < high; ++idx)
            {
                var current = a[idx];
                order = cmp(current, previous);
                if (desc) { if (order >= 0) break; }
                else { if (order < 0) break; }
                previous = current;
                ++runLength;
            }
            if (desc) Array.Reverse(a, lowArg, runLength);
            return runLength;
        }
        static void BinaryInsertion<TItem>(TItem[] a, int low, int startArg, int high, Func<TItem, TItem, int> cmp)
        {
            int start = low == startArg ? startArg + 1 : startArg;
            for (; start < high; ++start)
            {
                int left = low, right = start;
                var pivot = a[start];
                while (left < right)
                {
                    int mid = left + ((right - left) >> 1);
                    int order = cmp(pivot, a[mid]);
                    if (order < 0) right = mid; else left = mid + 1;
                }
                for (int p = start; p > left; --p) a[p] = a[p - 1];
                a[left] = pivot;
            }
        }
    }

    public static partial class T
    {
        public static readonly object NOT_GIVEN = new NotGiven();
        public const int MAX_FRAMES = 997;

        // ── Errors ──────────────────────────────────────────────────────────────────────────────────────────────
        public static ThunderErr Stop(object m) => new ThunderErr("TC507", (string)m, "Stop");
        public static ThunderErr RuleBroken(string m) => new ThunderErr("TC504", m, "RuleBroken");
        public static ThunderErr ExpectationFailed(string m) => new ThunderErr("TC505", m, "ExpectationFailed");
        public static ThunderErr KindMismatch(string m) => new ThunderErr("TC506", m, "TypeError");
        public static ThunderErr ConversionFailed(string m) => new ThunderErr("TC509", m, "ValueError");
        public static ThunderErr MissingValue(string m) => new ThunderErr("TC503", m, "LookupError");
        public static ThunderErr DividedByZero(string m) => new ThunderErr("TC501", m, "ZeroDivisionError");
        public static PyErr TypeErr(string m) => new PyErr("TypeError", m);

        public static string explain(TErr e)
        {
            if (e.thunder) return e.Message;
            var t = e.pyType;
            if (t == "ZeroDivisionError" || t == "DivisionByZero") return "You divided by zero.";
            if (t == "InvalidOperation") return "This calculation has no answer (for example, zero divided by zero).";
            if (t == "KeyError") return "There is no entry for " + show(((PyErr)e).args.Length > 0 ? ((PyErr)e).args[0] : null) + ".";
            if ((t == "TypeError" || t == "AttributeError") && e.Message.Contains("NoneType")) return "A value was nothing where a value was needed.";
            if (t == "TypeError") return "Values of different kinds were mixed (" + e.Message + ").";
            if (t == "RecursionError") return "A function called itself too many times.";
            return t + ": " + e.Message;
        }
        public static string codeOf(TErr e)
        {
            if (e is ThunderErr te) return te.code;
            var t = e.pyType;
            if (t == "ZeroDivisionError" || t == "DivisionByZero") return "TC501";
            if ((t == "TypeError" || t == "AttributeError") && e.Message.Contains("NoneType")) return "TC502";
            if (t == "KeyError") return "TC503";
            if (t == "TypeError") return "TC506";
            return "TC508";
        }
        public static TErr asPyErr(Exception e)
        {
            if (e is TErr t) return t;
            if (e is InsufficientExecutionStackException) return new PyErr("RecursionError", "maximum recursion depth exceeded");
            System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(e).Throw();
            return null;
        }

        // ── JavaScript string behavior the engine relies on ───────────────────────────────────────────────────────
        /** Code points, the way JavaScript's Array.from(string) splits text (a lone surrogate stays itself). */
        public static List<string> chars(string s)
        {
            var out_ = new List<string>(s.Length);
            for (int i = 0; i < s.Length;)
            {
                if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { out_.Add(s.Substring(i, 2)); i += 2; }
                else { out_.Add(s[i].ToString()); i++; }
            }
            return out_;
        }
        static int cp(string ch) => ch.Length == 2 ? char.ConvertToUtf32(ch[0], ch[1]) : ch[0];
        /** JavaScript's \s (with the u flag). */
        static bool jsSpace(char ch) => ch == '\t' || ch == '\n' || ch == '\v' || ch == '\f' || ch == '\r' || ch == ' ' || ch == '\u00a0' || ch == '\u1680' || (ch >= '\u2000' && ch <= '\u200a') || ch == '\u2028' || ch == '\u2029' || ch == '\u202f' || ch == '\u205f' || ch == '\u3000' || ch == '\ufeff';
        static bool pySpace(char ch) => jsSpace(ch) || (ch >= '\x1c' && ch <= '\x1f') || ch == '\x85';
        public static string jsTrim(string s) { int i = 0, j = s.Length; while (i < j && jsSpace(s[i])) i++; while (j > i && jsSpace(s[j - 1])) j--; return s.Substring(i, j - i); }
        public static string pyStrip(string s) { int i = 0, j = s.Length; while (i < j && pySpace(s[i])) i++; while (j > i && pySpace(s[j - 1])) j--; return s.Substring(i, j - i); }
        public static List<object> pySplit(string s)
        {
            var out_ = new List<object>(); var sb = new StringBuilder();
            foreach (var ch in s) { if (pySpace(ch)) { if (sb.Length > 0) { out_.Add(sb.ToString()); sb.Clear(); } } else sb.Append(ch); }
            if (sb.Length > 0) out_.Add(sb.ToString());
            return out_;
        }
        public static List<object> splitLines(string s)
        {
            var out_ = new List<object>(); int start = 0, i = 0;
            while (i < s.Length)
            {
                char ch = s[i];
                if (ch == '\r' && i + 1 < s.Length && s[i + 1] == '\n') { out_.Add(s.Substring(start, i - start)); i += 2; start = i; continue; }
                if (ch == '\n' || ch == '\r' || ch == '\v' || ch == '\f' || ch == '\x1c' || ch == '\x1d' || ch == '\x1e' || ch == '\x85' || ch == '\u2028' || ch == '\u2029') { out_.Add(s.Substring(start, i - start)); i++; start = i; continue; }
                i++;
            }
            if (start < s.Length) out_.Add(s.Substring(start));
            return out_;
        }
        public static string groupThousands(string ip)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < ip.Length; i++) { if (i > 0 && (ip.Length - i) % 3 == 0) sb.Append(','); sb.Append(ip[i]); }
            return sb.ToString();
        }
        static string jsLower(string s) => s.ToLowerInvariant();
        static string jsUpper(string s) => s.ToUpperInvariant().Replace("ß", "SS");

        // ── Kinds ───────────────────────────────────────────────────────────────────────────────────────────────
        public static bool isInt(object x) => x is BigInteger;
        public static bool isNumber(object x) => x is BigInteger || x is Dec;
        static bool isIntLike(object x) => x is BigInteger || x is bool;
        static bool isNumLike(object x) => isIntLike(x) || x is Dec;
        static BigInteger asBig(object x) => x is bool b ? (b ? BigInteger.One : BigInteger.Zero) : (BigInteger)x;
        static int numCmp(object a, object b)
        {
            if (isIntLike(a) && isIntLike(b)) { var x = asBig(a); var y = asBig(b); return x < y ? -1 : x > y ? 1 : 0; }
            return Dec.Cmp(Dec.Of(a), Dec.Of(b));
        }
        /** JavaScript's a === b: equal primitives, or the same object. */
        static bool same(object a, object b)
        {
            if (a == null || b == null) return a == null && b == null;
            if (a is BigInteger x && b is BigInteger y) return x == y;
            if (a is string s1 && b is string s2) return string.Equals(s1, s2, StringComparison.Ordinal);
            if (a is bool b1 && b is bool b2) return b1 == b2;
            return ReferenceEquals(a, b);
        }

        public static string typeName(object v)
        {
            if (v == null) return "NoneType";
            if (v is bool) return "bool";
            if (v is BigInteger) return "int";
            if (v is string) return "str";
            if (v is Dec) return "decimal.Decimal";
            if (v is Money) return "Money";
            if (v is List<object>) return "list";
            if (v is Tuple) return "tuple";
            if (v is PyDict) return "dict";
            if (v is PyDate) return "datetime.date";
            if (v is RecordVal r) return r.cls.py;
            if (v is NotGiven) return "_NotGiven";
            return "object";
        }
        static string shortName(object v) => v is Dec ? "Decimal" : v is PyDate ? "date" : typeName(v);

        public static string describe(object v)
        {
            if (v == null) return "nothing";
            if (v is bool) return "a yes/no value";
            if (v is string s) return "the text \"" + s + "\"";
            if (isNumber(v)) return "the number " + show(v);
            if (v is Money m) return m.ToString();
            return "a value (" + shortName(v) + ")";
        }

        public static string show(object v)
        {
            if (v == null) return "nothing";
            if (v is bool b) return b ? "yes" : "no";
            if (v is Dec d) { var t = d.ToFixed(); return t.Contains('.') ? t.TrimEnd('0').TrimEnd('.') : t; }
            if (v is List<object> l) return "[" + string.Join(", ", l.Select(show)) + "]";
            if (v is Tuple tu) return "[" + string.Join(", ", tu.items.Select(show)) + "]";
            if (v is PyDict m) return "{" + string.Join(", ", m.Entries().Select(e => show(e[0]) + ": " + show(e[1]))) + "}";
            if (v is RecordVal r) return r.cls.py + "(" + string.Join(", ", r.cls.fields.Select(f => f.py.Replace("_", " ") + ": " + show(r.f.TryGetValue(f.py, out var x) ? x : null))) + ")";
            if (v is PyDate dt) return dt.Iso();
            return pyStr(v);
        }

        public static string pyRepr(object v)
        {
            if (v is string str)
            {
                char q = str.Contains('\'') && !str.Contains('"') ? '"' : '\'';
                var sb = new StringBuilder();
                foreach (var ch in chars(str))
                {
                    int c = cp(ch);
                    if (ch == "\\") sb.Append("\\\\");
                    else if (ch == q.ToString()) sb.Append('\\').Append(q);
                    else if (ch == "\n") sb.Append("\\n");
                    else if (ch == "\r") sb.Append("\\r");
                    else if (ch == "\t") sb.Append("\\t");
                    else if (c < 0x20 || c == 0x7f) sb.Append("\\x").Append(c.ToString("x2"));
                    else sb.Append(ch);
                }
                return q + sb.ToString() + q;
            }
            if (v == null) return "None";
            if (v is bool b) return b ? "True" : "False";
            if (v is BigInteger i) return i.ToString();
            if (v is Dec d) return "Decimal('" + d.ToString() + "')";
            if (v is Money mo) return "Money('" + mo.amount.ToFixed() + "')";
            if (v is List<object> l) return "[" + string.Join(", ", l.Select(pyRepr)) + "]";
            if (v is Tuple t) return t.items.Count == 1 ? "(" + pyRepr(t.items[0]) + ",)" : "(" + string.Join(", ", t.items.Select(pyRepr)) + ")";
            if (v is PyDict m) return "{" + string.Join(", ", m.Entries().Select(e => pyRepr(e[0]) + ": " + pyRepr(e[1]))) + "}";
            if (v is PyDate dt) return "datetime.date(" + dt.y + ", " + dt.m + ", " + dt.d + ")";
            if (v is RecordVal r) return r.cls.py + "(" + string.Join(", ", r.cls.fields.Select(f => f.py + "=" + pyRepr(r.f.TryGetValue(f.py, out var x) ? x : null))) + ")";
            if (v is NotGiven) return "not given";
            return v.ToString();
        }

        public static string pyStr(object v)
        {
            if (v is string s) return s;
            if (v is Money m) return m.ToString();
            if (v is PyDate d) return d.Iso();
            if (v is Dec dc) return dc.ToString();
            return pyRepr(v);
        }

        public static bool truthy(object v)
        {
            if (v == null) return false;
            if (v is bool b) return b;
            if (v is BigInteger i) return !i.IsZero;
            if (v is Dec d) return !d.IsZero();
            if (v is string s) return s.Length > 0;
            if (v is List<object> l) return l.Count > 0;
            if (v is Tuple t) return t.items.Count > 0;
            if (v is PyDict m) return m.Size > 0;
            return true;
        }

        public static bool yesNo(object v)
        {
            if (v is bool b) return b;
            throw KindMismatch("This needs a yes/no value, but it is " + describe(v) + ". Compare it instead, for example: is 0, is empty, is nothing.");
        }
        /** A value the compiler knows is yes/no. */
        public static bool B(object v) => (bool)v;

        public static Dec toDec(object x)
        {
            if (x is Dec d) return d;
            if (x is bool) throw KindMismatch("A yes/no value was used where a number was needed.");
            if (x is BigInteger i) return Dec.Int(i);
            if (x == null) throw KindMismatch("A value was nothing where a number was needed.");
            throw KindMismatch(describe(x) + " was used where a number was needed.");
        }

        static Dec moneyOther(object other, string verb)
        {
            if (other is Money m) return m.amount;
            if (isNumber(other) && numCmp(other, BigInteger.Zero) == 0) return Dec.Int(BigInteger.Zero);
            throw KindMismatch("I can't " + verb + " money and " + describe(other) + ". Write the number as money, for example $5.");
        }

        // ── Python operators ──────────────────────────────────────────────────────────────────────────────────────
        public static object pyLen(object v)
        {
            if (v is string s) return new BigInteger(chars(s).Count);
            if (v is List<object> l) return new BigInteger(l.Count);
            if (v is Tuple t) return new BigInteger(t.items.Count);
            if (v is PyDict m) return new BigInteger(m.Size);
            throw TypeErr("object of type '" + typeName(v) + "' has no len()");
        }

        /** Iterate the way the engine does: a list as it grows (Python's list iterator), text by code point, a map's keys. */
        public static IEnumerable<object> pyIter(object v)
        {
            if (v is List<object> l) return ListIter(l);
            if (v is Tuple t) return ListIter(t.items);
            if (v is string s) return chars(s).Cast<object>().ToList();
            if (v is PyDict m) return m.Keys();
            throw TypeErr("'" + typeName(v) + "' object is not iterable");
        }
        static IEnumerable<object> ListIter(List<object> l) { for (int i = 0; i < l.Count; i++) yield return l[i]; }
        public static List<object> pyList(object v) => pyIter(v).ToList();

        public static object add(object a, object b)
        {
            if (a is Money ma) return new Money(Dec.Add(ma.amount, moneyOther(b, "add")));
            if (b is Money mb) return new Money(Dec.Add(mb.amount, moneyOther(a, "add")));
            if (isIntLike(a) && isIntLike(b)) return asBig(a) + asBig(b);
            if (isNumLike(a) && isNumLike(b)) return Dec.Add(Dec.Of(a), Dec.Of(b));
            if (a is string sa) { if (b is string sb) return sa + sb; throw TypeErr("can only concatenate str (not \"" + typeName(b) + "\") to str"); }
            if (a is List<object> la) { if (b is List<object> lb) { var r = new List<object>(la); r.AddRange(lb); return r; } throw TypeErr("can only concatenate list (not \"" + typeName(b) + "\") to list"); }
            if (a is Tuple ta) { if (b is Tuple tb) { var r = new List<object>(ta.items); r.AddRange(tb.items); return new Tuple(r); } throw TypeErr("can only concatenate tuple (not \"" + typeName(b) + "\") to tuple"); }
            throw TypeErr("unsupported operand type(s) for +: '" + typeName(a) + "' and '" + typeName(b) + "'");
        }
        public static object sub(object a, object b)
        {
            if (a is Money ma) return new Money(Dec.Sub(ma.amount, moneyOther(b, "subtract")));
            if (b is Money mb) return new Money(Dec.Sub(moneyOther(a, "subtract"), mb.amount));
            if (isIntLike(a) && isIntLike(b)) return asBig(a) - asBig(b);
            if (isNumLike(a) && isNumLike(b)) return Dec.Sub(Dec.Of(a), Dec.Of(b));
            throw TypeErr("unsupported operand type(s) for -: '" + typeName(a) + "' and '" + typeName(b) + "'");
        }
        static object repeat(object seq, object n)
        {
            var big = asBig(n);
            int k = big > int.MaxValue ? int.MaxValue : big < 0 ? 0 : (int)big;
            if (seq is string s) { if (k <= 0) return ""; var sb = new StringBuilder(); for (int i = 0; i < k; i++) sb.Append(s); return sb.ToString(); }
            var l = (List<object>)seq; var out_ = new List<object>(); for (int i = 0; i < k; i++) out_.AddRange(l); return out_;
        }
        public static object mul(object a, object b)
        {
            if (a is Money ma) { if (b is Money) throw KindMismatch("Money can't be multiplied by money."); return new Money(Dec.Mul(ma.amount, toDec(b))); }
            if (b is Money mb) return new Money(Dec.Mul(mb.amount, toDec(a)));
            if (isIntLike(a) && isIntLike(b)) return asBig(a) * asBig(b);
            if (isNumLike(a) && isNumLike(b)) return Dec.Mul(Dec.Of(a), Dec.Of(b));
            bool seq(object x) => x is string || x is List<object>;
            if (seq(a)) { if (isIntLike(b)) return repeat(a, b); throw TypeErr("can't multiply sequence by non-int of type '" + typeName(b) + "'"); }
            if (seq(b)) { if (isIntLike(a)) return repeat(b, a); throw TypeErr("can't multiply sequence by non-int of type '" + typeName(a) + "'"); }
            throw TypeErr("unsupported operand type(s) for *: '" + typeName(a) + "' and '" + typeName(b) + "'");
        }
        public static object neg(object a)
        {
            if (a is Money m) return new Money(m.amount.Neg());
            if (isIntLike(a)) return -asBig(a);
            if (a is Dec d) return d.Neg();
            throw TypeErr("bad operand type for unary -: '" + typeName(a) + "'");
        }
        public static object intMod(object a, object b)
        {
            if (!isIntLike(a) || !isIntLike(b))
            {
                if (isNumLike(a) && isNumLike(b)) return modulo(a, b);
                throw TypeErr("unsupported operand type(s) for %: '" + typeName(a) + "' and '" + typeName(b) + "'");
            }
            var x = asBig(a); var y = asBig(b);
            if (y.IsZero) throw new PyErr("ZeroDivisionError", "integer modulo by zero");
            var r = BigInteger.Remainder(x, y);
            if (!r.IsZero && (r.Sign < 0) != (y.Sign < 0)) r += y;
            return r;
        }
        public static object divide(object a, object b)
        {
            if (a is Money ma)
            {
                if (b is Money mb) { if (mb.amount.IsZero()) throw DividedByZero("You divided by zero."); return Dec.Div(ma.amount, mb.amount); }
                var d = toDec(b);
                if (d.IsZero()) throw DividedByZero("You divided by zero.");
                return new Money(Dec.Div(ma.amount, d));
            }
            if (b is Money) throw KindMismatch("A plain number can't be divided by money.");
            var x = toDec(a); var y = toDec(b);
            if (y.IsZero()) throw DividedByZero("You divided by zero.");
            return Dec.Div(x, y);
        }
        public static object modulo(object a, object b)
        {
            bool money = a is Money;
            var x = money ? ((Money)a).amount : toDec(a);
            var y = b is Money mb ? mb.amount : toDec(b);
            if (y.IsZero()) throw DividedByZero("You divided by zero.");
            var r = Dec.Rem(x, y);
            if (!r.IsZero() && (r.s == 1) != (y.s == 1 && !y.IsZero())) r = Dec.Add(r, y);
            if (money) return new Money(r);
            return a is BigInteger && b is BigInteger ? (object)r.ToBigInt() : r;
        }
        public static object roundTo(object x, object places = null)
        {
            if (places == null) places = BigInteger.Zero;
            var pb = places is Dec pd ? pd.ToBigInt() : asBig(places);
            int p = (int)pb;
            if (x is Money m) return new Money(m.amount.QuantizeHalfUp(-p));
            if (x is BigInteger) return x;
            var d = toDec(x).QuantizeHalfUp(-p);
            return p == 0 ? (object)d.ToBigInt() : d;
        }

        public static bool eq(object a, object b)
        {
            if (same(a, b) && !(a is Dec)) return true;
            if (a is Money || b is Money)
            {
                var m = a is Money ? (Money)a : (Money)b; var o = a is Money ? b : a;
                if (o == null || o is string || o is bool) return false;
                return Dec.Cmp(m.amount, moneyOther(o, "compare")) == 0;
            }
            if (a == null || b == null) return false;
            if (isNumLike(a) && isNumLike(b)) return numCmp(a, b) == 0;
            if (a is string || b is string) return same(a, b);
            if (a is List<object> la && b is List<object> lb) { if (la.Count != lb.Count) return false; for (int i = 0; i < la.Count; i++) if (!(same(la[i], lb[i]) || eq(la[i], lb[i]))) return false; return true; }
            if (a is Tuple ta && b is Tuple tb) { if (ta.items.Count != tb.items.Count) return false; for (int i = 0; i < ta.items.Count; i++) if (!eq(ta.items[i], tb.items[i])) return false; return true; }
            if (a is PyDict da && b is PyDict db) return da.Size == db.Size && da.Entries().All(e => db.m.ContainsKey(PyDict.KeyOf(e[0])) && eq(e[1], db.m[PyDict.KeyOf(e[0])][1]));
            if (a is RecordVal ra && b is RecordVal rb) return ReferenceEquals(ra.cls, rb.cls) && ra.cls.fields.All(f => eq(ra.f.TryGetValue(f.py, out var x) ? x : null, rb.f.TryGetValue(f.py, out var y) ? y : null));
            if (a is PyDate pa && b is PyDate pb) return pa.Num() == pb.Num();
            return false;
        }

        static string flip(string op) => op == "<" ? ">" : op == ">" ? "<" : op == "<=" ? ">=" : op == ">=" ? "<=" : op;
        static bool holds(string op, int c) => op == "<" ? c < 0 : op == ">" ? c > 0 : op == "<=" ? c <= 0 : c >= 0;

        public static bool compare(string op, object a, object b)
        {
            if (op == "==") return eq(a, b);
            if (op == "!=") return !eq(a, b);
            if (a is Money || b is Money)
            {
                Money m; object o; string o2;
                if (a is Money am) { m = am; o = b; o2 = op; } else { m = (Money)b; o = a; o2 = flip(op); }
                if (o == null) throw TypeErr("'" + o2 + "' not supported between instances of 'decimal.Decimal' and 'NoneType'");
                return holds(o2, Dec.Cmp(m.amount, moneyOther(o, "compare")));
            }
            var c = order(a, b);
            if (c == null) throw TypeErr("'" + op + "' not supported between instances of '" + typeName(a) + "' and '" + typeName(b) + "'");
            return holds(op, c.Value);
        }
        static int? order(object a, object b)
        {
            if (isNumLike(a) && isNumLike(b)) return numCmp(a, b);
            if (a is string sa && b is string sb) return cmpStr(sa, sb);
            if (a is PyDate da && b is PyDate db) return Math.Sign(da.Num() - db.Num());
            var seqA = a is List<object> la ? la : a is Tuple ta ? ta.items : null;
            var seqB = b is List<object> lb ? lb : b is Tuple tb ? tb.items : null;
            if (seqA != null && seqB != null && (a is List<object>) == (b is List<object>))
            {
                for (int i = 0; i < Math.Min(seqA.Count, seqB.Count); i++)
                {
                    if (eq(seqA[i], seqB[i])) continue;
                    return compare("<", seqA[i], seqB[i]) ? -1 : 1;
                }
                return Math.Sign(seqA.Count - seqB.Count);
            }
            return null;
        }
        static int cmpStr(string a, string b)
        {
            var x = chars(a); var y = chars(b);
            for (int i = 0; i < Math.Min(x.Count, y.Count); i++) { int d = cp(x[i]) - cp(y[i]); if (d != 0) return Math.Sign(d); }
            return Math.Sign(x.Count - y.Count);
        }

        public static bool contains(object container, object item)
        {
            if (container is string s)
            {
                if (!(item is string si)) throw TypeErr("'in <string>' requires string as left operand, not " + typeName(item));
                return s.Contains(si, StringComparison.Ordinal);
            }
            if (container is PyDict m) return m.Has(item);
            if (container is List<object> l) return l.Any(x => same(x, item) || eq(x, item));
            if (container is Tuple t) return t.items.Any(x => eq(x, item));
            throw TypeErr("argument of type '" + typeName(container) + "' is not iterable");
        }

        sealed class Keyed { public object v; public object k; public int i; }
        public static List<object> pySort(List<object> items, Func<object, object> key, bool reverse)
        {
            var keyed = items.Select((v, i) => new Keyed { v = v, k = key != null ? key(v) : v, i = i }).ToArray();
            V8Sort.Sort(keyed, (x, y) =>
            {
                if (compare("<", reverse ? y.k : x.k, reverse ? x.k : y.k)) return -1;
                if (compare("<", reverse ? x.k : y.k, reverse ? y.k : x.k)) return 1;
                return x.i - y.i;
            });
            return keyed.Select(x => x.v).ToList();
        }

        public static PyErr attrErr(object v, string name) => new PyErr("AttributeError", "'" + typeName(v) + "' object has no attribute '" + name + "'");
        public static string strMethod(object v, string name) { if (!(v is string s)) throw attrErr(v, name); return s; }

        // ── JSON, the way Python's json module reads and writes it ──────────────────────────────────────────────────
        sealed class JsonError : Exception { public int pos; public JsonError(string m, int p) : base(m) { pos = p; } }
        static readonly System.Text.RegularExpressions.Regex JNUM = new System.Text.RegularExpressions.Regex(@"\G-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?");
        static bool isHex4(string s, int at) { if (at + 4 > s.Length) return false; for (int k = at; k < at + 4; k++) if (!Uri.IsHexDigit(s[k])) return false; return true; }
        static string fromCodePoint(int c) => c >= 0xd800 && c <= 0xdfff ? ((char)c).ToString() : char.ConvertFromUtf32(c);
        public static object jsonParse(string s)
        {
            int n = s.Length;
            int ws(int i) { while (i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++; return i; }
            (string, int) str(int begin)
            {
                int i = begin + 1; var sb = new StringBuilder();
                for (; ; )
                {
                    if (i >= n) throw new JsonError("Unterminated string starting at", begin);
                    char ch = s[i];
                    if (ch == '"') return (sb.ToString(), i + 1);
                    if (ch < 0x20) throw new JsonError("Invalid control character at", i);
                    if (ch != '\\') { sb.Append(ch); i++; continue; }
                    if (i + 1 >= n) throw new JsonError("Unterminated string starting at", begin);
                    char esc = s[i + 1];
                    string simple = esc == '"' ? "\"" : esc == '\\' ? "\\" : esc == '/' ? "/" : esc == 'b' ? "\b" : esc == 'f' ? "\f" : esc == 'n' ? "\n" : esc == 'r' ? "\r" : esc == 't' ? "\t" : null;
                    if (simple != null) { sb.Append(simple); i += 2; continue; }
                    if (esc != 'u') throw new JsonError("Invalid \\escape", i);
                    if (!isHex4(s, i + 2)) throw new JsonError("Invalid \\uXXXX escape", i + 1);
                    int c = Convert.ToInt32(s.Substring(i + 2, 4), 16);
                    i += 6;
                    if (c >= 0xd800 && c <= 0xdbff && i + 1 < n && s[i] == '\\' && s[i + 1] == 'u' && isHex4(s, i + 2))
                    {
                        int lo = Convert.ToInt32(s.Substring(i + 2, 4), 16);
                        if (lo >= 0xdc00 && lo <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i += 6; }
                    }
                    sb.Append(fromCodePoint(c));
                }
            }
            (object, int) value(int i)
            {
                if (i >= n) throw new JsonError("Expecting value", i);
                char ch = s[i];
                if (ch == '"') { var (v, e) = str(i); return (v, e); }
                if (ch == '{') return obj(i + 1);
                if (ch == '[') return arr(i + 1);
                if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) return (null, i + 4);
                if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) return (true, i + 4);
                if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) return (false, i + 5);
                var m = JNUM.Match(s, i);
                if (m.Success && m.Index == i && m.Length > 0)
                {
                    if (m.Groups[1].Success || m.Groups[2].Success) return (Dec.Parse(m.Value), i + m.Length);
                    return (BigInteger.Parse(m.Value), i + m.Length);
                }
                throw new JsonError("Expecting value", i);
            }
            (object, int) obj(int i)
            {
                var d = new PyDict();
                i = ws(i);
                if (i < n && s[i] == '}') return (d, i + 1);
                for (; ; )
                {
                    if (i >= n || s[i] != '"') throw new JsonError("Expecting property name enclosed in double quotes", i);
                    var (k, i2) = str(i); i = ws(i2);
                    if (i >= n || s[i] != ':') throw new JsonError("Expecting ':' delimiter", i);
                    i = ws(i + 1);
                    var (v, i3) = value(i); i = i3;
                    d.Set(k, v);
                    i = ws(i);
                    if (i < n && s[i] == '}') return (d, i + 1);
                    if (i >= n || s[i] != ',') throw new JsonError("Expecting ',' delimiter", i);
                    int comma = i;
                    i = ws(i + 1);
                    if (i < n && s[i] == '}') throw new JsonError("Illegal trailing comma before end of object", comma);
                }
            }
            (object, int) arr(int i)
            {
                var out_ = new List<object>();
                i = ws(i);
                if (i < n && s[i] == ']') return (out_, i + 1);
                for (; ; )
                {
                    var (v, i2) = value(i); i = i2;
                    out_.Add(v);
                    i = ws(i);
                    if (i < n && s[i] == ']') return (out_, i + 1);
                    if (i >= n || s[i] != ',') throw new JsonError("Expecting ',' delimiter", i);
                    int comma = i;
                    i = ws(i + 1);
                    if (i < n && s[i] == ']') throw new JsonError("Illegal trailing comma before end of array", comma);
                }
            }
            try
            {
                var (v, end) = value(ws(0));
                end = ws(end);
                if (end != n) throw new JsonError("Extra data", end);
                return v;
            }
            catch (JsonError e)
            {
                var before = s.Substring(0, Math.Min(e.pos, s.Length));
                int line = before.Count(ch => ch == '\n') + 1;
                int col = e.pos - before.LastIndexOf('\n');
                throw ConversionFailed("This is not JSON: " + e.Message + " (line " + line + ", column " + col + ").");
            }
        }
        static object jsonReady(object v)
        {
            if (v == null || v is bool || v is string || v is BigInteger || v is Dec) return v;
            if (v is Money) throw KindMismatch("Money has no JSON form of its own: use its amount, for example price's amount.");
            if (v is List<object> l) return l.Select(jsonReady).ToList();
            if (v is Tuple t) return t.items.Select(jsonReady).ToList();
            if (v is PyDict m)
            {
                var out_ = new PyDict();
                foreach (var e in m.Entries()) { if (!(e[0] is string)) throw KindMismatch("A JSON object's keys are text, but one is " + describe(e[0]) + "."); out_.Set(e[0], jsonReady(e[1])); }
                return out_;
            }
            if (v is RecordVal r) { var out_ = new PyDict(); foreach (var f in r.cls.fields) out_.Set(f.py, jsonReady(r.f.TryGetValue(f.py, out var x) ? x : null)); return out_; }
            throw KindMismatch(describe(v) + " has no JSON form.");
        }
        static string jsonStr(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (var ch in chars(s))
            {
                int c = cp(ch);
                if (ch == "\"") sb.Append("\\\"");
                else if (ch == "\\") sb.Append("\\\\");
                else if (ch == "\n") sb.Append("\\n");
                else if (ch == "\r") sb.Append("\\r");
                else if (ch == "\t") sb.Append("\\t");
                else if (ch == "\b") sb.Append("\\b");
                else if (ch == "\f") sb.Append("\\f");
                else if (c >= 0x20 && c <= 0x7e) sb.Append(ch);
                else if (c > 0xffff) { int v = c - 0x10000; sb.Append("\\u").Append((0xd800 + (v >> 10)).ToString("x")).Append("\\u").Append((0xdc00 + (v & 0x3ff)).ToString("x")); }
                else sb.Append("\\u").Append(c.ToString("x4"));
            }
            return sb.Append('"').ToString();
        }
        public static string jsonText(object v)
        {
            string w(object x)
            {
                if (x == null) return "null";
                if (x is bool b) return b ? "true" : "false";
                if (x is BigInteger i) return i.ToString();
                if (x is Dec d) { var t = d.ToString(); return d.IsIntegral() && t.Contains('E') ? d.ToFixed() : t; }
                if (x is string s) return jsonStr(s);
                if (x is List<object> l) return "[" + string.Join(", ", l.Select(w)) + "]";
                var m = (PyDict)x;
                return "{" + string.Join(", ", m.Entries().Select(e => jsonStr((string)e[0]) + ": " + w(e[1]))) + "}";
            }
            return w(jsonReady(v));
        }

        // ── Helpers the generated code calls ─────────────────────────────────────────────────────────────────────
        public static object I(string text) => BigInteger.Parse(text);
        public static object dec(string text) => Dec.Parse(text);
        public static object money(string text) => Money.Of(text);
        public static object today() => PyDate.Today();
        public static object date(string text) { var d = PyDate.Parse(text); if (d == null) throw new PyErr("ValueError", "Invalid isoformat string: '" + text + "'"); return d; }
        public static object newMap() => new PyDict();
        public static object list(params object[] items) => items == null ? new List<object> { null } : new List<object>(items);
        public static List<object> filter(IEnumerable<object> items, Func<object, bool> keep) { var out_ = new List<object>(); foreach (var x in items) if (keep(x)) out_.Add(x); return out_; }
        public static List<object> map(IEnumerable<object> items, Func<object, object> get) { var out_ = new List<object>(); foreach (var x in items) out_.Add(get(x)); return out_; }
        public static void discard(object v) { }
        public static bool at(Frame F, int line) { F.line = line; return true; }

        public static BigInteger rangeInt(object v)
        {
            if (v is BigInteger i) return i;
            if (v is bool b) return b ? BigInteger.One : BigInteger.Zero;
            throw TypeErr("'" + (v is Dec ? "decimal.Decimal" : v == null ? "NoneType" : v is Money ? "Money" : v is string ? "str" : "object") + "' object cannot be interpreted as an integer");
        }
        public static List<object> unpack2(object el)
        {
            List<object> items = el is List<object> l ? l : el is Tuple t ? t.items : el is string s ? chars(s).Cast<object>().ToList() : el is PyDict m ? m.Keys() : null;
            if (items == null) throw TypeErr("cannot unpack non-iterable " + (el == null ? "NoneType" : isInt(el) ? "int" : el is Dec ? "decimal.Decimal" : el is bool ? "bool" : "object") + " object");
            if (items.Count < 2) throw new PyErr("ValueError", "not enough values to unpack (expected 2, got " + items.Count + ")");
            if (items.Count > 2) throw new PyErr("ValueError", "too many values to unpack (expected 2, got " + items.Count + ")");
            return items;
        }
        public static List<object> mapItems(object m) { if (!(m is PyDict d)) throw attrErr(m, "items"); return d.Items(); }
        public static List<object> pairsOf(object c) => c is PyDict d ? d.Items() : pyList(c);
        public static object tupleAt(object t, int i) => ((Tuple)t).items[i];

        static readonly object NO_DEFAULT = new object();
        public static object itemAt(object items, object position) => itemAt(items, position, NO_DEFAULT);
        public static object itemAt(object items, object position, object dflt)
        {
            if (!(position is BigInteger pos)) throw KindMismatch("A position in a list is a whole number, not " + describe(position) + ".");
            var list_ = items is List<object> l ? l : items is Tuple t ? t.items : null;
            if (list_ == null) throw TypeErr("object of type '" + (items == null ? "NoneType" : "object") + "' has no len()");
            if (pos >= 1 && pos <= list_.Count) return list_[(int)pos - 1];
            if (!ReferenceEquals(dflt, NO_DEFAULT)) return dflt;
            throw MissingValue("There is no item " + pos + ": the list has " + list_.Count + " item" + (list_.Count == 1 ? "" : "s") + ".");
        }
        public static void setItem(object items, object position, object value) { itemAt(items, position); ((List<object>)items)[(int)(BigInteger)position - 1] = value; }
        public static void mapSet(object m, object k, object v)
        {
            if (m is PyDict d) { d.Set(k, v); return; }
            if (m == null) throw TypeErr("'NoneType' object does not support item assignment");
            if (m is List<object>) { setItem(m, k, v); return; }
            throw TypeErr("'" + (m is Money ? "Money" : "object") + "' object does not support item assignment");
        }
        public static void setEntry(object c, object k, object v)
        {
            if (c is List<object>) setItem(c, k, v);
            else if (c is PyDict d) d.Set(k, v);
            else if (c == null) throw MissingValue("This value is nothing, so it has no entry for " + show(k) + ".");
            else throw KindMismatch(describe(c) + " has no entries that can be changed.");
        }
        public static object entry(object c, object k) => entry(c, k, NO_DEFAULT);
        public static object entry(object c, object k, object dflt)
        {
            if (c is List<object> || c is Tuple) return itemAt(c, k, dflt);
            if (c is PyDict d) { if (d.Has(k)) return d.Get(k); if (!ReferenceEquals(dflt, NO_DEFAULT)) return dflt; throw MissingValue("There is no entry for " + show(k) + "."); }
            if (c == null) throw MissingValue("This value is nothing, so it has no entry for " + show(k) + ".");
            throw KindMismatch(describe(c) + " has no entries.");
        }
        public static object mapGet(object m, object k) => mapGet(m, k, NO_DEFAULT);
        public static object mapGet(object m, object k, object dflt)
        {
            bool has = !ReferenceEquals(dflt, NO_DEFAULT);
            if (m is PyDict d) { if (d.Has(k)) return d.Get(k); if (has) return dflt; throw new PyErr("KeyError", pyStr(k), new[] { k }); }
            if (m == null) throw has ? (Exception)attrErr(m, "get") : TypeErr("'NoneType' object is not subscriptable");
            if (has) throw attrErr(m, "get");
            if (m is List<object> l)
            {
                if (k is BigInteger kb && kb >= -l.Count && kb < l.Count) { int i = (int)kb; return l[i < 0 ? l.Count + i : i]; }
                throw new PyErr("IndexError", "list index out of range");
            }
            throw TypeErr("'" + (m is Money ? "Money" : "object") + "' object is not subscriptable");
        }

        public static object getAttr(object obj, string name)
        {
            if (obj is RecordVal r && r.f.ContainsKey(name)) return r.f[name];
            if (obj is Money m && name == "amount") return m.amount;
            throw attrErr(obj, name);
        }
        public static void setAttr(object obj, string name, object value)
        {
            if (obj is RecordVal rec)
            {
                if (rec.cls.rules != null && rec.cls.rules.TryGetValue(name, out var rs)) foreach (var r in rs) never(r.cond(value), r.text, r.line, value);
                rec.f[name] = value; return;
            }
            if (obj is Money) throw new PyErr("AttributeError", "Money cannot be changed; make new money instead.");
            throw attrErr(obj, name);
        }
        static string[] fieldNames(string key) => new[] { key, key.Replace(" ", "_"), key.ToLowerInvariant(), key.ToLowerInvariant().Replace(" ", "_") };
        public static object getField(object obj, string key)
        {
            if (obj == null) throw MissingValue("This value is nothing, so it has no " + key + ".");
            var names = fieldNames(key);
            if (obj is PyDict d)
            {
                foreach (var k in names) if (d.Has(k)) return d.Get(k);
                foreach (var e in d.Entries()) if (pyStrip(pyStr(e[0])).ToLowerInvariant() == key.ToLowerInvariant()) return e[1];
                throw MissingValue("There is no field \"" + key + "\". Fields here: " + string.Join(", ", d.Keys().Select(pyStr)) + ".");
            }
            foreach (var k in names)
            {
                if (obj is RecordVal r && r.f.ContainsKey(k)) return r.f[k];
                if (obj is Money m && k == "amount") return m.amount;
            }
            throw MissingValue(describe(obj) + " has no field \"" + key + "\".");
        }
        public static void setField(object obj, string key, object value)
        {
            if (obj is PyDict d) { d.Set(key, value); return; }
            foreach (var k in fieldNames(key)) if (obj is RecordVal r && r.f.ContainsKey(k)) { setAttr(obj, k, value); return; }
            throw MissingValue(describe(obj) + " has no field \"" + key + "\".");
        }

        public static object addTo(object target, object value) { if (target is List<object> l) { l.Add(value); return l; } return add(target, value); }
        public static void appendTo(object target, object value) { if (!(target is List<object> l)) throw attrErr(target, "append"); l.Add(value); }
        public static void removeFrom(object target, object value)
        {
            if (target is PyDict d) { if (!d.Has(value)) throw MissingValue("There is no entry for " + show(value) + " to remove."); d.Delete(value); return; }
            if (!contains(target, value)) throw MissingValue(show(value) + " is not in the list, so it can't be removed.");
            if (!(target is List<object> l)) throw attrErr(target, "remove");
            l.RemoveAt(l.FindIndex(x => same(x, value) || eq(x, value)));
        }
        public static void sortInPlace(object target, Func<object, object> key, bool desc)
        {
            if (!(target is List<object> l)) throw attrErr(target, "sort");
            var sorted = pySort(l, key, desc);
            l.Clear(); l.AddRange(sorted);
        }
        public static void reverseInPlace(object target) { if (!(target is List<object> l)) throw attrErr(target, "reverse"); l.Reverse(); }

        public static RecordKind recordKind(string py, FieldDef[] fields, Dictionary<string, Rule[]> rules = null) => new RecordKind { py = py, fields = fields.ToList(), rules = rules ?? new Dictionary<string, Rule[]>() };
        public static FieldDef field(string py, string k) => new FieldDef(py, k);
        public static object newRecord(object kind, params object[] pairs)
        {
            var cls = (RecordKind)kind;
            var given = new Dictionary<string, object>();
            for (int i = 0; i + 1 < pairs.Length; i += 2) given[(string)pairs[i]] = pairs[i + 1];
            var rec = new RecordVal(cls);
            var missing = cls.fields.Where(f => !given.ContainsKey(f.py) && f.k != "optional" && f.k != "list" && f.k != "map").ToList();
            if (missing.Count > 0) throw TypeErr(cls.py + ".__init__() missing " + missing.Count + " required keyword-only argument" + (missing.Count == 1 ? "" : "s") + ": " + string.Join(missing.Count == 2 ? " and " : ", ", missing.Select(f => "'" + f.py + "'")));
            foreach (var f in cls.fields)
            {
                object v = given.ContainsKey(f.py) ? given[f.py] : f.k == "optional" ? null : f.k == "list" ? new List<object>() : (object)new PyDict();
                setAttr(rec, f.py, v);
            }
            return rec;
        }

        public static void never(object cond, string text, int line, object value)
        {
            if (truthy(cond)) throw RuleBroken(text + " (the rule on line " + line + "), but the value is " + show(value) + ".");
        }

        public static object applyOp(string op, object a)
        {
            switch (op)
            {
                case "sum": return totalOf(pyList(a));
                case "average": { var items = pyList(a); if (items.Count == 0) throw MissingValue("I can't take the average of an empty list."); return divide(totalOf(items), new BigInteger(items.Count)); }
                case "count": case "length": return pyLen(a);
                case "min": { var items = pyList(a); if (items.Count == 0) throw MissingValue("An empty list has no smallest item."); var best = items[0]; for (int i = 1; i < items.Count; i++) if (compare("<", items[i], best)) best = items[i]; return best; }
                case "max": { var items = pyList(a); if (items.Count == 0) throw MissingValue("An empty list has no largest item."); var best = items[0]; for (int i = 1; i < items.Count; i++) if (compare(">", items[i], best)) best = items[i]; return best; }
                case "first": { var items = pyList(a); if (items.Count == 0) throw MissingValue("An empty list has no first item."); return items[0]; }
                case "last": { var items = pyList(a); if (items.Count == 0) throw MissingValue("An empty list has no last item."); return items[items.Count - 1]; }
                case "words": return pySplit(pyStr(a)).Select(p => (object)stripPunct((string)p)).Where(p => (string)p != "").ToList();
                case "lines": return splitLines(strMethod(a, "splitlines"));
                case "lowercase": return jsLower(strMethod(a, "lower"));
                case "uppercase": return jsUpper(strMethod(a, "upper"));
                case "trimmed": return pyStrip(strMethod(a, "strip"));
                case "parts": return pySplit(textOf(a, "\"the parts of\""));
                case "abs":
                    {
                        if (a is Money m) return new Money(m.amount.Abs());
                        if (a is bool || !isNumber(a)) throw KindMismatch("\"the absolute value of\" needs a number or money, but it is " + describe(a) + ".");
                        return a is BigInteger i ? (object)BigInteger.Abs(i) : ((Dec)a).Abs();
                    }
                case "jsonText": return jsonText(a);
                case "jsonData": return jsonParse(textOf(a, "\"the JSON data in\""));
                case "keys": if (!(a is PyDict dk)) throw attrErr(a, "keys"); return dk.Keys();
                case "values": if (!(a is PyDict dv)) throw attrErr(a, "values"); return dv.Values();
                default: throw new PyErr("NameError", "name '" + op + "' is not defined");
            }
        }
        public static bool affix(object t, object a, bool end)
        {
            var what = end ? "\"ends with\"" : "\"starts with\"";
            var ts = textOf(t, what); var as_ = textOf(a, what);
            return end ? ts.EndsWith(as_, StringComparison.Ordinal) : ts.StartsWith(as_, StringComparison.Ordinal);
        }
        public static bool between(object lo, object v, Func<object> hi) { if (!compare("<=", lo, v)) return false; return compare("<=", v, hi()); }
        public static bool isIn(object item, object container) => contains(container, item);

        public static object readText(object path)
        {
            if (!(path is string p)) throw TypeErr("expected str, bytes or os.PathLike object, not " + (path == null ? "NoneType" : "object"));
            var full = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), p));
            if (Directory.Exists(full)) throw new PyErr("IsADirectoryError", "EISDIR: illegal operation on a directory, read");
            if (!File.Exists(full)) throw MissingValue("There is no file \"" + p + "\" (looked in the folder the program runs in).");
            try { return new UTF8Encoding(false).GetString(File.ReadAllBytes(full)); }
            catch (Exception e) { throw new PyErr("OSError", e.Message); }
        }

        public static void expectTrue(object v, string text) { if (!(v is bool b && b)) throw ExpectationFailed(text + ", but it was not true."); }
        public static void expectFailure(Action run, string text, object msg)
        {
            try { run(); }
            catch (Exception e)
            {
                var err = asPyErr(e);
                if (err.thunder && msg != null)
                {
                    if (!(msg is string ms)) throw TypeErr("'in <string>' requires string as left operand, not " + (msg is BigInteger ? "int" : "object"));
                    if (!err.Message.Contains(ms, StringComparison.Ordinal)) throw ExpectationFailed(text + ", but it failed with \"" + err.Message + "\".");
                }
                return;
            }
            throw ExpectationFailed(text + ", but it did not fail.");
        }
        static readonly Dictionary<string, Func<object, object, bool>> CHECKS = new Dictionary<string, Func<object, object, bool>>
        {
            ["is"] = (a, b) => eq(a, b),
            ["is not"] = (a, b) => !eq(a, b),
            ["at least"] = (a, b) => compare(">=", a, b),
            ["at most"] = (a, b) => compare("<=", a, b),
            ["more than"] = (a, b) => compare(">", a, b),
            ["less than"] = (a, b) => compare("<", a, b),
            ["nothing"] = (a, b) => a == null,
            ["not nothing"] = (a, b) => a != null,
            ["empty"] = (a, b) => eq(pyLen(a), BigInteger.Zero),
            ["positive"] = (a, b) => compare(">", a, BigInteger.Zero),
            ["negative"] = (a, b) => compare("<", a, BigInteger.Zero),
            ["zero"] = (a, b) => eq(a, BigInteger.Zero),
            ["between"] = (a, b) => compare("<=", ((List<object>)b)[0], a) && compare("<=", a, ((List<object>)b)[1]),
            ["in"] = (a, b) => contains(b, a),
            ["contains"] = (a, b) => contains(a, b),
        };
        public static void expectValue(object actual, string full, string op, object want, string text)
        {
            bool ok = CHECKS.TryGetValue(full, out var known) ? known(actual, want) : !CHECKS[op](actual, want);
            if (!ok) throw ExpectationFailed(text + ", but it was " + show(actual) + ".");
        }

        public static string describeError(TErr e)
        {
            var where_ = e.where ?? new List<Where>();
            var inner = where_.Count > 0 ? where_[where_.Count - 1] : null;
            var message = explain(e);
            var code = codeOf(e);
            if (code == "TC508" && !e.thunder) message = "Python code used by this line failed: " + message;
            var place = inner != null ? inner.file + ", line " + inner.line : "In the program";
            var callers = where_.Take(Math.Max(0, where_.Count - 1)).Select(f => f.line.ToString()).ToList();
            if (callers.Count > 0 && inner != null) { callers.Reverse(); place += " (reached from line " + string.Join(", then line ", callers) + ")"; }
            return place + ": " + message + "  [" + code + "]";
        }

        // ── conversions and text helpers ────────────────────────────────────────────────────────────────────────────
        static readonly System.Text.RegularExpressions.Regex NUMBER = new System.Text.RegularExpressions.Regex(@"^[+-]?([0-9][0-9_]*)(\.[0-9]+)?$");
        public static object toNumber(object x)
        {
            if (isNumber(x)) return x;
            if (x is Money m) return m.amount;
            if (x is string str)
            {
                var s = pyStrip(str).Replace(",", "");
                if (NUMBER.IsMatch(s)) return s.Contains('.') ? (object)Dec.Parse(s) : BigInteger.Parse(s.Replace("_", ""));
            }
            throw ConversionFailed(describe(x) + " is not a number.");
        }
        public static object toWhole(object x)
        {
            var n = toNumber(x);
            if (n is BigInteger) return n;
            var d = (Dec)n;
            if (d.IsIntegral()) return d.ToBigInt();
            throw ConversionFailed(show(d) + " is not a whole number.");
        }
        public static object toMoney(object x)
        {
            if (x is Money) return x;
            if (x is string str)
            {
                var s = pyStrip(str).Replace(",", "");
                bool negative = s.StartsWith("-");
                s = s.TrimStart('-').TrimStart('$');
                if (NUMBER.IsMatch(s)) return Money.Of((negative ? "-" : "") + s);
                throw ConversionFailed(describe(x) + " is not an amount of money.");
            }
            return new Money(toDec(toNumber(x)));
        }
        public static object toYesNo(object x)
        {
            if (x is bool) return x;
            if (x is string s) { var t = pyStrip(s).ToLowerInvariant(); if (t == "yes" || t == "true") return true; if (t == "no" || t == "false") return false; }
            throw ConversionFailed(describe(x) + " is not yes or no.");
        }
        public static object toDate(object x)
        {
            if (x is PyDate) return x;
            var d = PyDate.Parse(pyStrip(pyStr(x)));
            if (d != null) return d;
            throw ConversionFailed(describe(x) + " is not a date (write it as YYYY-MM-DD).");
        }
        public static object totalOf(List<object> items)
        {
            if (items.Count == 0) return BigInteger.Zero;
            var result = items[0];
            for (int i = 1; i < items.Count; i++) result = add(result, items[i]);
            return result;
        }
        public static string textOf(object v, string what)
        {
            if (!(v is string s)) throw KindMismatch(what + " needs text, but it is " + describe(v) + ".");
            return s;
        }
        public static object joined(object items, object sep)
        {
            var sp = textOf(sep, "\"joined with\"");
            var out_ = new List<string>(); int i = 0;
            foreach (var x in pyIter(items))
            {
                if (!(x is string s)) throw KindMismatch("\"joined with\" joins text, but item " + (i + 1) + " is " + describe(x) + ". Turn it into text first.");
                out_.Add(s); i++;
            }
            return string.Join(sp, out_);
        }
        public static object splitAt(object text, object sep)
        {
            var sp = textOf(sep, "\"split at\"");
            if (sp == "") throw KindMismatch("\"split at\" needs something to split at, not empty text.");
            return textOf(text, "\"split at\"").Split(sp).Cast<object>().ToList();
        }
        public static object replacing(object text, object old, object nw)
        {
            var o = textOf(old, "\"replacing\"");
            if (o == "") throw KindMismatch("\"replacing\" needs something to replace, not empty text.");
            var t = textOf(text, "\"replacing\"");
            return string.Join(textOf(nw, "\"replacing … with\""), t.Split(o));
        }
        static readonly HashSet<string> PUNCT = new HashSet<string>(chars(".,;:!?\"'()[]{}<>“”‘’…-"));
        public static string stripPunct(string w)
        {
            var a = chars(w); int i = 0, j = a.Count;
            while (i < j && PUNCT.Contains(a[i])) i++;
            while (j > i && PUNCT.Contains(a[j - 1])) j--;
            return string.Concat(a.Skip(i).Take(j - i));
        }

        // ── Running compiled C#: frames (for error lines), output, and the program or its tests ────────────────────
        static readonly List<Frame> frames = new List<Frame>();
        static bool aborted;
        static StreamWriter stdout, stderr;
        static int exitCode;
        static List<Where> snapshot() => frames.Select(f => new Where(f.file, f.line)).ToList();

        public static Frame enterFrame(string file, int line)
        {
            if (frames.Count >= MAX_FRAMES) throw new PyErr("RecursionError", "maximum recursion depth exceeded");
            var f = new Frame(file, line); frames.Add(f); return f;
        }
        public static Frame enterCall(string file, int line, int first)
        {
            if (frames.Count >= MAX_FRAMES)
            {
                var err = new PyErr("RecursionError", "maximum recursion depth exceeded");
                if (first >= 0) { var w = snapshot(); w.Add(new Where(file, first)); err.where = w; }
                throw err;
            }
            var f = new Frame(file, line); frames.Add(f); return f;
        }
        public static void leave() { frames.RemoveAt(frames.Count - 1); }
        public static Frame topFrame() => frames[frames.Count - 1];
        public static Exception fail(Exception e) { var err = asPyErr(e); if (err.where == null) err.where = snapshot(); return err; }
        static object withFrame(Frame frame, Func<object> fn)
        {
            if (frames.Count >= MAX_FRAMES) throw new PyErr("RecursionError", "maximum recursion depth exceeded");
            frames.Add(frame);
            try { return fn(); } catch (Exception e) { throw fail(e); } finally { frames.RemoveAt(frames.Count - 1); }
        }
        public static Func<object, object> keyAt(Frame F, Func<object, object> get)
        {
            var frame = new Frame(F.file, F.line);
            return item => withFrame(frame, () => get(item));
        }

        public static void say(string text) { stdout.Write(text); stdout.Write('\n'); }
        static void report(Exception e) { stderr.Write(describeError(asPyErr(e))); stderr.Write('\n'); exitCode = 1; aborted = true; }

        /** Work out a file's kept values; an error stops the program with a Thunder message. */
        public static void init(string file, Action<Frame> fn)
        {
            if (aborted) return;
            var F = new Frame(file, 0);
            try { withFrame(F, () => { fn(F); return null; }); } catch (Exception e) { report(e); }
        }
        public static void run(Action main) { if (aborted) return; try { main(); } catch (Exception e) { report(e); } }
        public static void runTests((string file, (string title, Action fn, int line)[] tests)[] modules)
        {
            if (aborted) return;
            int passed = 0, failed = 0;
            foreach (var (file, tests) in modules)
                foreach (var (title, fn, line) in tests)
                {
                    try { fn(); passed++; say("PASS  " + title + " (" + file + ", line " + line + ")"); }
                    catch (Exception e) { failed++; say("FAIL  " + title + " (" + file + ", line " + line + ")"); say("      " + describeError(asPyErr(e))); }
                }
            int total = passed + failed;
            say(total + " test" + (total == 1 ? "" : "s") + ": " + passed + " passed, " + failed + " failed");
            if (failed > 0) exitCode = 1;
        }

        /** Run a program on a thread with a deep stack (as deep as Python lets calls nest), then exit with its status. */
        public static int Start(Action body)
        {
            stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false };
            stderr = new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = false };
            frames.Clear(); aborted = false; exitCode = 0;
            Exception crash = null;
            var th = new Thread(() => { try { body(); } catch (Exception e) { crash = e; } }, 1024 * 1024 * 1024);
            th.Start(); th.Join();
            stdout.Flush(); stderr.Flush();
            if (crash != null) { Console.Error.WriteLine("The compiled program failed: " + crash); return 70; }
            return exitCode;
        }
    }
}
