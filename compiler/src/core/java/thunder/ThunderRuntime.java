// ThunderRuntime.java: written by the Thunder compiler next to compiled Java. Standard library only (JDK 17+).
// The values and rules here are the Thunder engine's own (engine-values.mjs), line for line, so compiled Java, the
// Thunder engine, compiled TypeScript, and compiled Python say the same thing for the same program.
//
// Values:   whole number -> BigInteger      decimal number -> Dec (exact, like Python's Decimal)
//           money -> Money                  text -> String      yes/no -> Boolean      nothing -> null
//           list -> ArrayList (a pair from a map is a Tuple)    map -> PyDict
//           record -> RecordVal             date -> PyDate
package thunder;

import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ThunderRuntime {
  protected ThunderRuntime() {}

  // ── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Where an error happened: a file and a Thunder line. */
  public static final class Where {
    public final String file; public final int line;
    public Where(String file, int line) { this.file = file; this.line = line; }
  }

  /**
   * A Thunder error (thunder = true: code TC5xx, message in words) or an error Python itself raises (TypeError,
   * KeyError, ...), with Python's own message.
   */
  public static final class TErr extends RuntimeException {
    public final String pyType; public final String code; public final boolean thunder; public final List<Object> args;
    public List<Where> where;
    TErr(String code, String message, String pyType, boolean thunder, List<Object> args) {
      super(message, null, false, false);
      this.code = code; this.pyType = pyType; this.thunder = thunder; this.args = args;
    }
  }
  static TErr thunderErr(String code, String m, String pyType) { return new TErr(code, m, pyType, true, null); }
  public static TErr Stop(Object m) { return thunderErr("TC507", (String) m, "Stop"); }
  static TErr RuleBroken(String m) { return thunderErr("TC504", m, "RuleBroken"); }
  static TErr ExpectationFailed(String m) { return thunderErr("TC505", m, "ExpectationFailed"); }
  static TErr KindMismatch(String m) { return thunderErr("TC506", m, "TypeError"); }
  static TErr ConversionFailed(String m) { return thunderErr("TC509", m, "ValueError"); }
  static TErr MissingValue(String m) { return thunderErr("TC503", m, "LookupError"); }
  static TErr DividedByZero(String m) { return thunderErr("TC501", m, "ZeroDivisionError"); }
  static TErr PyErr(String pyType, String m) { return new TErr(null, m, pyType, false, Collections.singletonList(m)); }
  static TErr PyErr(String pyType, String m, List<Object> args) { return new TErr(null, m, pyType, false, args); }
  static TErr TypeErr(String m) { return PyErr("TypeError", m); }

  /** explain(error) in thunder_runtime.py: the error as a sentence. */
  public static String explain(TErr e) {
    if (e.thunder) return e.getMessage();
    String t = e.pyType, m = e.getMessage();
    if (t.equals("ZeroDivisionError") || t.equals("DivisionByZero")) return "You divided by zero.";
    if (t.equals("InvalidOperation")) return "This calculation has no answer (for example, zero divided by zero).";
    if (t.equals("KeyError")) return "There is no entry for " + show(e.args.isEmpty() ? null : e.args.get(0)) + ".";
    if ((t.equals("TypeError") || t.equals("AttributeError")) && m.contains("NoneType")) return "A value was nothing where a value was needed.";
    if (t.equals("TypeError")) return "Values of different kinds were mixed (" + m + ").";
    if (t.equals("RecursionError")) return "A function called itself too many times.";
    return t + ": " + m;
  }

  /** _code(error) in thunder_runtime.py. */
  static String codeOf(TErr e) {
    if (e.thunder) return e.code;
    String t = e.pyType, m = e.getMessage();
    if (t.equals("ZeroDivisionError") || t.equals("DivisionByZero")) return "TC501";
    if ((t.equals("TypeError") || t.equals("AttributeError")) && m.contains("NoneType")) return "TC502";
    if (t.equals("KeyError")) return "TC503";
    if (t.equals("TypeError")) return "TC506";
    return "TC508";
  }

  /** A Java error that is not a Thunder or Python error is a bug in the runtime: it is not hidden. */
  public static TErr asPyErr(Throwable e) {
    if (e instanceof TErr) return (TErr) e;
    if (e instanceof StackOverflowError) return PyErr("RecursionError", "maximum recursion depth exceeded");
    if (e instanceof RuntimeException) throw (RuntimeException) e;
    if (e instanceof Error) throw (Error) e;
    throw new RuntimeException(e);
  }

  // ── Exact decimals: Python's Decimal with its default context (28 digits, half-even when a result is too long) ──

  static final int PREC = 28;
  static final BigInteger TEN = BigInteger.TEN, TWO = BigInteger.TWO, FIVE = BigInteger.valueOf(5);
  static BigInteger pow10(int n) { return TEN.pow(n); }
  static int ndigits(BigInteger c) { return c.signum() == 0 ? 1 : c.toString().length(); }
  static boolean odd(BigInteger q) { return q.testBit(0); }

  public static final class Dec {
    final int s; final BigInteger c; final int e; // sign (0 or 1), coefficient >= 0, exponent
    Dec(int s, BigInteger c, int e) { this.s = s; this.c = c; this.e = e; }
    static Dec of(Object x) {
      if (x instanceof Dec) return (Dec) x;
      if (x instanceof BigInteger) return Dec.integer((BigInteger) x);
      if (x instanceof Boolean) return Dec.integer((Boolean) x ? BigInteger.ONE : BigInteger.ZERO);
      throw new ClassCastException("not a number");
    }
    static Dec integer(BigInteger n) { return new Dec(n.signum() < 0 ? 1 : 0, n.abs(), 0); }
    static final Pattern NUM = Pattern.compile("^([+-]?)(\\d*)(?:\\.(\\d*))?(?:[eE]([+-]?\\d+))?$");
    /** Decimal("text"): exact. Returns null when the text is not a number. */
    static Dec parse(String text) {
      Matcher m = NUM.matcher(text.strip().replace("_", ""));
      if (!m.matches()) return null;
      String ip = m.group(2), fp = m.group(3);
      if ((ip == null || ip.isEmpty()) && fp == null) return null;
      String frac = fp == null ? "" : fp;
      String digits = (ip == null ? "" : ip) + frac;
      return new Dec("-".equals(m.group(1)) ? 1 : 0, new BigInteger(digits.isEmpty() ? "0" : digits), (m.group(4) != null ? Integer.parseInt(m.group(4)) : 0) - frac.length());
    }
    boolean isZero() { return c.signum() == 0; }
    /** _fix: round to 28 significant digits, half to even. */
    Dec fix() {
      int d = ndigits(c) - PREC;
      if (d <= 0) return this;
      BigInteger p = pow10(d);
      BigInteger[] qr = c.divideAndRemainder(p);
      BigInteger q = qr[0], r = qr[1], half = FIVE.multiply(pow10(d - 1));
      int cmp = r.compareTo(half);
      if (cmp > 0 || (cmp == 0 && odd(q))) q = q.add(BigInteger.ONE);
      int ee = e + d;
      if (ndigits(q) > PREC) { q = q.divide(TEN); ee += 1; }
      return new Dec(s, q, ee);
    }
    BigInteger signed() { return s == 1 ? c.negate() : c; }
    static Dec add(Dec a, Dec b) {
      int e = Math.min(a.e, b.e);
      BigInteger x = a.signed().multiply(pow10(a.e - e)), y = b.signed().multiply(pow10(b.e - e));
      BigInteger sum = x.add(y);
      int s;
      if (sum.signum() == 0) s = a.s == 1 && b.s == 1 && a.c.signum() == 0 && b.c.signum() == 0 ? 1 : (a.c.signum() == 0 && b.c.signum() == 0 ? Math.min(a.s, b.s) : 0);
      else s = sum.signum() < 0 ? 1 : 0;
      return new Dec(s, sum.abs(), e).fix();
    }
    Dec negated() { return new Dec(s == 1 ? 0 : 1, c, e); }
    static Dec sub(Dec a, Dec b) { return Dec.add(a, b.negated()); }
    static Dec mul(Dec a, Dec b) { return new Dec(a.s ^ b.s, a.c.multiply(b.c), a.e + b.e).fix(); }
    /** Python's Decimal division: exact when it can be, else 28 digits. */
    static Dec div(Dec a, Dec b) {
      int s = a.s ^ b.s;
      if (a.c.signum() == 0) return new Dec(s, BigInteger.ZERO, a.e - b.e).fix();
      int shift = ndigits(b.c) - ndigits(a.c) + PREC + 1;
      int exp = a.e - b.e - shift;
      BigInteger coeff, rem;
      if (shift >= 0) { BigInteger[] qr = a.c.multiply(pow10(shift)).divideAndRemainder(b.c); coeff = qr[0]; rem = qr[1]; }
      else { BigInteger[] qr = a.c.divideAndRemainder(b.c.multiply(pow10(-shift))); coeff = qr[0]; rem = qr[1]; }
      if (rem.signum() != 0) { if (coeff.mod(FIVE).signum() == 0) coeff = coeff.add(BigInteger.ONE); }
      else { int ideal = a.e - b.e; while (exp < ideal && coeff.mod(TEN).signum() == 0) { coeff = coeff.divide(TEN); exp += 1; } }
      return new Dec(s, coeff, exp).fix();
    }
    /** Decimal % Decimal: the remainder with the sign of the dividend. */
    static Dec rem(Dec a, Dec b) {
      int e = Math.min(a.e, b.e);
      BigInteger x = a.c.multiply(pow10(a.e - e)), y = b.c.multiply(pow10(b.e - e));
      return new Dec(a.s, x.mod(y), e).fix();
    }
    Dec neg() { return (c.signum() == 0 ? new Dec(0, BigInteger.ZERO, e) : negated()).fix(); }
    Dec abs() { return new Dec(0, c, e).fix(); }
    static int cmp(Dec a, Dec b) {
      int e = Math.min(a.e, b.e);
      BigInteger x = a.signed().multiply(pow10(a.e - e)), y = b.signed().multiply(pow10(b.e - e));
      return Integer.signum(x.compareTo(y));
    }
    /** quantize to exponent `e` rounding half away from zero. */
    Dec quantizeHalfUp(int ne) {
      if (ne <= e) return new Dec(s, c.multiply(pow10(e - ne)), ne);
      BigInteger p = pow10(ne - e);
      BigInteger[] qr = c.divideAndRemainder(p);
      BigInteger q = qr[0];
      if (qr[1].multiply(TWO).compareTo(p) >= 0) q = q.add(BigInteger.ONE);
      return new Dec(s, q, ne);
    }
    boolean isIntegral() { if (e >= 0) return true; return c.mod(pow10(-e)).signum() == 0; }
    /** int(d): toward zero. */
    BigInteger toBigInt() { BigInteger v = e >= 0 ? c.multiply(pow10(e)) : c.divide(pow10(-e)); return s == 1 ? v.negate() : v; }
    /** str(Decimal): Python's to-scientific-string. */
    @Override public String toString() {
      String digits = c.toString();
      int left = e + digits.length();
      int dot = e <= 0 && left > -6 ? left : 1;
      String ip, fp;
      if (dot <= 0) { ip = "0"; fp = "." + "0".repeat(-dot) + digits; }
      else if (dot >= digits.length()) { ip = digits + "0".repeat(dot - digits.length()); fp = ""; }
      else { ip = digits.substring(0, dot); fp = "." + digits.substring(dot); }
      String ex = left == dot ? "" : "E" + (left - dot >= 0 ? "+" : "") + (left - dot);
      return (s == 1 ? "-" : "") + ip + fp + ex;
    }
    String toFixed() { return toFixed(null, false); }
    /** format(d, "f") or format(d, ",.Nf"). */
    String toFixed(Integer places, boolean group) {
      Dec d = this;
      if (places != null) d = d.roundHalfEven(-places);
      String digits = d.c.toString();
      int dot = d.e + digits.length();
      String ip, fp;
      if (dot < 0) { ip = "0"; fp = "0".repeat(-dot) + digits; }
      else if (dot > digits.length()) { ip = digits + "0".repeat(dot - digits.length()); fp = ""; }
      else { ip = digits.substring(0, dot); if (ip.isEmpty()) ip = "0"; fp = digits.substring(dot); }
      if (group) ip = groupThousands(ip);
      return (d.s == 1 ? "-" : "") + ip + (fp.isEmpty() ? "" : "." + fp);
    }
    Dec roundHalfEven(int ne) {
      if (ne <= e) return new Dec(s, c.multiply(pow10(e - ne)), ne);
      BigInteger p = pow10(ne - e);
      BigInteger[] qr = c.divideAndRemainder(p);
      BigInteger q = qr[0];
      int cmp = qr[1].multiply(TWO).compareTo(p);
      if (cmp > 0 || (cmp == 0 && odd(q))) q = q.add(BigInteger.ONE);
      return new Dec(s, q, ne);
    }
    /** A key equal for equal numbers (1 and 1.0 and 1.00 are the same map key, as in Python). */
    String key() {
      if (c.signum() == 0) return "0";
      BigInteger cc = c; int ee = e;
      while (cc.mod(TEN).signum() == 0) { cc = cc.divide(TEN); ee += 1; }
      return (s == 1 ? "-" : "") + cc + "e" + ee;
    }
  }

  static String groupThousands(String ip) {
    StringBuilder b = new StringBuilder();
    int n = ip.length();
    for (int i = 0; i < n; i++) { if (i > 0 && (n - i) % 3 == 0) b.append(','); b.append(ip.charAt(i)); }
    return b.toString();
  }

  // ── Money ──────────────────────────────────────────────────────────────────────────────────────────────────────

  public static final class Money {
    final Dec amount;
    Money(Dec amount) { this.amount = amount; }
    static Money of(Object x) {
      if (x instanceof Money) return (Money) x;
      if (x instanceof String) {
        Dec d = Dec.parse(((String) x).replace(",", "").replace("$", "").strip());
        if (d == null) throw PyErr("InvalidOperation", "[<class 'decimal.ConversionSyntax'>]");
        return new Money(d);
      }
      return new Money(toDec(x));
    }
    @Override public String toString() {
      Dec a = amount;
      int places = a.e < 0 ? Math.max(2, -a.e) : 2;
      return (a.s == 1 && a.c.signum() != 0 ? "-$" : "$") + a.abs().toFixed(places, true);
    }
  }

  /** Money._other: the amount of the other side, or a clear error. */
  static Dec moneyOther(Object other, String verb) {
    if (other instanceof Money) return ((Money) other).amount;
    if (isNumber(other) && numCmp(other, BigInteger.ZERO) == 0) return Dec.integer(BigInteger.ZERO);
    throw KindMismatch("I can't " + verb + " money and " + describe(other) + ". Write the number as money, for example $5.");
  }

  // ── Other kinds ────────────────────────────────────────────────────────────────────────────────────────────────

  public static final class PyDate {
    final int y, m, d;
    PyDate(int y, int m, int d) { this.y = y; this.m = m; this.d = d; }
    String iso() { return String.format("%04d-%02d-%02d", y, m, d); }
    int num() { return y * 10000 + m * 100 + d; }
    static PyDate todayDate() { LocalDate t = LocalDate.now(); return new PyDate(t.getYear(), t.getMonthValue(), t.getDayOfMonth()); }
    static final Pattern ISO = Pattern.compile("^(\\d{4})-?(\\d{2})-?(\\d{2})$");
    /** date.fromisoformat for YYYY-MM-DD (and YYYYMMDD); null when it is not a date. */
    static PyDate parse(String text) {
      Matcher mm = ISO.matcher(text);
      if (!mm.matches()) return null;
      int y = Integer.parseInt(mm.group(1)), mo = Integer.parseInt(mm.group(2)), d = Integer.parseInt(mm.group(3));
      int[] days = { 31, (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
      if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]) return null;
      return new PyDate(y, mo, d);
    }
  }

  public static final class Tuple { final List<Object> items; Tuple(List<Object> items) { this.items = items; } }

  public static final class NotGiven { private NotGiven() {} }
  public static final Object NOT_GIVEN = new NotGiven();

  /** A Python dict: insertion order kept; keys equal the way Python compares them (1 == 1.0 == True). */
  public static final class PyDict {
    final LinkedHashMap<String, Object[]> m = new LinkedHashMap<>();
    static String keyOf(Object k) {
      if (k == null) return "N";
      if (k instanceof String) return "s" + k;
      if (k instanceof Boolean || k instanceof BigInteger || k instanceof Dec) return "n" + Dec.of(k).key();
      if (k instanceof Money) return "m" + ((Money) k).amount.key();
      if (k instanceof PyDate) return "d" + ((PyDate) k).iso();
      if (k instanceof Tuple) { StringBuilder b = new StringBuilder("t("); List<Object> it = ((Tuple) k).items; for (int i = 0; i < it.size(); i++) { if (i > 0) b.append(','); b.append(keyOf(it.get(i))); } return b.append(')').toString(); }
      if (k == NOT_GIVEN) return "G";
      throw TypeErr("unhashable type: '" + typeName(k) + "'");
    }
    boolean has(Object k) { return m.containsKey(keyOf(k)); }
    Object get(Object k) { Object[] e = m.get(keyOf(k)); return e == null ? null : e[1]; }
    void set(Object k, Object v) { String id = keyOf(k); Object[] e = m.get(id); if (e != null) e[1] = v; else m.put(id, new Object[] { k, v }); }
    void delete(Object k) { m.remove(keyOf(k)); }
    int size() { return m.size(); }
    ArrayList<Object> keys() { ArrayList<Object> out = new ArrayList<>(); for (Object[] e : m.values()) out.add(e[0]); return out; }
    ArrayList<Object> values() { ArrayList<Object> out = new ArrayList<>(); for (Object[] e : m.values()) out.add(e[1]); return out; }
    ArrayList<Object> items() { ArrayList<Object> out = new ArrayList<>(); for (Object[] e : m.values()) out.add(new Tuple(new ArrayList<>(Arrays.asList(e[0], e[1])))); return out; }
  }

  /** A field of a record kind: its Python name and its kind. */
  public static final class Field { final String py; final String kind; public Field(String py, String kind) { this.py = py; this.kind = kind; } }
  /** A Never rule on a record's field: the condition that breaks it (run with the new value), its words and line. */
  public static final class Rule {
    final Function<Object, Object> cond; final String text; final int line;
    public Rule(Function<Object, Object> cond, String text, int line) { this.cond = cond; this.text = text; this.line = line; }
  }
  /** A record kind (a Python dataclass): its name, fields, and the Never rules on its fields. */
  public static final class RecordKind {
    final String py; final List<Field> fields; final Map<String, List<Rule>> rules;
    RecordKind(String py, List<Field> fields, Map<String, List<Rule>> rules) { this.py = py; this.fields = fields; this.rules = rules; }
  }
  /** A record: its kind, and its field values in declaration order. */
  public static final class RecordVal {
    final RecordKind cls; final LinkedHashMap<String, Object> f = new LinkedHashMap<>();
    RecordVal(RecordKind cls) { this.cls = cls; }
  }

  /** A name a lambda in the generated code also uses (Java lambdas only see names that never change). */
  public static final class Box { public Object v; public Box(Object v) { this.v = v; } }

  // ── Kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────

  static boolean isInt(Object x) { return x instanceof BigInteger; }
  static boolean isNumber(Object x) { return x instanceof BigInteger || x instanceof Dec; } // _is_number: never yes/no
  static boolean isIntLike(Object x) { return x instanceof BigInteger || x instanceof Boolean; }
  static boolean isNumLike(Object x) { return isIntLike(x) || x instanceof Dec; } // what Python arithmetic accepts as a number
  static BigInteger asBig(Object x) { return x instanceof Boolean ? ((Boolean) x ? BigInteger.ONE : BigInteger.ZERO) : (BigInteger) x; }
  static int numCmp(Object a, Object b) { return isIntLike(a) && isIntLike(b) ? Integer.signum(asBig(a).compareTo(asBig(b))) : Dec.cmp(Dec.of(a), Dec.of(b)); }
  static boolean isList(Object x) { return x instanceof ArrayList; }
  @SuppressWarnings("unchecked") static ArrayList<Object> asList(Object x) { return (ArrayList<Object>) x; }

  /** Python's type name, as its error messages print it. */
  static String typeName(Object v) {
    if (v == null) return "NoneType";
    if (v instanceof Boolean) return "bool";
    if (v instanceof BigInteger) return "int";
    if (v instanceof String) return "str";
    if (v instanceof Dec) return "decimal.Decimal";
    if (v instanceof Money) return "Money";
    if (isList(v)) return "list";
    if (v instanceof Tuple) return "tuple";
    if (v instanceof PyDict) return "dict";
    if (v instanceof PyDate) return "datetime.date";
    if (v instanceof RecordVal) return ((RecordVal) v).cls.py;
    if (v == NOT_GIVEN) return "_NotGiven";
    return "object";
  }
  static String shortName(Object v) { return v instanceof Dec ? "Decimal" : v instanceof PyDate ? "date" : typeName(v); }

  /** _describe(v) in thunder_runtime.py. */
  static String describe(Object v) {
    if (v == null) return "nothing";
    if (v instanceof Boolean) return "a yes/no value";
    if (v instanceof String) return "the text \"" + v + "\"";
    if (isNumber(v)) return "the number " + show(v);
    if (v instanceof Money) return v.toString();
    return "a value (" + shortName(v) + ")";
  }

  /** show(v): a value the way Thunder says it. */
  public static String show(Object v) {
    if (v == null) return "nothing";
    if (Boolean.TRUE.equals(v)) return "yes";
    if (Boolean.FALSE.equals(v)) return "no";
    if (v instanceof Dec) { String t = ((Dec) v).toFixed(); return t.contains(".") ? t.replaceAll("0+$", "").replaceAll("\\.$", "") : t; }
    if (isList(v)) return "[" + joinShow(asList(v)) + "]";
    if (v instanceof Tuple) return "[" + joinShow(((Tuple) v).items) + "]";
    if (v instanceof PyDict) { StringBuilder b = new StringBuilder("{"); boolean first = true; for (Object[] e : ((PyDict) v).m.values()) { if (!first) b.append(", "); first = false; b.append(show(e[0])).append(": ").append(show(e[1])); } return b.append('}').toString(); }
    if (v instanceof RecordVal) {
      RecordVal r = (RecordVal) v;
      StringBuilder b = new StringBuilder(r.cls.py).append('(');
      for (int i = 0; i < r.cls.fields.size(); i++) { Field f = r.cls.fields.get(i); if (i > 0) b.append(", "); b.append(f.py.replace('_', ' ')).append(": ").append(show(r.f.get(f.py))); }
      return b.append(')').toString();
    }
    if (v instanceof PyDate) return ((PyDate) v).iso();
    return pyStr(v);
  }
  static String joinShow(List<Object> xs) { StringBuilder b = new StringBuilder(); for (int i = 0; i < xs.size(); i++) { if (i > 0) b.append(", "); b.append(show(xs.get(i))); } return b.toString(); }

  /** Python's repr(v). */
  static String pyRepr(Object v) {
    if (v instanceof String) {
      String s = (String) v;
      char q = s.indexOf('\'') >= 0 && s.indexOf('"') < 0 ? '"' : '\'';
      StringBuilder out = new StringBuilder();
      s.codePoints().forEach((cp) -> {
        if (cp == '\\') out.append("\\\\");
        else if (cp == q) out.append('\\').append(q);
        else if (cp == '\n') out.append("\\n");
        else if (cp == '\r') out.append("\\r");
        else if (cp == '\t') out.append("\\t");
        else if (cp < 0x20 || cp == 0x7f) out.append(String.format("\\x%02x", cp));
        else out.appendCodePoint(cp);
      });
      return q + out.toString() + q;
    }
    if (v == null) return "None";
    if (v instanceof Boolean) return (Boolean) v ? "True" : "False";
    if (v instanceof BigInteger) return v.toString();
    if (v instanceof Dec) return "Decimal('" + v + "')";
    if (v instanceof Money) return "Money('" + ((Money) v).amount.toFixed() + "')";
    if (isList(v)) { StringBuilder b = new StringBuilder("["); List<Object> xs = asList(v); for (int i = 0; i < xs.size(); i++) { if (i > 0) b.append(", "); b.append(pyRepr(xs.get(i))); } return b.append(']').toString(); }
    if (v instanceof Tuple) {
      List<Object> xs = ((Tuple) v).items;
      if (xs.size() == 1) return "(" + pyRepr(xs.get(0)) + ",)";
      StringBuilder b = new StringBuilder("("); for (int i = 0; i < xs.size(); i++) { if (i > 0) b.append(", "); b.append(pyRepr(xs.get(i))); } return b.append(')').toString();
    }
    if (v instanceof PyDict) { StringBuilder b = new StringBuilder("{"); boolean first = true; for (Object[] e : ((PyDict) v).m.values()) { if (!first) b.append(", "); first = false; b.append(pyRepr(e[0])).append(": ").append(pyRepr(e[1])); } return b.append('}').toString(); }
    if (v instanceof PyDate) { PyDate d = (PyDate) v; return "datetime.date(" + d.y + ", " + d.m + ", " + d.d + ")"; }
    if (v instanceof RecordVal) {
      RecordVal r = (RecordVal) v;
      StringBuilder b = new StringBuilder(r.cls.py).append('(');
      for (int i = 0; i < r.cls.fields.size(); i++) { Field f = r.cls.fields.get(i); if (i > 0) b.append(", "); b.append(f.py).append('=').append(pyRepr(r.f.get(f.py))); }
      return b.append(')').toString();
    }
    if (v == NOT_GIVEN) return "not given";
    return String.valueOf(v);
  }

  /** Python's str(v). */
  public static String pyStr(Object v) {
    if (v instanceof String) return (String) v;
    if (v instanceof Money) return v.toString();
    if (v instanceof PyDate) return ((PyDate) v).iso();
    if (v instanceof Dec) return v.toString();
    return pyRepr(v);
  }

  /** Python's truth value (used only where the generated Python uses it: "where" conditions and Never rules). */
  public static boolean truthy(Object v) {
    if (v == null || Boolean.FALSE.equals(v)) return false;
    if (Boolean.TRUE.equals(v)) return true;
    if (v instanceof BigInteger) return ((BigInteger) v).signum() != 0;
    if (v instanceof Dec) return !((Dec) v).isZero();
    if (v instanceof String) return !((String) v).isEmpty();
    if (isList(v)) return !asList(v).isEmpty();
    if (v instanceof Tuple) return !((Tuple) v).items.isEmpty();
    if (v instanceof PyDict) return ((PyDict) v).size() > 0;
    return true;
  }

  /** yes_no(v): a condition needs a real yes/no value. */
  public static boolean yesNo(Object v) {
    if (v instanceof Boolean) return (Boolean) v;
    throw KindMismatch("This needs a yes/no value, but it is " + describe(v) + ". Compare it instead, for example: is 0, is empty, is nothing.");
  }

  /** _decimal(x) in thunder_runtime.py. */
  static Dec toDec(Object x) {
    if (x instanceof Dec) return (Dec) x;
    if (x instanceof Boolean) throw KindMismatch("A yes/no value was used where a number was needed.");
    if (x instanceof BigInteger) return Dec.integer((BigInteger) x);
    if (x == null) throw KindMismatch("A value was nothing where a number was needed.");
    throw KindMismatch(describe(x) + " was used where a number was needed.");
  }

  // ── Python operators ───────────────────────────────────────────────────────────────────────────────────────────

  static int strLen(String s) { return s.codePointCount(0, s.length()); }
  static ArrayList<Object> codePointList(String s) { ArrayList<Object> out = new ArrayList<>(); s.codePoints().forEach((cp) -> out.add(new String(Character.toChars(cp)))); return out; }

  public static BigInteger pyLen(Object v) {
    if (v instanceof String) return BigInteger.valueOf(strLen((String) v));
    if (isList(v)) return BigInteger.valueOf(asList(v).size());
    if (v instanceof Tuple) return BigInteger.valueOf(((Tuple) v).items.size());
    if (v instanceof PyDict) return BigInteger.valueOf(((PyDict) v).size());
    throw TypeErr("object of type '" + typeName(v) + "' has no len()");
  }

  /** Iterate a value the way Python's for loop does (a list is the list itself: items added while looping are seen). */
  public static List<Object> pyIter(Object v) {
    if (isList(v)) return asList(v);
    if (v instanceof Tuple) return ((Tuple) v).items;
    if (v instanceof String) return codePointList((String) v);
    if (v instanceof PyDict) return ((PyDict) v).keys();
    throw TypeErr("'" + typeName(v) + "' object is not iterable");
  }
  public static ArrayList<Object> pyList(Object v) { return new ArrayList<>(pyIter(v)); }

  /** A for loop over a list, the way Python's goes: by position, so items added while looping are reached. */
  public static Iterable<Object> loop(List<Object> items) {
    return () -> new Iterator<Object>() {
      int i = 0;
      public boolean hasNext() { return i < items.size(); }
      public Object next() { if (i >= items.size()) throw new NoSuchElementException(); return items.get(i++); }
    };
  }

  public static Object add(Object a, Object b) {
    if (a instanceof Money) return new Money(Dec.add(((Money) a).amount, moneyOther(b, "add")));
    if (b instanceof Money) return new Money(Dec.add(((Money) b).amount, moneyOther(a, "add")));
    if (isIntLike(a) && isIntLike(b)) return asBig(a).add(asBig(b));
    if (isNumLike(a) && isNumLike(b)) return Dec.add(Dec.of(a), Dec.of(b));
    if (a instanceof String) { if (b instanceof String) return (String) a + b; throw TypeErr("can only concatenate str (not \"" + typeName(b) + "\") to str"); }
    if (isList(a)) { if (isList(b)) { ArrayList<Object> out = new ArrayList<>(asList(a)); out.addAll(asList(b)); return out; } throw TypeErr("can only concatenate list (not \"" + typeName(b) + "\") to list"); }
    if (a instanceof Tuple) { if (b instanceof Tuple) { ArrayList<Object> out = new ArrayList<>(((Tuple) a).items); out.addAll(((Tuple) b).items); return new Tuple(out); } throw TypeErr("can only concatenate tuple (not \"" + typeName(b) + "\") to tuple"); }
    throw TypeErr("unsupported operand type(s) for +: '" + typeName(a) + "' and '" + typeName(b) + "'");
  }

  public static Object sub(Object a, Object b) {
    if (a instanceof Money) return new Money(Dec.sub(((Money) a).amount, moneyOther(b, "subtract")));
    if (b instanceof Money) return new Money(Dec.sub(moneyOther(a, "subtract"), ((Money) b).amount));
    if (isIntLike(a) && isIntLike(b)) return asBig(a).subtract(asBig(b));
    if (isNumLike(a) && isNumLike(b)) return Dec.sub(Dec.of(a), Dec.of(b));
    throw TypeErr("unsupported operand type(s) for -: '" + typeName(a) + "' and '" + typeName(b) + "'");
  }

  static Object repeat(Object seq, Object n) {
    long k = asBig(n).longValue();
    if (seq instanceof String) return k > 0 ? ((String) seq).repeat((int) k) : "";
    ArrayList<Object> out = new ArrayList<>();
    for (long i = 0; i < k; i++) out.addAll(asList(seq));
    return out;
  }

  public static Object mul(Object a, Object b) {
    if (a instanceof Money) { if (b instanceof Money) throw KindMismatch("Money can't be multiplied by money."); return new Money(Dec.mul(((Money) a).amount, toDec(b))); }
    if (b instanceof Money) return new Money(Dec.mul(((Money) b).amount, toDec(a)));
    if (isIntLike(a) && isIntLike(b)) return asBig(a).multiply(asBig(b));
    if (isNumLike(a) && isNumLike(b)) return Dec.mul(Dec.of(a), Dec.of(b));
    boolean seqA = a instanceof String || isList(a), seqB = b instanceof String || isList(b);
    if (seqA) { if (isIntLike(b)) return repeat(a, b); throw TypeErr("can't multiply sequence by non-int of type '" + typeName(b) + "'"); }
    if (seqB) { if (isIntLike(a)) return repeat(b, a); throw TypeErr("can't multiply sequence by non-int of type '" + typeName(a) + "'"); }
    throw TypeErr("unsupported operand type(s) for *: '" + typeName(a) + "' and '" + typeName(b) + "'");
  }

  public static Object neg(Object a) {
    if (a instanceof Money) return new Money(((Money) a).amount.neg());
    if (isIntLike(a)) return asBig(a).negate();
    if (a instanceof Dec) return ((Dec) a).neg();
    throw TypeErr("bad operand type for unary -: '" + typeName(a) + "'");
  }

  /** Python's % on two whole numbers: the sign of the divisor. */
  public static Object intMod(Object a, Object b) {
    if (!isIntLike(a) || !isIntLike(b)) return pyModGeneric(a, b);
    BigInteger x = asBig(a), y = asBig(b);
    if (y.signum() == 0) throw PyErr("ZeroDivisionError", "integer modulo by zero");
    BigInteger r = x.remainder(y);
    if (r.signum() != 0 && (r.signum() < 0) != (y.signum() < 0)) r = r.add(y);
    return r;
  }
  static Object pyModGeneric(Object a, Object b) {
    if (isNumLike(a) && isNumLike(b)) return modulo(a, b);
    throw TypeErr("unsupported operand type(s) for %: '" + typeName(a) + "' and '" + typeName(b) + "'");
  }

  /** divide(a, b) in thunder_runtime.py: always exact. */
  public static Object divide(Object a, Object b) {
    if (a instanceof Money) {
      if (b instanceof Money) { if (((Money) b).amount.isZero()) throw DividedByZero("You divided by zero."); return Dec.div(((Money) a).amount, ((Money) b).amount); }
      Dec d = toDec(b);
      if (d.isZero()) throw DividedByZero("You divided by zero.");
      return new Money(Dec.div(((Money) a).amount, d));
    }
    if (b instanceof Money) throw KindMismatch("A plain number can't be divided by money.");
    Dec x = toDec(a), y = toDec(b);
    if (y.isZero()) throw DividedByZero("You divided by zero.");
    return Dec.div(x, y);
  }

  /** modulo(a, b) in thunder_runtime.py. */
  public static Object modulo(Object a, Object b) {
    boolean money = a instanceof Money;
    Dec x = money ? ((Money) a).amount : toDec(a);
    Dec y = b instanceof Money ? ((Money) b).amount : toDec(b);
    if (y.isZero()) throw DividedByZero("You divided by zero.");
    Dec r = Dec.rem(x, y);
    if (!r.isZero() && (r.s == 1) != (y.s == 1 && !y.isZero())) r = Dec.add(r, y);
    if (money) return new Money(r);
    return a instanceof BigInteger && b instanceof BigInteger ? r.toBigInt() : r;
  }

  /** round_to(x, places). */
  public static Object roundTo(Object x) { return roundTo(x, BigInteger.ZERO); }
  public static Object roundTo(Object x, Object places) {
    int p = asBig(places instanceof Dec ? ((Dec) places).toBigInt() : places).intValue();
    if (x instanceof Money) return new Money(((Money) x).amount.quantizeHalfUp(-p));
    if (x instanceof BigInteger) return x;
    Dec d = toDec(x).quantizeHalfUp(-p);
    return p == 0 ? d.toBigInt() : d;
  }

  /** Python ==. */
  public static boolean eq(Object a, Object b) {
    if (a == b && !(a instanceof Dec)) return true;
    if (a instanceof Money || b instanceof Money) {
      Money m = a instanceof Money ? (Money) a : (Money) b;
      Object o = a instanceof Money ? b : a;
      if (o == null || o instanceof String || o instanceof Boolean) return false;
      return Dec.cmp(m.amount, moneyOther(o, "compare")) == 0;
    }
    if (a == null || b == null) return false;
    if (isNumLike(a) && isNumLike(b)) return numCmp(a, b) == 0;
    if (a instanceof String || b instanceof String) return a.equals(b);
    if (isList(a) && isList(b)) {
      List<Object> x = asList(a), y = asList(b);
      if (x.size() != y.size()) return false;
      for (int i = 0; i < x.size(); i++) if (x.get(i) != y.get(i) && !eq(x.get(i), y.get(i))) return false;
      return true;
    }
    if (a instanceof Tuple && b instanceof Tuple) {
      List<Object> x = ((Tuple) a).items, y = ((Tuple) b).items;
      if (x.size() != y.size()) return false;
      for (int i = 0; i < x.size(); i++) if (!eq(x.get(i), y.get(i))) return false;
      return true;
    }
    if (a instanceof PyDict && b instanceof PyDict) {
      PyDict x = (PyDict) a, y = (PyDict) b;
      if (x.size() != y.size()) return false;
      for (Map.Entry<String, Object[]> e : x.m.entrySet()) { Object[] o = y.m.get(e.getKey()); if (o == null || !eq(e.getValue()[1], o[1])) return false; }
      return true;
    }
    if (a instanceof RecordVal && b instanceof RecordVal) {
      RecordVal x = (RecordVal) a, y = (RecordVal) b;
      if (x.cls != y.cls) return false;
      for (Field f : x.cls.fields) if (!eq(x.f.get(f.py), y.f.get(f.py))) return false;
      return true;
    }
    if (a instanceof PyDate && b instanceof PyDate) return ((PyDate) a).num() == ((PyDate) b).num();
    return false;
  }

  static String flip(String op) { switch (op) { case "<": return ">"; case ">": return "<"; case "<=": return ">="; case ">=": return "<="; default: return op; } }
  static boolean holds(String op, int c) { return op.equals("<") ? c < 0 : op.equals(">") ? c > 0 : op.equals("<=") ? c <= 0 : c >= 0; }

  /** Python <, >, <=, >= (and == / != through eq). */
  public static boolean compare(String op, Object a, Object b) {
    if (op.equals("==")) return eq(a, b);
    if (op.equals("!=")) return !eq(a, b);
    if (a instanceof Money || b instanceof Money) {
      Money m = a instanceof Money ? (Money) a : (Money) b;
      Object o = a instanceof Money ? b : a;
      String o2 = a instanceof Money ? op : flip(op);
      if (o == null) throw TypeErr("'" + o2 + "' not supported between instances of 'decimal.Decimal' and 'NoneType'");
      return holds(o2, Dec.cmp(m.amount, moneyOther(o, "compare")));
    }
    Integer c = order(a, b);
    if (c == null) throw TypeErr("'" + op + "' not supported between instances of '" + typeName(a) + "' and '" + typeName(b) + "'");
    return holds(op, c);
  }

  /** -1, 0, 1, or null when Python cannot order the two. */
  static Integer order(Object a, Object b) {
    if (isNumLike(a) && isNumLike(b)) return numCmp(a, b);
    if (a instanceof String && b instanceof String) return cmpStr((String) a, (String) b);
    if (a instanceof PyDate && b instanceof PyDate) return Integer.signum(((PyDate) a).num() - ((PyDate) b).num());
    List<Object> seqA = isList(a) ? asList(a) : a instanceof Tuple ? ((Tuple) a).items : null;
    List<Object> seqB = isList(b) ? asList(b) : b instanceof Tuple ? ((Tuple) b).items : null;
    if (seqA != null && seqB != null && isList(a) == isList(b)) {
      for (int i = 0; i < Math.min(seqA.size(), seqB.size()); i++) {
        if (eq(seqA.get(i), seqB.get(i))) continue;
        return compare("<", seqA.get(i), seqB.get(i)) ? -1 : 1;
      }
      return Integer.signum(seqA.size() - seqB.size());
    }
    return null;
  }
  static int cmpStr(String a, String b) {
    int[] x = a.codePoints().toArray(), y = b.codePoints().toArray();
    for (int i = 0; i < Math.min(x.length, y.length); i++) { int d = x[i] - y[i]; if (d != 0) return Integer.signum(d); }
    return Integer.signum(x.length - y.length);
  }

  /** Python's `item in container`. */
  static boolean contains(Object container, Object item) {
    if (container instanceof String) {
      if (!(item instanceof String)) throw TypeErr("'in <string>' requires string as left operand, not " + typeName(item));
      return ((String) container).contains((String) item);
    }
    if (container instanceof PyDict) return ((PyDict) container).has(item);
    if (isList(container)) { for (Object x : asList(container)) if (x == item || eq(x, item)) return true; return false; }
    if (container instanceof Tuple) { for (Object x : ((Tuple) container).items) if (eq(x, item)) return true; return false; }
    throw TypeErr("argument of type '" + typeName(container) + "' is not iterable");
  }

  /** Python's list.sort / sorted: stable, using < only. */
  public static ArrayList<Object> pySort(List<Object> items, Function<Object, Object> key, boolean reverse) {
    final class K { final Object v, k; final int i; K(Object v, Object k, int i) { this.v = v; this.k = k; this.i = i; } }
    ArrayList<K> keyed = new ArrayList<>();
    for (int i = 0; i < items.size(); i++) { Object v = items.get(i); keyed.add(new K(v, key != null ? key.apply(v) : v, i)); }
    keyed.sort((x, y) -> {
      if (compare("<", reverse ? y.k : x.k, reverse ? x.k : y.k)) return -1;
      if (compare("<", reverse ? x.k : y.k, reverse ? y.k : x.k)) return 1;
      return x.i - y.i;
    });
    ArrayList<Object> out = new ArrayList<>();
    for (K k : keyed) out.add(k.v);
    return out;
  }

  // ── Attribute-style Python calls the generated code makes on values ────────────────────────────────────────────

  static TErr attrErr(Object v, String name) { return PyErr("AttributeError", "'" + typeName(v) + "' object has no attribute '" + name + "'"); }
  static String strMethod(Object v, String name) { if (!(v instanceof String)) throw attrErr(v, name); return (String) v; }

  static final Pattern SPLITLINES = Pattern.compile("\\r\\n|[\\n\\r\\u000b\\f\\u001c\\u001d\\u001e\\u0085\\u2028\\u2029]");
  static ArrayList<Object> splitLines(String s) {
    ArrayList<Object> out = new ArrayList<>();
    String rest = s;
    while (!rest.isEmpty()) {
      Matcher m = SPLITLINES.matcher(rest);
      if (!m.find()) { out.add(rest); break; }
      out.add(rest.substring(0, m.start()));
      rest = rest.substring(m.end());
    }
    return out;
  }
  // JavaScript's \s (with the u flag) plus Python's extra whitespace: \x1c-\x1f and \x85.
  static final String WS = "\\t\\n\\u000b\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff\\u001c-\\u001f\\u0085";
  static final Pattern PY_SPACE = Pattern.compile("[" + WS + "]+");
  static final Pattern PY_STRIP = Pattern.compile("^[" + WS + "]+|[" + WS + "]+$");
  static ArrayList<Object> pySplit(String s) { ArrayList<Object> out = new ArrayList<>(); for (String p : PY_SPACE.split(s, -1)) if (!p.isEmpty()) out.add(p); return out; }
  static String pyStrip(String s) { return PY_STRIP.matcher(s).replaceAll(""); }

  // ── JSON, the way Python's json module reads and writes it ─────────────────────────────────────────────────────

  static final class JsonError extends RuntimeException { final int pos; JsonError(String msg, int pos) { super(msg, null, false, false); this.pos = pos; } }

  static final class Json {
    final String s; final int n;
    Json(String s) { this.s = s; this.n = s.length(); }
    static final Pattern NUM = Pattern.compile("-?(?:0|[1-9]\\d*)(\\.\\d+)?([eE][-+]?\\d+)?");
    int ws(int i) { while (i < n && " \t\n\r".indexOf(s.charAt(i)) >= 0) i++; return i; }
    Object[] str(int begin) {
      int i = begin + 1;
      StringBuilder out = new StringBuilder();
      for (;;) {
        if (i >= n) throw new JsonError("Unterminated string starting at", begin);
        char ch = s.charAt(i);
        if (ch == '"') return new Object[] { out.toString(), i + 1 };
        if (ch < 0x20) throw new JsonError("Invalid control character at", i);
        if (ch != '\\') { out.append(ch); i++; continue; }
        if (i + 1 >= n) throw new JsonError("Unterminated string starting at", begin);
        char esc = s.charAt(i + 1);
        String simple = esc == '"' ? "\"" : esc == '\\' ? "\\" : esc == '/' ? "/" : esc == 'b' ? "\b" : esc == 'f' ? "\f" : esc == 'n' ? "\n" : esc == 'r' ? "\r" : esc == 't' ? "\t" : null;
        if (simple != null) { out.append(simple); i += 2; continue; }
        if (esc != 'u') throw new JsonError("Invalid \\escape", i);
        String hex = i + 6 <= n ? s.substring(i + 2, i + 6) : "";
        if (!hex.matches("[0-9a-fA-F]{4}")) throw new JsonError("Invalid \\uXXXX escape", i + 1);
        int cp = Integer.parseInt(hex, 16);
        i += 6;
        if (cp >= 0xd800 && cp <= 0xdbff && i + 6 <= n && s.charAt(i) == '\\' && s.charAt(i + 1) == 'u' && s.substring(i + 2, i + 6).matches("[0-9a-fA-F]{4}")) {
          int lo = Integer.parseInt(s.substring(i + 2, i + 6), 16);
          if (lo >= 0xdc00 && lo <= 0xdfff) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); i += 6; }
        }
        out.appendCodePoint(cp);
      }
    }
    Object[] value(int i) {
      if (i >= n) throw new JsonError("Expecting value", i);
      char ch = s.charAt(i);
      if (ch == '"') return str(i);
      if (ch == '{') return obj(i + 1);
      if (ch == '[') return arr(i + 1);
      if (s.startsWith("null", i)) return new Object[] { null, i + 4 };
      if (s.startsWith("true", i)) return new Object[] { true, i + 4 };
      if (s.startsWith("false", i)) return new Object[] { false, i + 5 };
      Matcher m = NUM.matcher(s);
      m.region(i, n);
      if (m.lookingAt()) {
        String t = m.group();
        if (m.group(1) != null || m.group(2) != null) return new Object[] { Dec.parse(t), i + t.length() };
        return new Object[] { new BigInteger(t), i + t.length() };
      }
      throw new JsonError("Expecting value", i);
    }
    Object[] obj(int i) {
      PyDict d = new PyDict();
      i = ws(i);
      if (i < n && s.charAt(i) == '}') return new Object[] { d, i + 1 };
      for (;;) {
        if (i >= n || s.charAt(i) != '"') throw new JsonError("Expecting property name enclosed in double quotes", i);
        Object[] kr = str(i);
        i = ws((Integer) kr[1]);
        if (i >= n || s.charAt(i) != ':') throw new JsonError("Expecting ':' delimiter", i);
        i = ws(i + 1);
        Object[] vr = value(i);
        i = (Integer) vr[1];
        d.set(kr[0], vr[0]);
        i = ws(i);
        if (i < n && s.charAt(i) == '}') return new Object[] { d, i + 1 };
        if (i >= n || s.charAt(i) != ',') throw new JsonError("Expecting ',' delimiter", i);
        int comma = i;
        i = ws(i + 1);
        if (i < n && s.charAt(i) == '}') throw new JsonError("Illegal trailing comma before end of object", comma);
      }
    }
    Object[] arr(int i) {
      ArrayList<Object> out = new ArrayList<>();
      i = ws(i);
      if (i < n && s.charAt(i) == ']') return new Object[] { out, i + 1 };
      for (;;) {
        Object[] vr = value(i);
        out.add(vr[0]);
        i = ws((Integer) vr[1]);
        if (i < n && s.charAt(i) == ']') return new Object[] { out, i + 1 };
        if (i >= n || s.charAt(i) != ',') throw new JsonError("Expecting ',' delimiter", i);
        int comma = i;
        i = ws(i + 1);
        if (i < n && s.charAt(i) == ']') throw new JsonError("Illegal trailing comma before end of array", comma);
      }
    }
  }

  static Object jsonParse(String text) {
    Json j = new Json(text);
    try {
      Object[] r = j.value(j.ws(0));
      int end = j.ws((Integer) r[1]);
      if (end != j.n) throw new JsonError("Extra data", end);
      return r[0];
    } catch (JsonError e) {
      String before = text.substring(0, e.pos);
      int line = 1;
      for (int i = 0; i < before.length(); i++) if (before.charAt(i) == '\n') line++;
      int col = e.pos - before.lastIndexOf('\n');
      throw ConversionFailed("This is not JSON: " + e.getMessage() + " (line " + line + ", column " + col + ").");
    }
  }

  static Object jsonReady(Object v) {
    if (v == null || v instanceof Boolean || v instanceof String || v instanceof BigInteger || v instanceof Dec) return v;
    if (v instanceof Money) throw KindMismatch("Money has no JSON form of its own: use its amount, for example price's amount.");
    if (isList(v)) { ArrayList<Object> out = new ArrayList<>(); for (Object x : asList(v)) out.add(jsonReady(x)); return out; }
    if (v instanceof Tuple) { ArrayList<Object> out = new ArrayList<>(); for (Object x : ((Tuple) v).items) out.add(jsonReady(x)); return out; }
    if (v instanceof PyDict) {
      PyDict out = new PyDict();
      for (Object[] e : ((PyDict) v).m.values()) { if (!(e[0] instanceof String)) throw KindMismatch("A JSON object's keys are text, but one is " + describe(e[0]) + "."); out.set(e[0], jsonReady(e[1])); }
      return out;
    }
    if (v instanceof RecordVal) { RecordVal r = (RecordVal) v; PyDict out = new PyDict(); for (Field f : r.cls.fields) out.set(f.py, jsonReady(r.f.get(f.py))); return out; }
    throw KindMismatch(describe(v) + " has no JSON form.");
  }

  static String jsonStr(String s) {
    StringBuilder b = new StringBuilder("\"");
    s.codePoints().forEach((cp) -> {
      if (cp == '"') b.append("\\\"");
      else if (cp == '\\') b.append("\\\\");
      else if (cp == '\n') b.append("\\n");
      else if (cp == '\r') b.append("\\r");
      else if (cp == '\t') b.append("\\t");
      else if (cp == '\b') b.append("\\b");
      else if (cp == '\f') b.append("\\f");
      else if (cp >= 0x20 && cp <= 0x7e) b.appendCodePoint(cp);
      else if (cp > 0xffff) { int v = cp - 0x10000; b.append("\\u").append(Integer.toHexString(0xd800 + (v >> 10))).append("\\u").append(Integer.toHexString(0xdc00 + (v & 0x3ff))); }
      else b.append(String.format("\\u%04x", cp));
    });
    return b.append('"').toString();
  }

  static String jsonText(Object v) { return jsonWrite(jsonReady(v)); }
  static String jsonWrite(Object x) {
    if (x == null) return "null";
    if (Boolean.TRUE.equals(x)) return "true";
    if (Boolean.FALSE.equals(x)) return "false";
    if (x instanceof BigInteger) return x.toString();
    if (x instanceof Dec) { Dec d = (Dec) x; String t = d.toString(); return d.isIntegral() && t.contains("E") ? d.toFixed() : t; }
    if (x instanceof String) return jsonStr((String) x);
    if (isList(x)) { StringBuilder b = new StringBuilder("["); List<Object> xs = asList(x); for (int i = 0; i < xs.size(); i++) { if (i > 0) b.append(", "); b.append(jsonWrite(xs.get(i))); } return b.append(']').toString(); }
    StringBuilder b = new StringBuilder("{"); boolean first = true;
    for (Object[] e : ((PyDict) x).m.values()) { if (!first) b.append(", "); first = false; b.append(jsonStr((String) e[0])).append(": ").append(jsonWrite(e[1])); }
    return b.append('}').toString();
  }

  // ── Helpers the generated code calls ───────────────────────────────────────────────────────────────────────────

  public static final int MAX_FRAMES = 997; // as deep as the generated Python goes (recursion limit 1000, less its own frames)

  public static BigInteger rangeInt(Object v) {
    if (v instanceof BigInteger) return (BigInteger) v;
    if (v instanceof Boolean) return (Boolean) v ? BigInteger.ONE : BigInteger.ZERO;
    throw TypeErr("'" + (v instanceof Dec ? "decimal.Decimal" : v == null ? "NoneType" : v instanceof Money ? "Money" : v instanceof String ? "str" : "object") + "' object cannot be interpreted as an integer");
  }

  public static List<Object> unpack2(Object el) {
    List<Object> items = isList(el) ? asList(el) : el instanceof Tuple ? ((Tuple) el).items : el instanceof String ? codePointList((String) el) : el instanceof PyDict ? ((PyDict) el).keys() : null;
    if (items == null) throw TypeErr("cannot unpack non-iterable " + (el == null ? "NoneType" : isInt(el) ? "int" : el instanceof Dec ? "decimal.Decimal" : el instanceof Boolean ? "bool" : "object") + " object");
    if (items.size() < 2) throw PyErr("ValueError", "not enough values to unpack (expected 2, got " + items.size() + ")");
    if (items.size() > 2) throw PyErr("ValueError", "too many values to unpack (expected 2, got " + items.size() + ")");
    return items;
  }

  public static List<Object> mapItems(Object m) { if (!(m instanceof PyDict)) throw attrErr(m, "items"); return ((PyDict) m).items(); }
  public static List<Object> pairsOf(Object c) { return c instanceof PyDict ? ((PyDict) c).items() : pyList(c); }

  public static Object itemAt(Object items, Object position) { return itemAt(items, position, false, null); }
  public static Object itemAt(Object items, Object position, Object dflt) { return itemAt(items, position, true, dflt); }
  static Object itemAt(Object items, Object position, boolean hasDflt, Object dflt) {
    if (!(position instanceof BigInteger)) throw KindMismatch("A position in a list is a whole number, not " + describe(position) + ".");
    List<Object> list = isList(items) ? asList(items) : items instanceof Tuple ? ((Tuple) items).items : null;
    if (list == null) throw TypeErr("object of type '" + (items == null ? "NoneType" : "object") + "' has no len()");
    BigInteger p = (BigInteger) position;
    if (p.compareTo(BigInteger.ONE) >= 0 && p.compareTo(BigInteger.valueOf(list.size())) <= 0) return list.get(p.intValue() - 1);
    if (hasDflt) return dflt;
    throw MissingValue("There is no item " + p + ": the list has " + list.size() + " item" + (list.size() == 1 ? "" : "s") + ".");
  }
  public static void setItem(Object items, Object position, Object value) { itemAt(items, position); asList(items).set(((BigInteger) position).intValue() - 1, value); }
  public static void mapSet(Object m, Object k, Object v) {
    if (m instanceof PyDict) { ((PyDict) m).set(k, v); return; }
    if (m == null) throw TypeErr("'NoneType' object does not support item assignment");
    if (isList(m)) { setItem(m, k, v); return; }
    throw TypeErr("'" + (m instanceof Money ? "Money" : "object") + "' object does not support item assignment");
  }
  public static void setEntry(Object c, Object k, Object v) {
    if (isList(c)) setItem(c, k, v);
    else if (c instanceof PyDict) ((PyDict) c).set(k, v);
    else if (c == null) throw MissingValue("This value is nothing, so it has no entry for " + show(k) + ".");
    else throw KindMismatch(describe(c) + " has no entries that can be changed.");
  }
  public static Object entry(Object c, Object k) { return entry(c, k, false, null); }
  public static Object entry(Object c, Object k, Object dflt) { return entry(c, k, true, dflt); }
  static Object entry(Object c, Object k, boolean hasDflt, Object dflt) {
    if (isList(c) || c instanceof Tuple) return itemAt(c, k, hasDflt, dflt);
    if (c instanceof PyDict) { PyDict d = (PyDict) c; if (d.has(k)) return d.get(k); if (hasDflt) return dflt; throw MissingValue("There is no entry for " + show(k) + "."); }
    if (c == null) throw MissingValue("This value is nothing, so it has no entry for " + show(k) + ".");
    throw KindMismatch(describe(c) + " has no entries.");
  }
  public static Object mapGet(Object m, Object k) { return mapGet(m, k, false, null); }
  public static Object mapGet(Object m, Object k, Object dflt) { return mapGet(m, k, true, dflt); }
  static Object mapGet(Object m, Object k, boolean hasDflt, Object dflt) {
    if (m instanceof PyDict) { PyDict d = (PyDict) m; if (d.has(k)) return d.get(k); if (hasDflt) return dflt; throw PyErr("KeyError", pyStr(k), Collections.singletonList(k)); }
    if (m == null) throw hasDflt ? attrErr(m, "get") : TypeErr("'NoneType' object is not subscriptable");
    if (hasDflt) throw attrErr(m, "get");
    if (isList(m)) {
      List<Object> xs = asList(m);
      if (k instanceof BigInteger) { long i = ((BigInteger) k).longValue(); if (((BigInteger) k).bitLength() < 63 && i >= -xs.size() && i < xs.size()) return xs.get((int) (i < 0 ? xs.size() + i : i)); }
      throw PyErr("IndexError", "list index out of range");
    }
    throw TypeErr("'" + (m instanceof Money ? "Money" : "object") + "' object is not subscriptable");
  }

  /** obj.name for a record field (a Python attribute), or Money's amount. */
  public static Object getAttr(Object obj, String name) {
    if (obj instanceof RecordVal && ((RecordVal) obj).f.containsKey(name)) return ((RecordVal) obj).f.get(name);
    if (obj instanceof Money && name.equals("amount")) return ((Money) obj).amount;
    throw attrErr(obj, name);
  }

  static String[] fieldNames(String key) { String low = key.toLowerCase(java.util.Locale.ROOT); return new String[] { key, key.replace(' ', '_'), low, low.replace(' ', '_') }; }

  public static Object getField(Object obj, String key) {
    if (obj == null) throw MissingValue("This value is nothing, so it has no " + key + ".");
    String[] names = fieldNames(key);
    if (obj instanceof PyDict) {
      PyDict d = (PyDict) obj;
      for (String k : names) if (d.has(k)) return d.get(k);
      for (Object[] e : d.m.values()) if (pyStrip(pyStr(e[0])).toLowerCase(java.util.Locale.ROOT).equals(key.toLowerCase(java.util.Locale.ROOT))) return e[1];
      StringBuilder b = new StringBuilder();
      List<Object> ks = d.keys();
      for (int i = 0; i < ks.size(); i++) { if (i > 0) b.append(", "); b.append(pyStr(ks.get(i))); }
      throw MissingValue("There is no field \"" + key + "\". Fields here: " + b + ".");
    }
    for (String k : names) {
      if (obj instanceof RecordVal && ((RecordVal) obj).f.containsKey(k)) return ((RecordVal) obj).f.get(k);
      if (obj instanceof Money && k.equals("amount")) return ((Money) obj).amount;
    }
    throw MissingValue(describe(obj) + " has no field \"" + key + "\".");
  }

  public static Object addTo(Object target, Object value) { if (isList(target)) { asList(target).add(value); return target; } return add(target, value); }
  public static void appendTo(Object target, Object value) { if (!isList(target)) throw attrErr(target, "append"); asList(target).add(value); }
  public static void removeFrom(Object target, Object value) {
    if (target instanceof PyDict) { PyDict d = (PyDict) target; if (!d.has(value)) throw MissingValue("There is no entry for " + show(value) + " to remove."); d.delete(value); return; }
    if (!contains(target, value)) throw MissingValue(show(value) + " is not in the list, so it can't be removed.");
    if (!isList(target)) throw attrErr(target, "remove");
    List<Object> xs = asList(target);
    for (int i = 0; i < xs.size(); i++) if (xs.get(i) == value || eq(xs.get(i), value)) { xs.remove(i); return; }
  }
  public static void sortInPlace(Object target, Function<Object, Object> key, boolean desc) {
    if (!isList(target)) throw attrErr(target, "sort");
    ArrayList<Object> sorted = pySort(asList(target), key, desc);
    asList(target).clear();
    asList(target).addAll(sorted);
  }
  public static void reverseInPlace(Object target) { if (!isList(target)) throw attrErr(target, "reverse"); Collections.reverse(asList(target)); }

  /** never(cond, text, rule, value): a broken Never rule stops the program. */
  public static void never(Object cond, String text, int line, Object value) {
    if (truthy(cond)) throw RuleBroken(text + " (the rule on line " + line + "), but the value is " + show(value) + ".");
  }

  /** The operations written as words: the sum of, the first of, the words of, … */
  public static Object applyOp(String op, Object a) {
    switch (op) {
      case "sum": return totalOf(pyList(a));
      case "average": { List<Object> items = pyList(a); if (items.isEmpty()) throw MissingValue("I can't take the average of an empty list."); return divide(totalOf(items), BigInteger.valueOf(items.size())); }
      case "count": case "length": return pyLen(a);
      case "min": { List<Object> items = pyList(a); if (items.isEmpty()) throw MissingValue("An empty list has no smallest item."); Object best = items.get(0); for (int i = 1; i < items.size(); i++) if (compare("<", items.get(i), best)) best = items.get(i); return best; }
      case "max": { List<Object> items = pyList(a); if (items.isEmpty()) throw MissingValue("An empty list has no largest item."); Object best = items.get(0); for (int i = 1; i < items.size(); i++) if (compare(">", items.get(i), best)) best = items.get(i); return best; }
      case "first": { List<Object> items = pyList(a); if (items.isEmpty()) throw MissingValue("An empty list has no first item."); return items.get(0); }
      case "last": { List<Object> items = pyList(a); if (items.isEmpty()) throw MissingValue("An empty list has no last item."); return items.get(items.size() - 1); }
      case "words": { ArrayList<Object> out = new ArrayList<>(); for (Object p : pySplit(pyStr(a))) { String w = stripPunct((String) p); if (!w.isEmpty()) out.add(w); } return out; }
      case "lines": return splitLines(strMethod(a, "splitlines"));
      case "lowercase": return strMethod(a, "lower").toLowerCase(java.util.Locale.ROOT);
      case "uppercase": return strMethod(a, "upper").toUpperCase(java.util.Locale.ROOT);
      case "trimmed": return pyStrip(strMethod(a, "strip"));
      case "parts": return pySplit(textOf(a, "\"the parts of\""));
      case "abs": {
        if (a instanceof Money) return new Money(((Money) a).amount.abs());
        if (a instanceof Boolean || !isNumber(a)) throw KindMismatch("\"the absolute value of\" needs a number or money, but it is " + describe(a) + ".");
        return a instanceof BigInteger ? ((BigInteger) a).abs() : ((Dec) a).abs();
      }
      case "jsonText": return jsonText(a);
      case "jsonData": return jsonParse(textOf(a, "\"the JSON data in\""));
      case "keys": if (!(a instanceof PyDict)) throw attrErr(a, "keys"); return ((PyDict) a).keys();
      case "values": if (!(a instanceof PyDict)) throw attrErr(a, "values"); return ((PyDict) a).values();
      default: throw PyErr("NameError", "name '" + op + "' is not defined");
    }
  }

  /** "starts with" / "ends with": both sides must be text. */
  public static boolean affix(Object t, Object a, boolean end) {
    String what = end ? "\"ends with\"" : "\"starts with\"";
    textOf(t, what); textOf(a, what);
    return end ? ((String) t).endsWith((String) a) : ((String) t).startsWith((String) a);
  }

  /** a <= v <= hi, the way Python chains it: hi is worked out only when the first part holds. */
  public static boolean between(Object lo, Object v, Supplier<Object> hi) { if (!compare("<=", lo, v)) return false; return compare("<=", v, hi.get()); }
  /** `item in container`, with the item worked out first (as Python does). */
  public static boolean isIn(Object item, Object container) { return contains(container, item); }

  /** Expect: the checks, the way thunder_runtime.py's expect_* do them. */
  public static void expectTrue(Object v, String text) { if (!Boolean.TRUE.equals(v)) throw ExpectationFailed(text + ", but it was not true."); }
  public static void expectFailure(Runnable run, String text, Object msg) {
    try { run.run(); }
    catch (RuntimeException | StackOverflowError e) {
      TErr err = asPyErr(e);
      if (err.thunder && msg != null) {
        if (!(msg instanceof String)) throw TypeErr("'in <string>' requires string as left operand, not " + (msg instanceof BigInteger ? "int" : "object"));
        if (!err.getMessage().contains((String) msg)) throw ExpectationFailed(text + ", but it failed with \"" + err.getMessage() + "\".");
      }
      return;
    }
    throw ExpectationFailed(text + ", but it did not fail.");
  }
  public static void expectValue(Object actual, String full, String op, Object want, String text) {
    boolean ok = CHECK_NAMES.contains(full) ? check(full, actual, want) : !check(op, actual, want);
    if (!ok) throw ExpectationFailed(text + ", but it was " + show(actual) + ".");
  }
  static final Set<String> CHECK_NAMES = new HashSet<>(Arrays.asList("is", "is not", "at least", "at most", "more than", "less than", "nothing", "not nothing", "empty", "positive", "negative", "zero", "between", "in", "contains"));
  static boolean check(String name, Object a, Object b) {
    switch (name) {
      case "is": return eq(a, b);
      case "is not": return !eq(a, b);
      case "at least": return compare(">=", a, b);
      case "at most": return compare("<=", a, b);
      case "more than": return compare(">", a, b);
      case "less than": return compare("<", a, b);
      case "nothing": return a == null;
      case "not nothing": return a != null;
      case "empty": return eq(pyLen(a), BigInteger.ZERO);
      case "positive": return compare(">", a, BigInteger.ZERO);
      case "negative": return compare("<", a, BigInteger.ZERO);
      case "zero": return eq(a, BigInteger.ZERO);
      case "between": { List<Object> r = asList(b); return compare("<=", r.get(0), a) && compare("<=", a, r.get(1)); }
      case "in": return contains(b, a);
      case "contains": return contains(a, b);
      default: throw new IllegalArgumentException(name);
    }
  }

  /** describe_error(error) in thunder_runtime.py: "main.thunder, line 3 (reached from line 7): … [TC501]". */
  public static String describeError(TErr e) {
    List<Where> where = e.where != null ? e.where : Collections.emptyList();
    Where inner = where.isEmpty() ? null : where.get(where.size() - 1);
    String message = explain(e);
    String code = codeOf(e);
    if (code.equals("TC508") && !e.thunder) message = "Python code used by this line failed: " + message;
    String place = inner != null ? inner.file + ", line " + inner.line : "In the program";
    if (where.size() > 1 && inner != null) {
      StringBuilder b = new StringBuilder();
      for (int i = where.size() - 2; i >= 0; i--) { if (b.length() > 0) b.append(", then line "); b.append(where.get(i).line); }
      place += " (reached from line " + b + ")";
    }
    return place + ": " + message + "  [" + code + "]";
  }

  /** Values the generated code writes literally. */
  public static BigInteger i(String text) { return new BigInteger(text); }
  public static Dec dec(String text) { return Dec.parse(text); }
  public static Money money(String text) { return Money.of(text); }
  public static PyDate today() { return PyDate.todayDate(); }
  public static PyDate date(String text) { PyDate d = PyDate.parse(text); if (d == null) throw PyErr("ValueError", "Invalid isoformat string: '" + text + "'"); return d; }
  public static PyDict newMap() { return new PyDict(); }
  public static ArrayList<Object> list(Object... items) { return new ArrayList<>(Arrays.asList(items)); }

  // ── conversions and text helpers (thunder_runtime.py) ──────────────────────────────────────────────────────────

  static final Pattern NUMBER = Pattern.compile("^[+-]?(\\d[\\d_]*)(\\.\\d+)?$");

  public static Object toNumber(Object x) {
    if (isNumber(x)) return x;
    if (x instanceof Money) return ((Money) x).amount;
    if (x instanceof String) {
      String s = pyStrip((String) x).replace(",", "");
      if (NUMBER.matcher(s).matches()) return s.contains(".") ? Dec.parse(s) : new BigInteger(s.replace("_", ""));
    }
    throw ConversionFailed(describe(x) + " is not a number.");
  }
  public static Object toWhole(Object x) {
    Object n = toNumber(x);
    if (n instanceof BigInteger) return n;
    Dec d = (Dec) n;
    if (d.isIntegral()) return d.toBigInt();
    throw ConversionFailed(show(n) + " is not a whole number.");
  }
  public static Object toMoney(Object x) {
    if (x instanceof Money) return x;
    if (x instanceof String) {
      String s = pyStrip((String) x).replace(",", "");
      boolean negative = s.startsWith("-");
      s = s.replaceAll("^-+", "").replaceAll("^\\$+", "");
      if (NUMBER.matcher(s).matches()) return Money.of((negative ? "-" : "") + s);
      throw ConversionFailed(describe(x) + " is not an amount of money.");
    }
    return new Money(toDec(toNumber(x)));
  }
  public static Object toYesNo(Object x) {
    if (x instanceof Boolean) return x;
    if (x instanceof String) {
      String t = pyStrip((String) x).toLowerCase(java.util.Locale.ROOT);
      if (t.equals("yes") || t.equals("true")) return true;
      if (t.equals("no") || t.equals("false")) return false;
    }
    throw ConversionFailed(describe(x) + " is not yes or no.");
  }
  public static Object toDate(Object x) {
    if (x instanceof PyDate) return x;
    PyDate d = PyDate.parse(pyStrip(pyStr(x)));
    if (d != null) return d;
    throw ConversionFailed(describe(x) + " is not a date (write it as YYYY-MM-DD).");
  }

  static Object totalOf(List<Object> items) {
    if (items.isEmpty()) return BigInteger.ZERO;
    Object result = items.get(0);
    for (int i = 1; i < items.size(); i++) result = add(result, items.get(i));
    return result;
  }
  static String textOf(Object v, String what) {
    if (!(v instanceof String)) throw KindMismatch(what + " needs text, but it is " + describe(v) + ".");
    return (String) v;
  }
  public static String joined(Object items, Object sep) {
    String sp = textOf(sep, "\"joined with\"");
    StringBuilder b = new StringBuilder();
    List<Object> xs = pyIter(items);
    for (int i = 0; i < xs.size(); i++) {
      Object x = xs.get(i);
      if (!(x instanceof String)) throw KindMismatch("\"joined with\" joins text, but item " + (i + 1) + " is " + describe(x) + ". Turn it into text first.");
      if (i > 0) b.append(sp);
      b.append((String) x);
    }
    return b.toString();
  }
  public static ArrayList<Object> splitAt(Object text, Object sep) {
    String sp = textOf(sep, "\"split at\"");
    if (sp.isEmpty()) throw KindMismatch("\"split at\" needs something to split at, not empty text.");
    String t = textOf(text, "\"split at\"");
    ArrayList<Object> out = new ArrayList<>();
    int from = 0;
    for (;;) { int at = t.indexOf(sp, from); if (at < 0) { out.add(t.substring(from)); return out; } out.add(t.substring(from, at)); from = at + sp.length(); }
  }
  public static String replacing(Object text, Object old, Object nw) {
    String o = textOf(old, "\"replacing\"");
    if (o.isEmpty()) throw KindMismatch("\"replacing\" needs something to replace, not empty text.");
    String t = textOf(text, "\"replacing\"");
    String w = textOf(nw, "\"replacing … with\"");
    return t.replace(o, w);
  }
  static final Set<Integer> PUNCT = new HashSet<>();
  static { ".,;:!?\"'()[]{}<>“”‘’…-".codePoints().forEach(PUNCT::add); }
  static String stripPunct(String w) {
    int[] a = w.codePoints().toArray();
    int i = 0, j = a.length;
    while (i < j && PUNCT.contains(a[i])) i++;
    while (j > i && PUNCT.contains(a[j - 1])) j--;
    return new String(a, i, j - i);
  }

  // ── Running compiled Java: frames (for error lines), output, files, and the program or its tests ───────────────

  /** A call frame: the Thunder file and the line it is on. */
  public static final class Frame { public final String file; public int line; Frame(String file, int line) { this.file = file; this.line = line; } }

  static final ArrayList<Frame> frames = new ArrayList<>();
  static boolean aborted = false;
  static int exitCode = 0;
  /** Output goes through UTF-8 streams of its own (System.out's encoding depends on the machine). */
  public static PrintStream out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
  public static PrintStream err = new PrintStream(new FileOutputStream(FileDescriptor.err), true, StandardCharsets.UTF_8);

  static List<Where> snapshot() { ArrayList<Where> w = new ArrayList<>(); for (Frame f : frames) w.add(new Where(f.file, f.line)); return w; }

  /** A frame for a program, a test, or a kept value. */
  public static Frame enterFrame(String file, int line) {
    if (frames.size() >= MAX_FRAMES) throw PyErr("RecursionError", "maximum recursion depth exceeded");
    Frame f = new Frame(file, line);
    frames.add(f);
    return f;
  }
  /** A frame for a call; `first` is the Thunder line the function starts on (where Python stops when it is too deep). */
  public static Frame enterCall(String file, int line, Integer first) {
    if (frames.size() >= MAX_FRAMES) {
      TErr e = PyErr("RecursionError", "maximum recursion depth exceeded");
      if (first != null) { List<Where> w = snapshot(); w.add(new Where(file, first)); e.where = w; }
      throw e;
    }
    Frame f = new Frame(file, line);
    frames.add(f);
    return f;
  }
  public static void leave() { frames.remove(frames.size() - 1); }
  /** The innermost frame (a record's Never rule runs in its caller's frame). */
  public static Frame topFrame() { return frames.get(frames.size() - 1); }
  /** An error on its way out of a frame: remember where it happened (the innermost frames first seen). */
  public static TErr fail(Throwable e) { TErr t = asPyErr(e); if (t.where == null) t.where = snapshot(); return t; }
  static Object withFrame(Frame frame, Supplier<Object> fn) {
    if (frames.size() >= MAX_FRAMES) throw PyErr("RecursionError", "maximum recursion depth exceeded");
    frames.add(frame);
    try { return fn.get(); } catch (RuntimeException e) { throw fail(e); } finally { frames.remove(frames.size() - 1); }
  }
  /** A key for sorting by a field: it runs in a frame at the sorting line, as the generated Python's lambda does. */
  public static Function<Object, Object> keyAt(Frame F, Function<Object, Object> get) {
    Frame frame = new Frame(F.file, F.line);
    return (item) -> withFrame(frame, () -> get.apply(item));
  }
  /** Sets the frame's line, then goes on (for a condition: the line is set before the condition is worked out). */
  public static boolean at(Frame F, int line) { F.line = line; return true; }
  /** An expression worked out for what it does (a call), its value not kept. */
  public static void discard(Object v) {}

  /** One part of a map entry (a key and its value): 0 is the key, 1 the value. */
  public static Object pairPart(Object entry, int i) { return ((Tuple) entry).items.get(i); }
  public static ArrayList<Object> filter(List<Object> items, Predicate<Object> keep) { ArrayList<Object> out = new ArrayList<>(); for (Object x : items) if (keep.test(x)) out.add(x); return out; }
  public static ArrayList<Object> map(List<Object> items, Function<Object, Object> get) { ArrayList<Object> out = new ArrayList<>(); for (Object x : items) out.add(get.apply(x)); return out; }

  public static void say(String text) { out.print(text + "\n"); }
  /** The folder the program runs in, where it reads files (thunder.cwd when Thunder runs it elsewhere). */
  static Path cwd() { return Paths.get(System.getProperty("thunder.cwd", System.getProperty("user.dir"))); }
  public static String readText(Object path) {
    if (!(path instanceof String)) throw TypeErr("expected str, bytes or os.PathLike object, not " + (path == null ? "NoneType" : "object"));
    String p = (String) path;
    try {
      Path full = cwd().resolve(p);
      if (Files.isDirectory(full)) throw PyErr("IsADirectoryError", "EISDIR: illegal operation on a directory, read");
      return new String(Files.readAllBytes(full), StandardCharsets.UTF_8);
    } catch (NoSuchFileException e) {
      throw MissingValue("There is no file \"" + p + "\" (looked in the folder the program runs in).");
    } catch (IOException e) {
      throw PyErr("OSError", String.valueOf(e.getMessage()));
    }
  }

  /** Records: their kind (name, fields, and Never rules), making one, and setting a field. */
  public static RecordKind recordKind(String py, Field[] fields, Map<String, List<Rule>> rules) { return new RecordKind(py, Arrays.asList(fields), rules); }
  public static RecordKind recordKind(String py, Field[] fields) { return new RecordKind(py, Arrays.asList(fields), new HashMap<>()); }
  public static Map<String, List<Rule>> rules(Object... pairs) { Map<String, List<Rule>> m = new HashMap<>(); for (int i = 0; i < pairs.length; i += 2) m.put((String) pairs[i], Arrays.asList((Rule[]) pairs[i + 1])); return m; }
  public static void setAttr(Object obj, String name, Object value) {
    if (obj instanceof RecordVal) {
      RecordVal rec = (RecordVal) obj;
      List<Rule> rs = rec.cls.rules.get(name);
      if (rs != null) for (Rule r : rs) never(r.cond.apply(value), r.text, r.line, value);
      rec.f.put(name, value);
      return;
    }
    if (obj instanceof Money) throw PyErr("AttributeError", "Money cannot be changed; make new money instead.");
    throw attrErr(obj, name);
  }
  public static void setField(Object obj, String key, Object value) {
    if (obj instanceof PyDict) { ((PyDict) obj).set(key, value); return; }
    for (String k : fieldNames(key)) if (obj instanceof RecordVal && ((RecordVal) obj).f.containsKey(k)) { setAttr(obj, k, value); return; }
    throw MissingValue(describe(obj) + " has no field \"" + key + "\".");
  }
  /** A record: the fields it is given, the others defaulted; each set through setAttr (its Never rules). */
  public static RecordVal newRecord(RecordKind cls, Object... pairs) {
    LinkedHashMap<String, Object> given = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) given.put((String) pairs[i], pairs[i + 1]);
    RecordVal rec = new RecordVal(cls);
    ArrayList<String> missing = new ArrayList<>();
    for (Field f : cls.fields) if (!given.containsKey(f.py) && !f.kind.equals("optional") && !f.kind.equals("list") && !f.kind.equals("map")) missing.add("'" + f.py + "'");
    if (!missing.isEmpty()) throw TypeErr(cls.py + ".__init__() missing " + missing.size() + " required keyword-only argument" + (missing.size() == 1 ? "" : "s") + ": " + String.join(missing.size() == 2 ? " and " : ", ", missing));
    for (Field f : cls.fields) {
      Object v = given.containsKey(f.py) ? given.get(f.py) : f.kind.equals("optional") ? null : f.kind.equals("list") ? new ArrayList<Object>() : new PyDict();
      setAttr(rec, f.py, v);
    }
    return rec;
  }

  static void report(Throwable e) { err.print(describeError(asPyErr(e)) + "\n"); exitCode = 1; aborted = true; }
  /** A body that works out a file's kept values. */
  public interface KeptValues { void run(Frame F); }
  /** Work out a file's kept values; an error stops the program with a Thunder message. */
  public static void init(String file, KeptValues fn) {
    if (aborted) return;
    Frame F = new Frame(file, 0);
    try { withFrame(F, () -> { fn.run(F); return null; }); } catch (RuntimeException e) { report(e); }
  }

  /** Python allows about 1000 nested calls; the program runs on a thread with a stack deep enough for that. */
  static void onBigStack(Runnable body) {
    Throwable[] crash = { null };
    Thread t = new Thread(null, () -> { try { body.run(); } catch (Throwable e) { crash[0] = e; } }, "thunder", 1L << 30);
    t.start();
    try { t.join(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    if (crash[0] instanceof RuntimeException) throw (RuntimeException) crash[0];
    if (crash[0] instanceof Error) throw (Error) crash[0];
  }

  /** Run the program; stop with exit code 1 after an error, as `python main.py` does. */
  public static void run(Runnable main) {
    if (!aborted) onBigStack(() -> { try { main.run(); } catch (RuntimeException | StackOverflowError e) { report(e); } });
    finish();
  }
  /** Every Test block, the way run_tests.py runs them: one line per test, then the totals. */
  public static void runTests(Object[][] modules) {
    if (!aborted) onBigStack(() -> {
      int passed = 0, failed = 0;
      for (Object[] mod : modules) {
        String file = (String) mod[0];
        for (Object[] t : (Object[][]) mod[1]) {
          String title = (String) t[0]; Runnable fn = (Runnable) t[1]; int line = (Integer) t[2];
          try { fn.run(); passed++; say("PASS  " + title + " (" + file + ", line " + line + ")"); }
          catch (RuntimeException | StackOverflowError e) { failed++; say("FAIL  " + title + " (" + file + ", line " + line + ")"); say("      " + describeError(asPyErr(e))); }
        }
      }
      int total = passed + failed;
      say(total + " test" + (total == 1 ? "" : "s") + ": " + passed + " passed, " + failed + " failed");
      if (failed > 0) exitCode = 1;
    });
    finish();
  }

  /** Embedded (Thunder runs many programs in one Java process): finishing records the exit code instead of exiting. */
  public static boolean embedded = Boolean.getBoolean("thunder.embedded");
  static void finish() {
    out.flush(); err.flush();
    if (!embedded) System.exit(exitCode);
  }
  /** The exit code (for an embedding process), and a fresh start for the next program. */
  public static int takeExitCode() { int c = exitCode; exitCode = 0; aborted = false; frames.clear(); return c; }
}
