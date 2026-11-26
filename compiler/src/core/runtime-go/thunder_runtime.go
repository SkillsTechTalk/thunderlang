// thunder_runtime.go: written by the Thunder compiler next to compiled Go. Standard library only.
//
// The values and rules here are the Thunder engine's own (compiler/src/core/engine-values.mjs), ported to Go, so
// compiled Go, the Thunder engine, compiled TypeScript, and compiled Python say the same thing for the same program.
// The compiler's conformance tests run every Core test program on all four and require the same output.
//
// Values:  whole number -> *big.Int      decimal number -> *Dec (exact, like Python's Decimal)
//          money -> *Money               text -> string      yes/no -> bool      nothing -> nil
//          list -> *List (a pair from a map is a *Tuple)    map -> *Dict
//          record -> *Record             date -> *Date
package thunder

import (
	"bufio"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// V is any Thunder value.
type V = interface{}

// ── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────────

// Place is one frame of where an error happened: the Thunder file and line.
type Place struct {
	File string
	Line int
}

// Err is a Thunder error (Thunder: true, code TC5xx) or an error Python itself raises (PyType, Python's message).
type Err struct {
	Thunder bool
	Code    string
	PyType  string
	Message string
	Args    []V
	Where   []Place
	HasArgs bool
}

func (e *Err) Error() string { return e.Message }

func thunderErr(code, msg, pyType string) *Err {
	return &Err{Thunder: true, Code: code, PyType: pyType, Message: msg}
}

// Stop is "Stop with": TC507.
func Stop(m V) *Err                { return thunderErr("TC507", m.(string), "Stop") }
func RuleBroken(m string) *Err     { return thunderErr("TC504", m, "RuleBroken") }
func ExpectationFailed(m string) *Err { return thunderErr("TC505", m, "ExpectationFailed") }
func KindMismatch(m string) *Err   { return thunderErr("TC506", m, "TypeError") }
func ConversionFailed(m string) *Err { return thunderErr("TC509", m, "ValueError") }
func MissingValue(m string) *Err   { return thunderErr("TC503", m, "LookupError") }
func DividedByZero(m string) *Err  { return thunderErr("TC501", m, "ZeroDivisionError") }

// PyErr is an error Python raises, with Python's message.
func PyErr(pyType, m string) *Err { return &Err{PyType: pyType, Message: m} }
func TypeErr(m string) *Err       { return PyErr("TypeError", m) }

// Explain is explain(error) in thunder_runtime.py: the error as a sentence.
func Explain(e *Err) string {
	if e.Thunder {
		return e.Message
	}
	t := e.PyType
	switch {
	case t == "ZeroDivisionError" || t == "DivisionByZero":
		return "You divided by zero."
	case t == "InvalidOperation":
		return "This calculation has no answer (for example, zero divided by zero)."
	case t == "KeyError":
		var a V
		if len(e.Args) > 0 {
			a = e.Args[0]
		}
		return "There is no entry for " + Show(a) + "."
	case (t == "TypeError" || t == "AttributeError") && strings.Contains(e.Message, "NoneType"):
		return "A value was nothing where a value was needed."
	case t == "TypeError":
		return "Values of different kinds were mixed (" + e.Message + ")."
	case t == "RecursionError":
		return "A function called itself too many times."
	}
	return t + ": " + e.Message
}

func codeOf(e *Err) string {
	if e.Thunder {
		return e.Code
	}
	t := e.PyType
	switch {
	case t == "ZeroDivisionError" || t == "DivisionByZero":
		return "TC501"
	case (t == "TypeError" || t == "AttributeError") && strings.Contains(e.Message, "NoneType"):
		return "TC502"
	case t == "KeyError":
		return "TC503"
	case t == "TypeError":
		return "TC506"
	}
	return "TC508"
}

// AsPyErr gives back a Thunder or Python error; anything else (a bug) goes on as it was.
func AsPyErr(r V) *Err {
	if e, ok := r.(*Err); ok {
		return e
	}
	panic(r)
}

// ── Exact decimals: Python's Decimal with its default context (28 digits, half-even when a result is too long) ──

const prec = 28

var (
	bigZero = big.NewInt(0)
	bigOne  = big.NewInt(1)
	bigTwo  = big.NewInt(2)
	bigFive = big.NewInt(5)
	bigTen  = big.NewInt(10)
)

func pow10(n int) *big.Int {
	if n <= 0 {
		return big.NewInt(1)
	}
	return new(big.Int).Exp(bigTen, big.NewInt(int64(n)), nil)
}
func ndigits(c *big.Int) int {
	if c.Sign() == 0 {
		return 1
	}
	return len(c.String())
}

// Dec is an exact decimal: sign (0 or 1), coefficient >= 0, exponent.
type Dec struct {
	S int
	C *big.Int
	E int
}

func decInt(n *big.Int) *Dec {
	if n.Sign() < 0 {
		return &Dec{1, new(big.Int).Neg(n), 0}
	}
	return &Dec{0, new(big.Int).Set(n), 0}
}

func decOf(x V) *Dec {
	switch v := x.(type) {
	case *Dec:
		return v
	case *big.Int:
		return decInt(v)
	case bool:
		if v {
			return decInt(bigOne)
		}
		return decInt(bigZero)
	}
	return nil
}

// ParseDec is Decimal("text"): exact; nil when the text is not a number.
func ParseDec(text string) *Dec {
	s := strings.ReplaceAll(strings.TrimSpace(text), "_", "")
	sign := 0
	if strings.HasPrefix(s, "+") || strings.HasPrefix(s, "-") {
		if s[0] == '-' {
			sign = 1
		}
		s = s[1:]
	}
	exp := 0
	if k := strings.IndexAny(s, "eE"); k >= 0 {
		ev, err := strconv.Atoi(s[k+1:])
		if err != nil || s[k+1:] == "" {
			return nil
		}
		exp = ev
		s = s[:k]
	}
	ip, fp := s, ""
	if k := strings.IndexByte(s, '.'); k >= 0 {
		ip, fp = s[:k], s[k+1:]
	}
	if ip == "" && fp == "" {
		return nil
	}
	for _, ch := range ip + fp {
		if ch < '0' || ch > '9' {
			return nil
		}
	}
	digits := ip + fp
	if digits == "" {
		digits = "0"
	}
	c, _ := new(big.Int).SetString(digits, 10)
	return &Dec{sign, c, exp - len(fp)}
}

func (d *Dec) isZero() bool { return d.C.Sign() == 0 }

func (d *Dec) fix() *Dec {
	n := ndigits(d.C) - prec
	if n <= 0 {
		return d
	}
	p := pow10(n)
	q, r := new(big.Int).QuoRem(d.C, p, new(big.Int))
	half := new(big.Int).Mul(bigFive, pow10(n-1))
	c := r.Cmp(half)
	if c > 0 || (c == 0 && q.Bit(0) == 1) {
		q.Add(q, bigOne)
	}
	e := d.E + n
	if ndigits(q) > prec {
		q.Quo(q, bigTen)
		e++
	}
	return &Dec{d.S, q, e}
}

func (d *Dec) signed() *big.Int {
	if d.S == 1 {
		return new(big.Int).Neg(d.C)
	}
	return new(big.Int).Set(d.C)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func decAdd(a, b *Dec) *Dec {
	e := minInt(a.E, b.E)
	x := new(big.Int).Mul(a.signed(), pow10(a.E-e))
	y := new(big.Int).Mul(b.signed(), pow10(b.E-e))
	sum := new(big.Int).Add(x, y)
	var s int
	if sum.Sign() == 0 {
		if a.S == 1 && b.S == 1 && a.C.Sign() == 0 && b.C.Sign() == 0 {
			s = 1
		} else if a.C.Sign() == 0 && b.C.Sign() == 0 {
			s = minInt(a.S, b.S)
		} else {
			s = 0
		}
	} else if sum.Sign() < 0 {
		s = 1
	}
	return (&Dec{s, new(big.Int).Abs(sum), e}).fix()
}
func (d *Dec) negated() *Dec { return &Dec{1 - d.S, d.C, d.E} }
func decSub(a, b *Dec) *Dec  { return decAdd(a, b.negated()) }
func decMul(a, b *Dec) *Dec {
	return (&Dec{a.S ^ b.S, new(big.Int).Mul(a.C, b.C), a.E + b.E}).fix()
}

func decDiv(a, b *Dec) *Dec {
	s := a.S ^ b.S
	if a.C.Sign() == 0 {
		return (&Dec{s, big.NewInt(0), a.E - b.E}).fix()
	}
	shift := ndigits(b.C) - ndigits(a.C) + prec + 1
	exp := a.E - b.E - shift
	var coeff, rem *big.Int
	if shift >= 0 {
		n := new(big.Int).Mul(a.C, pow10(shift))
		coeff, rem = new(big.Int).QuoRem(n, b.C, new(big.Int))
	} else {
		dd := new(big.Int).Mul(b.C, pow10(-shift))
		coeff, rem = new(big.Int).QuoRem(a.C, dd, new(big.Int))
	}
	if rem.Sign() != 0 {
		if new(big.Int).Rem(coeff, bigFive).Sign() == 0 {
			coeff.Add(coeff, bigOne)
		}
	} else {
		ideal := a.E - b.E
		for exp < ideal && new(big.Int).Rem(coeff, bigTen).Sign() == 0 {
			coeff.Quo(coeff, bigTen)
			exp++
		}
	}
	return (&Dec{s, coeff, exp}).fix()
}

func decRem(a, b *Dec) *Dec {
	e := minInt(a.E, b.E)
	x := new(big.Int).Mul(a.C, pow10(a.E-e))
	y := new(big.Int).Mul(b.C, pow10(b.E-e))
	return (&Dec{a.S, new(big.Int).Rem(x, y), e}).fix()
}

func (d *Dec) neg() *Dec {
	if d.C.Sign() == 0 {
		return (&Dec{0, big.NewInt(0), d.E}).fix()
	}
	return d.negated().fix()
}
func (d *Dec) abs() *Dec { return (&Dec{0, d.C, d.E}).fix() }

func decCmp(a, b *Dec) int {
	e := minInt(a.E, b.E)
	x := new(big.Int).Mul(a.signed(), pow10(a.E-e))
	y := new(big.Int).Mul(b.signed(), pow10(b.E-e))
	return x.Cmp(y)
}

func (d *Dec) quantizeHalfUp(e int) *Dec {
	if e <= d.E {
		return &Dec{d.S, new(big.Int).Mul(d.C, pow10(d.E-e)), e}
	}
	p := pow10(e - d.E)
	q, r := new(big.Int).QuoRem(d.C, p, new(big.Int))
	if new(big.Int).Mul(r, bigTwo).Cmp(p) >= 0 {
		q.Add(q, bigOne)
	}
	return &Dec{d.S, q, e}
}

func (d *Dec) isIntegral() bool {
	if d.E >= 0 {
		return true
	}
	return new(big.Int).Rem(d.C, pow10(-d.E)).Sign() == 0
}

func (d *Dec) toBigInt() *big.Int {
	var v *big.Int
	if d.E >= 0 {
		v = new(big.Int).Mul(d.C, pow10(d.E))
	} else {
		v = new(big.Int).Quo(d.C, pow10(-d.E))
	}
	if d.S == 1 {
		v.Neg(v)
	}
	return v
}

// String is str(Decimal): Python's to-scientific-string.
func (d *Dec) String() string {
	digits := d.C.String()
	left := d.E + len(digits)
	dot := 1
	if d.E <= 0 && left > -6 {
		dot = left
	}
	var ip, fp string
	switch {
	case dot <= 0:
		ip, fp = "0", "."+strings.Repeat("0", -dot)+digits
	case dot >= len(digits):
		ip, fp = digits+strings.Repeat("0", dot-len(digits)), ""
	default:
		ip, fp = digits[:dot], "."+digits[dot:]
	}
	ex := ""
	if left != dot {
		x := left - dot
		if x >= 0 {
			ex = "E+" + strconv.Itoa(x)
		} else {
			ex = "E" + strconv.Itoa(x)
		}
	}
	sign := ""
	if d.S == 1 {
		sign = "-"
	}
	return sign + ip + fp + ex
}

func groupThousands(ip string) string {
	if len(ip) <= 3 {
		return ip
	}
	var b strings.Builder
	first := len(ip) % 3
	if first > 0 {
		b.WriteString(ip[:first])
	}
	for i := first; i < len(ip); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(ip[i : i+3])
	}
	return b.String()
}

// toFixed is format(d, "f") (places < 0: as it is) or format(d, ",.Nf").
func (d *Dec) toFixed(places int, group bool) string {
	x := d
	if places >= 0 {
		x = d.roundHalfEven(-places)
	}
	digits := x.C.String()
	dot := x.E + len(digits)
	var ip, fp string
	switch {
	case dot < 0:
		ip, fp = "0", strings.Repeat("0", -dot)+digits
	case dot > len(digits):
		ip, fp = digits+strings.Repeat("0", dot-len(digits)), ""
	default:
		ip, fp = digits[:dot], digits[dot:]
		if ip == "" {
			ip = "0"
		}
	}
	if group {
		ip = groupThousands(ip)
	}
	sign := ""
	if x.S == 1 {
		sign = "-"
	}
	if fp != "" {
		return sign + ip + "." + fp
	}
	return sign + ip
}

func (d *Dec) roundHalfEven(e int) *Dec {
	if e <= d.E {
		return &Dec{d.S, new(big.Int).Mul(d.C, pow10(d.E-e)), e}
	}
	p := pow10(e - d.E)
	q, r := new(big.Int).QuoRem(d.C, p, new(big.Int))
	r2 := new(big.Int).Mul(r, bigTwo)
	c := r2.Cmp(p)
	if c > 0 || (c == 0 && q.Bit(0) == 1) {
		q.Add(q, bigOne)
	}
	return &Dec{d.S, q, e}
}

// key: equal for equal numbers (1 and 1.0 and 1.00 are the same map key, as in Python).
func (d *Dec) key() string {
	if d.C.Sign() == 0 {
		return "0"
	}
	c, e := new(big.Int).Set(d.C), d.E
	for new(big.Int).Rem(c, bigTen).Sign() == 0 {
		c.Quo(c, bigTen)
		e++
	}
	sign := ""
	if d.S == 1 {
		sign = "-"
	}
	return sign + c.String() + "e" + strconv.Itoa(e)
}

// ── Money ──────────────────────────────────────────────────────────────────────────────────────────────────────

// Money is an exact amount of money.
type Money struct{ Amount *Dec }

func moneyOf(x V) *Money {
	if m, ok := x.(*Money); ok {
		return m
	}
	if s, ok := x.(string); ok {
		d := ParseDec(strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, ",", ""), "$", "")))
		if d == nil {
			panic(PyErr("InvalidOperation", "[<class 'decimal.ConversionSyntax'>]"))
		}
		return &Money{d}
	}
	return &Money{toDec(x)}
}

func (m *Money) String() string {
	a := m.Amount
	places := 2
	if a.E < 0 && -a.E > 2 {
		places = -a.E
	}
	prefix := "$"
	if a.S == 1 && a.C.Sign() != 0 {
		prefix = "-$"
	}
	return prefix + a.abs().toFixed(places, true)
}

func moneyOther(other V, verb string) *Dec {
	if m, ok := other.(*Money); ok {
		return m.Amount
	}
	if isNumber(other) && numCmp(other, bigZero) == 0 {
		return decInt(bigZero)
	}
	panic(KindMismatch("I can't " + verb + " money and " + describe(other) + ". Write the number as money, for example $5."))
}

// ── Other kinds ────────────────────────────────────────────────────────────────────────────────────────────────

// Date is a calendar date.
type Date struct{ Y, M, D int }

func (d *Date) iso() string { return fmt.Sprintf("%04d-%02d-%02d", d.Y, d.M, d.D) }
func (d *Date) num() int    { return d.Y*10000 + d.M*100 + d.D }

var dateRe = regexp.MustCompile(`^(\d{4})-?(\d{2})-?(\d{2})$`)

func parseDate(text string) *Date {
	m := dateRe.FindStringSubmatch(text)
	if m == nil {
		return nil
	}
	y, _ := strconv.Atoi(m[1])
	mo, _ := strconv.Atoi(m[2])
	d, _ := strconv.Atoi(m[3])
	feb := 28
	if (y%4 == 0 && y%100 != 0) || y%400 == 0 {
		feb = 29
	}
	days := []int{31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo-1] {
		return nil
	}
	return &Date{y, mo, d}
}

// Tuple is a pair (or more) of values, as a map gives them.
type Tuple struct{ Items []V }

// List is a Thunder list (it changes in place, as Python's does).
type List struct{ Items []V }

type notGiven struct{}

// NotGiven stands for an input a call left out.
var NotGiven = &notGiven{}

type dictEntry struct {
	k V
	v V
}

// Dict is a Python dict: insertion order kept; keys equal the way Python compares them (1 == 1.0 == True).
type Dict struct {
	order []string
	m     map[string]*dictEntry
}

func NewMap() V { return &Dict{m: map[string]*dictEntry{}} }
func newDict() *Dict { return &Dict{m: map[string]*dictEntry{}} }

func keyOf(k V) string {
	switch v := k.(type) {
	case nil:
		return "N"
	case string:
		return "s" + v
	case bool, *big.Int, *Dec:
		return "n" + decOf(v).key()
	case *Money:
		return "m" + v.Amount.key()
	case *Date:
		return "d" + v.iso()
	case *Tuple:
		parts := make([]string, len(v.Items))
		for i, x := range v.Items {
			parts[i] = keyOf(x)
		}
		return "t(" + strings.Join(parts, ",") + ")"
	}
	if k == NotGiven {
		return "G"
	}
	panic(TypeErr("unhashable type: '" + typeName(k) + "'"))
}

func (d *Dict) has(k V) bool { _, ok := d.m[keyOf(k)]; return ok }
func (d *Dict) get(k V) (V, bool) {
	e, ok := d.m[keyOf(k)]
	if !ok {
		return nil, false
	}
	return e.v, true
}
func (d *Dict) set(k, v V) {
	id := keyOf(k)
	if e, ok := d.m[id]; ok {
		e.v = v
		return
	}
	d.m[id] = &dictEntry{k, v}
	d.order = append(d.order, id)
}
func (d *Dict) del(k V) {
	id := keyOf(k)
	if _, ok := d.m[id]; !ok {
		return
	}
	delete(d.m, id)
	for i, x := range d.order {
		if x == id {
			d.order = append(d.order[:i:i], d.order[i+1:]...)
			break
		}
	}
}
func (d *Dict) size() int { return len(d.order) }
func (d *Dict) entries() []*dictEntry {
	out := make([]*dictEntry, len(d.order))
	for i, id := range d.order {
		out[i] = d.m[id]
	}
	return out
}
func (d *Dict) keys() []V {
	out := make([]V, len(d.order))
	for i, id := range d.order {
		out[i] = d.m[id].k
	}
	return out
}
func (d *Dict) values() []V {
	out := make([]V, len(d.order))
	for i, id := range d.order {
		out[i] = d.m[id].v
	}
	return out
}
func (d *Dict) items() []V {
	out := make([]V, len(d.order))
	for i, id := range d.order {
		e := d.m[id]
		out[i] = &Tuple{[]V{e.k, e.v}}
	}
	return out
}

// Field is a record's field: its name and kind.
type Field struct {
	Py   string
	Kind string
}

// Rule is a Never rule on a record's field.
type Rule struct {
	Cond func(value V) V
	Text string
	Line int
}

// RecordKind is a kind of record (a Python dataclass): its name, fields, and Never rules by field.
type RecordKind struct {
	Py     string
	Fields []Field
	Rules  map[string][]Rule
}

// Record is a record value: its kind and field values.
type Record struct {
	Cls *RecordKind
	F   map[string]V
}

// ── Kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────

func isInt(x V) bool    { _, ok := x.(*big.Int); return ok }
func isNumber(x V) bool { switch x.(type) { case *big.Int, *Dec: return true }; return false }
func isIntLike(x V) bool {
	switch x.(type) {
	case *big.Int, bool:
		return true
	}
	return false
}
func isNumLike(x V) bool { return isIntLike(x) || isDec(x) }
func isDec(x V) bool     { _, ok := x.(*Dec); return ok }
func asBig(x V) *big.Int {
	switch v := x.(type) {
	case bool:
		if v {
			return big.NewInt(1)
		}
		return big.NewInt(0)
	case *big.Int:
		return v
	}
	return nil
}
func numCmp(a, b V) int {
	if isIntLike(a) && isIntLike(b) {
		return asBig(a).Cmp(asBig(b))
	}
	return decCmp(decOf(a), decOf(b))
}

func typeName(v V) string {
	switch x := v.(type) {
	case nil:
		return "NoneType"
	case bool:
		return "bool"
	case *big.Int:
		return "int"
	case string:
		return "str"
	case *Dec:
		return "decimal.Decimal"
	case *Money:
		return "Money"
	case *List:
		return "list"
	case *Tuple:
		return "tuple"
	case *Dict:
		return "dict"
	case *Date:
		return "datetime.date"
	case *Record:
		return x.Cls.Py
	}
	if v == NotGiven {
		return "_NotGiven"
	}
	return "object"
}

func shortName(v V) string {
	switch v.(type) {
	case *Dec:
		return "Decimal"
	case *Date:
		return "date"
	}
	return typeName(v)
}

func describe(v V) string {
	switch x := v.(type) {
	case nil:
		return "nothing"
	case bool:
		return "a yes/no value"
	case string:
		return "the text \"" + x + "\""
	case *Money:
		return x.String()
	}
	if isNumber(v) {
		return "the number " + Show(v)
	}
	return "a value (" + shortName(v) + ")"
}

func trimDecimalZeros(t string) string {
	if !strings.Contains(t, ".") {
		return t
	}
	t = strings.TrimRight(t, "0")
	return strings.TrimSuffix(t, ".")
}

// Show is show(v): a value the way Thunder says it.
func Show(v V) string {
	switch x := v.(type) {
	case nil:
		return "nothing"
	case bool:
		if x {
			return "yes"
		}
		return "no"
	case *Dec:
		return trimDecimalZeros(x.toFixed(-1, false))
	case *List:
		return "[" + joinShow(x.Items, Show) + "]"
	case *Tuple:
		return "[" + joinShow(x.Items, Show) + "]"
	case *Dict:
		parts := []string{}
		for _, e := range x.entries() {
			parts = append(parts, Show(e.k)+": "+Show(e.v))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case *Record:
		parts := []string{}
		for _, f := range x.Cls.Fields {
			parts = append(parts, strings.ReplaceAll(f.Py, "_", " ")+": "+Show(x.F[f.Py]))
		}
		return x.Cls.Py + "(" + strings.Join(parts, ", ") + ")"
	case *Date:
		return x.iso()
	}
	return PyStr(v)
}

func joinShow(items []V, f func(V) string) string {
	parts := make([]string, len(items))
	for i, x := range items {
		parts[i] = f(x)
	}
	return strings.Join(parts, ", ")
}

func pyRepr(v V) string {
	switch x := v.(type) {
	case string:
		q := "'"
		if strings.Contains(x, "'") && !strings.Contains(x, "\"") {
			q = "\""
		}
		var b strings.Builder
		for _, ch := range x {
			switch {
			case ch == '\\':
				b.WriteString("\\\\")
			case string(ch) == q:
				b.WriteString("\\" + q)
			case ch == '\n':
				b.WriteString("\\n")
			case ch == '\r':
				b.WriteString("\\r")
			case ch == '\t':
				b.WriteString("\\t")
			case ch < 0x20 || ch == 0x7f:
				b.WriteString(fmt.Sprintf("\\x%02x", ch))
			default:
				b.WriteRune(ch)
			}
		}
		return q + b.String() + q
	case nil:
		return "None"
	case bool:
		if x {
			return "True"
		}
		return "False"
	case *big.Int:
		return x.String()
	case *Dec:
		return "Decimal('" + x.String() + "')"
	case *Money:
		return "Money('" + x.Amount.toFixed(-1, false) + "')"
	case *List:
		return "[" + joinShow(x.Items, pyRepr) + "]"
	case *Tuple:
		if len(x.Items) == 1 {
			return "(" + pyRepr(x.Items[0]) + ",)"
		}
		return "(" + joinShow(x.Items, pyRepr) + ")"
	case *Dict:
		parts := []string{}
		for _, e := range x.entries() {
			parts = append(parts, pyRepr(e.k)+": "+pyRepr(e.v))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case *Date:
		return fmt.Sprintf("datetime.date(%d, %d, %d)", x.Y, x.M, x.D)
	case *Record:
		parts := []string{}
		for _, f := range x.Cls.Fields {
			parts = append(parts, f.Py+"="+pyRepr(x.F[f.Py]))
		}
		return x.Cls.Py + "(" + strings.Join(parts, ", ") + ")"
	}
	if v == NotGiven {
		return "not given"
	}
	return fmt.Sprint(v)
}

// PyStr is Python's str(v).
func PyStr(v V) string {
	switch x := v.(type) {
	case string:
		return x
	case *Money:
		return x.String()
	case *Date:
		return x.iso()
	case *Dec:
		return x.String()
	}
	return pyRepr(v)
}

// Truthy is Python's truth value (used where the generated Python uses it: "where" conditions and Never rules).
func Truthy(v V) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case *big.Int:
		return x.Sign() != 0
	case *Dec:
		return !x.isZero()
	case string:
		return len(x) > 0
	case *List:
		return len(x.Items) > 0
	case *Tuple:
		return len(x.Items) > 0
	case *Dict:
		return x.size() > 0
	}
	return true
}

// YesNo is yes_no(v): a condition needs a real yes/no value.
func YesNo(v V) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	panic(KindMismatch("This needs a yes/no value, but it is " + describe(v) + ". Compare it instead, for example: is 0, is empty, is nothing."))
}

func toDec(x V) *Dec {
	switch v := x.(type) {
	case *Dec:
		return v
	case bool:
		panic(KindMismatch("A yes/no value was used where a number was needed."))
	case *big.Int:
		return decInt(v)
	case nil:
		panic(KindMismatch("A value was nothing where a number was needed."))
	}
	panic(KindMismatch(describe(x) + " was used where a number was needed."))
}

// ── Python operators ───────────────────────────────────────────────────────────────────────────────────────────

func runes(s string) []string {
	out := make([]string, 0, len(s))
	for _, r := range s {
		out = append(out, string(r))
	}
	return out
}

func PyLen(v V) V {
	switch x := v.(type) {
	case string:
		return big.NewInt(int64(utf8.RuneCountInString(x)))
	case *List:
		return big.NewInt(int64(len(x.Items)))
	case *Tuple:
		return big.NewInt(int64(len(x.Items)))
	case *Dict:
		return big.NewInt(int64(x.size()))
	}
	panic(TypeErr("object of type '" + typeName(v) + "' has no len()"))
}

// Iter goes through a value the way Python's for loop does (a list is read live, as it changes).
type Iter struct {
	list  *List
	items []V
}

func PyIter(v V) *Iter {
	switch x := v.(type) {
	case *List:
		return &Iter{list: x}
	case *Tuple:
		return &Iter{items: x.Items}
	case string:
		rs := runes(x)
		items := make([]V, len(rs))
		for i, r := range rs {
			items[i] = r
		}
		return &Iter{items: items}
	case *Dict:
		return &Iter{items: x.keys()}
	}
	panic(TypeErr("'" + typeName(v) + "' object is not iterable"))
}

// Next is the k-th item (from 0), or false when there is none.
func (it *Iter) Next(k int) (V, bool) {
	if it.list != nil {
		if k < len(it.list.Items) {
			return it.list.Items[k], true
		}
		return nil, false
	}
	if k < len(it.items) {
		return it.items[k], true
	}
	return nil, false
}

func iterItems(v V) []V {
	it := PyIter(v)
	if it.list != nil {
		return append([]V{}, it.list.Items...)
	}
	return it.items
}

func PyList(v V) V { return &List{iterItems(v)} }

func NewList(items ...V) V { return &List{items} }

func Add(a, b V) V {
	if m, ok := a.(*Money); ok {
		return &Money{decAdd(m.Amount, moneyOther(b, "add"))}
	}
	if m, ok := b.(*Money); ok {
		return &Money{decAdd(m.Amount, moneyOther(a, "add"))}
	}
	if isIntLike(a) && isIntLike(b) {
		return new(big.Int).Add(asBig(a), asBig(b))
	}
	if isNumLike(a) && isNumLike(b) {
		return decAdd(decOf(a), decOf(b))
	}
	if s, ok := a.(string); ok {
		if t, ok := b.(string); ok {
			return s + t
		}
		panic(TypeErr("can only concatenate str (not \"" + typeName(b) + "\") to str"))
	}
	if l, ok := a.(*List); ok {
		if r, ok := b.(*List); ok {
			items := append(append([]V{}, l.Items...), r.Items...)
			return &List{items}
		}
		panic(TypeErr("can only concatenate list (not \"" + typeName(b) + "\") to list"))
	}
	if l, ok := a.(*Tuple); ok {
		if r, ok := b.(*Tuple); ok {
			return &Tuple{append(append([]V{}, l.Items...), r.Items...)}
		}
		panic(TypeErr("can only concatenate tuple (not \"" + typeName(b) + "\") to tuple"))
	}
	panic(TypeErr("unsupported operand type(s) for +: '" + typeName(a) + "' and '" + typeName(b) + "'"))
}

func Sub(a, b V) V {
	if m, ok := a.(*Money); ok {
		return &Money{decSub(m.Amount, moneyOther(b, "subtract"))}
	}
	if m, ok := b.(*Money); ok {
		return &Money{decSub(moneyOther(a, "subtract"), m.Amount)}
	}
	if isIntLike(a) && isIntLike(b) {
		return new(big.Int).Sub(asBig(a), asBig(b))
	}
	if isNumLike(a) && isNumLike(b) {
		return decSub(decOf(a), decOf(b))
	}
	panic(TypeErr("unsupported operand type(s) for -: '" + typeName(a) + "' and '" + typeName(b) + "'"))
}

func repeatSeq(seq V, n V) V {
	k := asBig(n).Int64()
	if s, ok := seq.(string); ok {
		if k > 0 {
			return strings.Repeat(s, int(k))
		}
		return ""
	}
	l := seq.(*List)
	out := []V{}
	for i := int64(0); i < k; i++ {
		out = append(out, l.Items...)
	}
	return &List{out}
}

func Mul(a, b V) V {
	if m, ok := a.(*Money); ok {
		if _, ok := b.(*Money); ok {
			panic(KindMismatch("Money can't be multiplied by money."))
		}
		return &Money{decMul(m.Amount, toDec(b))}
	}
	if m, ok := b.(*Money); ok {
		return &Money{decMul(m.Amount, toDec(a))}
	}
	if isIntLike(a) && isIntLike(b) {
		return new(big.Int).Mul(asBig(a), asBig(b))
	}
	if isNumLike(a) && isNumLike(b) {
		return decMul(decOf(a), decOf(b))
	}
	seq := func(x V) bool {
		switch x.(type) {
		case string, *List:
			return true
		}
		return false
	}
	if seq(a) {
		if isIntLike(b) {
			return repeatSeq(a, b)
		}
		panic(TypeErr("can't multiply sequence by non-int of type '" + typeName(b) + "'"))
	}
	if seq(b) {
		if isIntLike(a) {
			return repeatSeq(b, a)
		}
		panic(TypeErr("can't multiply sequence by non-int of type '" + typeName(a) + "'"))
	}
	panic(TypeErr("unsupported operand type(s) for *: '" + typeName(a) + "' and '" + typeName(b) + "'"))
}

func Neg(a V) V {
	if m, ok := a.(*Money); ok {
		return &Money{m.Amount.neg()}
	}
	if isIntLike(a) {
		return new(big.Int).Neg(asBig(a))
	}
	if d, ok := a.(*Dec); ok {
		return d.neg()
	}
	panic(TypeErr("bad operand type for unary -: '" + typeName(a) + "'"))
}

// IntMod is Python's % on two whole numbers: the sign of the divisor.
func IntMod(a, b V) V {
	if !isIntLike(a) || !isIntLike(b) {
		if isNumLike(a) && isNumLike(b) {
			return Modulo(a, b)
		}
		panic(TypeErr("unsupported operand type(s) for %: '" + typeName(a) + "' and '" + typeName(b) + "'"))
	}
	x, y := asBig(a), asBig(b)
	if y.Sign() == 0 {
		panic(PyErr("ZeroDivisionError", "integer modulo by zero"))
	}
	r := new(big.Int).Rem(x, y)
	if r.Sign() != 0 && (r.Sign() < 0) != (y.Sign() < 0) {
		r.Add(r, y)
	}
	return r
}

// Divide is divide(a, b) in thunder_runtime.py: always exact.
func Divide(a, b V) V {
	if m, ok := a.(*Money); ok {
		if n, ok := b.(*Money); ok {
			if n.Amount.isZero() {
				panic(DividedByZero("You divided by zero."))
			}
			return decDiv(m.Amount, n.Amount)
		}
		d := toDec(b)
		if d.isZero() {
			panic(DividedByZero("You divided by zero."))
		}
		return &Money{decDiv(m.Amount, d)}
	}
	if _, ok := b.(*Money); ok {
		panic(KindMismatch("A plain number can't be divided by money."))
	}
	x, y := toDec(a), toDec(b)
	if y.isZero() {
		panic(DividedByZero("You divided by zero."))
	}
	return decDiv(x, y)
}

// Modulo is modulo(a, b) in thunder_runtime.py.
func Modulo(a, b V) V {
	ma, money := a.(*Money)
	var x *Dec
	if money {
		x = ma.Amount
	} else {
		x = toDec(a)
	}
	var y *Dec
	if mb, ok := b.(*Money); ok {
		y = mb.Amount
	} else {
		y = toDec(b)
	}
	if y.isZero() {
		panic(DividedByZero("You divided by zero."))
	}
	r := decRem(x, y)
	if !r.isZero() && (r.S == 1) != (y.S == 1 && !y.isZero()) {
		r = decAdd(r, y)
	}
	if money {
		return &Money{r}
	}
	if isInt(a) && isInt(b) {
		return r.toBigInt()
	}
	return r
}

// RoundTo is round_to(x, places).
func RoundTo(x V, places ...V) V {
	p := 0
	if len(places) > 0 {
		pv := places[0]
		if d, ok := pv.(*Dec); ok {
			pv = d.toBigInt()
		}
		p = int(asBig(pv).Int64())
	}
	if m, ok := x.(*Money); ok {
		return &Money{m.Amount.quantizeHalfUp(-p)}
	}
	if n, ok := x.(*big.Int); ok {
		return n
	}
	d := toDec(x).quantizeHalfUp(-p)
	if p == 0 {
		return d.toBigInt()
	}
	return d
}

// Eq is Python ==.
func Eq(a, b V) bool {
	if _, isD := a.(*Dec); !isD && sameRef(a, b) {
		return true
	}
	ma, aM := a.(*Money)
	mb, bM := b.(*Money)
	if aM || bM {
		m, o := ma, b
		if !aM {
			m, o = mb, a
		}
		switch o.(type) {
		case nil, string, bool:
			return false
		}
		return decCmp(m.Amount, moneyOther(o, "compare")) == 0
	}
	if a == nil || b == nil {
		return false
	}
	if isNumLike(a) && isNumLike(b) {
		return numCmp(a, b) == 0
	}
	sa, aS := a.(string)
	sb, bS := b.(string)
	if aS || bS {
		return aS && bS && sa == sb
	}
	switch x := a.(type) {
	case *List:
		y, ok := b.(*List)
		if !ok || len(x.Items) != len(y.Items) {
			return false
		}
		for i := range x.Items {
			if !(sameRef(x.Items[i], y.Items[i]) || Eq(x.Items[i], y.Items[i])) {
				return false
			}
		}
		return true
	case *Tuple:
		y, ok := b.(*Tuple)
		if !ok || len(x.Items) != len(y.Items) {
			return false
		}
		for i := range x.Items {
			if !Eq(x.Items[i], y.Items[i]) {
				return false
			}
		}
		return true
	case *Dict:
		y, ok := b.(*Dict)
		if !ok || x.size() != y.size() {
			return false
		}
		for _, id := range x.order {
			e2, ok := y.m[id]
			if !ok || !Eq(x.m[id].v, e2.v) {
				return false
			}
		}
		return true
	case *Record:
		y, ok := b.(*Record)
		if !ok || x.Cls != y.Cls {
			return false
		}
		for _, f := range x.Cls.Fields {
			if !Eq(x.F[f.Py], y.F[f.Py]) {
				return false
			}
		}
		return true
	case *Date:
		y, ok := b.(*Date)
		return ok && x.num() == y.num()
	}
	return false
}

// sameRef is JavaScript's ===: the same value for plain values, the same object for the rest.
func sameRef(a, b V) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case *big.Int:
		y, ok := b.(*big.Int)
		return ok && x.Cmp(y) == 0
	case *Dec, *Money, *List, *Tuple, *Dict, *Record, *Date:
		return a == b
	}
	return a == b
}

func flip(op string) string {
	switch op {
	case "<":
		return ">"
	case ">":
		return "<"
	case "<=":
		return ">="
	case ">=":
		return "<="
	}
	return op
}

func holds(op string, c int) bool {
	switch op {
	case "<":
		return c < 0
	case ">":
		return c > 0
	case "<=":
		return c <= 0
	}
	return c >= 0
}

// Compare is Python's <, >, <=, >= (and == / != through Eq).
func Compare(op string, a, b V) bool {
	if op == "==" {
		return Eq(a, b)
	}
	if op == "!=" {
		return !Eq(a, b)
	}
	ma, aM := a.(*Money)
	mb, bM := b.(*Money)
	if aM || bM {
		m, o, o2 := ma, b, op
		if !aM {
			m, o, o2 = mb, a, flip(op)
		}
		if o == nil {
			panic(TypeErr("'" + o2 + "' not supported between instances of 'decimal.Decimal' and 'NoneType'"))
		}
		return holds(o2, decCmp(m.Amount, moneyOther(o, "compare")))
	}
	c, ok := order(a, b)
	if !ok {
		panic(TypeErr("'" + op + "' not supported between instances of '" + typeName(a) + "' and '" + typeName(b) + "'"))
	}
	return holds(op, c)
}

func sign(n int) int {
	if n < 0 {
		return -1
	}
	if n > 0 {
		return 1
	}
	return 0
}

func order(a, b V) (int, bool) {
	if isNumLike(a) && isNumLike(b) {
		return numCmp(a, b), true
	}
	if sa, ok := a.(string); ok {
		if sb, ok := b.(string); ok {
			return cmpStr(sa, sb), true
		}
	}
	if da, ok := a.(*Date); ok {
		if db, ok := b.(*Date); ok {
			return sign(da.num() - db.num()), true
		}
	}
	seqA, aSeq, aList := seqOf(a)
	seqB, bSeq, bList := seqOf(b)
	if aSeq && bSeq && aList == bList {
		n := minInt(len(seqA), len(seqB))
		for i := 0; i < n; i++ {
			if Eq(seqA[i], seqB[i]) {
				continue
			}
			if Compare("<", seqA[i], seqB[i]) {
				return -1, true
			}
			return 1, true
		}
		return sign(len(seqA) - len(seqB)), true
	}
	return 0, false
}

func seqOf(x V) ([]V, bool, bool) {
	switch v := x.(type) {
	case *List:
		return v.Items, true, true
	case *Tuple:
		return v.Items, true, false
	}
	return nil, false, false
}

func isTuple(x V) bool { _, ok := x.(*Tuple); return ok }

func cmpStr(a, b string) int {
	x, y := []rune(a), []rune(b)
	n := minInt(len(x), len(y))
	for i := 0; i < n; i++ {
		if d := int(x[i]) - int(y[i]); d != 0 {
			return sign(d)
		}
	}
	return sign(len(x) - len(y))
}

func contains(container, item V) bool {
	switch c := container.(type) {
	case string:
		s, ok := item.(string)
		if !ok {
			panic(TypeErr("'in <string>' requires string as left operand, not " + typeName(item)))
		}
		return strings.Contains(c, s)
	case *Dict:
		return c.has(item)
	case *List:
		for _, x := range c.Items {
			if sameRef(x, item) || Eq(x, item) {
				return true
			}
		}
		return false
	case *Tuple:
		for _, x := range c.Items {
			if Eq(x, item) {
				return true
			}
		}
		return false
	}
	panic(TypeErr("argument of type '" + typeName(container) + "' is not iterable"))
}

// pySort is Python's list.sort / sorted: stable, using < only. It makes the same comparisons in the same order as
// the Thunder engine (JavaScript's sort: a run, then binary insertion), so a list that can't be ordered fails on the
// same pair of values.
func pySort(items []V, key func(V) V, reverse bool) []V {
	type keyed struct {
		v V
		k V
		i int
	}
	a := make([]keyed, len(items))
	for i, v := range items {
		k := v
		if key != nil {
			k = key(v)
		}
		a[i] = keyed{v, k, i}
	}
	cmp := func(x, y keyed) int {
		if reverse {
			if Compare("<", y.k, x.k) {
				return -1
			}
			if Compare("<", x.k, y.k) {
				return 1
			}
		} else {
			if Compare("<", x.k, y.k) {
				return -1
			}
			if Compare("<", y.k, x.k) {
				return 1
			}
		}
		return x.i - y.i
	}
	n := len(a)
	if n >= 2 {
		// The first run: ascending, or strictly descending (then reversed).
		run := 2
		desc := cmp(a[1], a[0]) < 0
		prev := a[1]
		for idx := 2; idx < n; idx++ {
			c := cmp(a[idx], prev)
			if desc {
				if c >= 0 {
					break
				}
			} else if c < 0 {
				break
			}
			prev = a[idx]
			run++
		}
		if desc {
			for i, j := 0, run-1; i < j; i, j = i+1, j-1 {
				a[i], a[j] = a[j], a[i]
			}
		}
		// Binary insertion of the rest.
		for start := run; start < n; start++ {
			pivot := a[start]
			left, right := 0, start
			for left < right {
				mid := left + ((right - left) >> 1)
				if cmp(pivot, a[mid]) < 0 {
					right = mid
				} else {
					left = mid + 1
				}
			}
			copy(a[left+1:start+1], a[left:start])
			a[left] = pivot
		}
	}
	out := make([]V, n)
	for i, x := range a {
		out[i] = x.v
	}
	return out
}

// PySort sorts a list's items (a new list).
func PySort(list V, key func(V) V, reverse bool) V {
	return &List{pySort(iterItems(list), key, reverse)}
}

// ── Attribute-style Python calls ───────────────────────────────────────────────────────────────────────────────

func attrErr(v V, name string) *Err {
	return PyErr("AttributeError", "'"+typeName(v)+"' object has no attribute '"+name+"'")
}
func strMethod(v V, name string) string {
	s, ok := v.(string)
	if !ok {
		panic(attrErr(v, name))
	}
	return s
}

func isLineBreak(r rune) bool {
	switch r {
	case '\n', '\r', '\v', '\f', 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029:
		return true
	}
	return false
}

func splitLines(s string) []V {
	out := []V{}
	rs := []rune(s)
	start := 0
	for i := 0; i < len(rs); i++ {
		if isLineBreak(rs[i]) {
			out = append(out, string(rs[start:i]))
			if rs[i] == '\r' && i+1 < len(rs) && rs[i+1] == '\n' {
				i++
			}
			start = i + 1
		}
	}
	if start < len(rs) {
		out = append(out, string(rs[start:]))
	}
	return out
}

// isPySpace is JavaScript's \s plus the separators Python's str.split also breaks at.
func isPySpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff, 0x1c, 0x1d, 0x1e, 0x1f, 0x85:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func pySplit(s string) []V {
	out := []V{}
	for _, p := range strings.FieldsFunc(s, isPySpace) {
		out = append(out, p)
	}
	return out
}
func pyStrip(s string) string { return strings.TrimFunc(s, isPySpace) }

// ── JSON, the way Python's json module reads and writes it ─────────────────────────────────────────────────────

type jsonError struct {
	msg string
	pos int
}

func jsonParse(text string) V {
	s := []rune(text)
	n := len(s)
	ws := func(i int) int {
		for i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r') {
			i++
		}
		return i
	}
	fail := func(msg string, pos int) { panic(&jsonError{msg, pos}) }
	startsWith := func(i int, w string) bool { return i+len(w) <= n && string(s[i:i+len(w)]) == w }
	isHex := func(i int) bool {
		if i+4 > n {
			return false
		}
		for _, ch := range s[i : i+4] {
			if !strings.ContainsRune("0123456789abcdefABCDEF", ch) {
				return false
			}
		}
		return true
	}
	var str func(begin int) (string, int)
	str = func(begin int) (string, int) {
		i := begin + 1
		var b strings.Builder
		for {
			if i >= n {
				fail("Unterminated string starting at", begin)
			}
			ch := s[i]
			if ch == '"' {
				return b.String(), i + 1
			}
			if ch < 0x20 {
				fail("Invalid control character at", i)
			}
			if ch != '\\' {
				b.WriteRune(ch)
				i++
				continue
			}
			if i+1 >= n {
				fail("Unterminated string starting at", begin)
			}
			esc := s[i+1]
			simple := map[rune]string{'"': "\"", '\\': "\\", '/': "/", 'b': "\b", 'f': "\f", 'n': "\n", 'r': "\r", 't': "\t"}
			if v, ok := simple[esc]; ok {
				b.WriteString(v)
				i += 2
				continue
			}
			if esc != 'u' {
				fail("Invalid \\escape", i)
			}
			if !isHex(i + 2) {
				fail("Invalid \\uXXXX escape", i+1)
			}
			cp64, _ := strconv.ParseInt(string(s[i+2:i+6]), 16, 32)
			cp := rune(cp64)
			i += 6
			if cp >= 0xd800 && cp <= 0xdbff && i+1 < n && s[i] == '\\' && s[i+1] == 'u' && isHex(i+2) {
				lo64, _ := strconv.ParseInt(string(s[i+2:i+6]), 16, 32)
				lo := rune(lo64)
				if lo >= 0xdc00 && lo <= 0xdfff {
					cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00)
					i += 6
				}
			}
			b.WriteRune(cp)
		}
	}
	var value func(i int) (V, int)
	number := func(i int) (V, int, bool) {
		j := i
		if j < n && s[j] == '-' {
			j++
		}
		if j >= n || s[j] < '0' || s[j] > '9' {
			return nil, 0, false
		}
		if s[j] == '0' {
			j++
		} else {
			for j < n && s[j] >= '0' && s[j] <= '9' {
				j++
			}
		}
		frac, exp := false, false
		if j+1 < n && s[j] == '.' && s[j+1] >= '0' && s[j+1] <= '9' {
			frac = true
			j++
			for j < n && s[j] >= '0' && s[j] <= '9' {
				j++
			}
		}
		if j < n && (s[j] == 'e' || s[j] == 'E') {
			k := j + 1
			if k < n && (s[k] == '+' || s[k] == '-') {
				k++
			}
			if k < n && s[k] >= '0' && s[k] <= '9' {
				exp = true
				for k < n && s[k] >= '0' && s[k] <= '9' {
					k++
				}
				j = k
			}
		}
		t := string(s[i:j])
		if frac || exp {
			return ParseDec(t), j, true
		}
		v, _ := new(big.Int).SetString(t, 10)
		return v, j, true
	}
	var obj, arr func(i int) (V, int)
	value = func(i int) (V, int) {
		if i >= n {
			fail("Expecting value", i)
		}
		ch := s[i]
		switch {
		case ch == '"':
			v, j := str(i)
			return v, j
		case ch == '{':
			return obj(i + 1)
		case ch == '[':
			return arr(i + 1)
		case startsWith(i, "null"):
			return nil, i + 4
		case startsWith(i, "true"):
			return true, i + 4
		case startsWith(i, "false"):
			return false, i + 4
		}
		if v, j, ok := number(i); ok {
			return v, j
		}
		fail("Expecting value", i)
		return nil, 0
	}
	obj = func(i int) (V, int) {
		d := newDict()
		i = ws(i)
		if i < n && s[i] == '}' {
			return d, i + 1
		}
		for {
			if i >= n || s[i] != '"' {
				fail("Expecting property name enclosed in double quotes", i)
			}
			var k string
			k, i = str(i)
			i = ws(i)
			if i >= n || s[i] != ':' {
				fail("Expecting ':' delimiter", i)
			}
			i = ws(i + 1)
			var v V
			v, i = value(i)
			d.set(k, v)
			i = ws(i)
			if i < n && s[i] == '}' {
				return d, i + 1
			}
			if i >= n || s[i] != ',' {
				fail("Expecting ',' delimiter", i)
			}
			comma := i
			i = ws(i + 1)
			if i < n && s[i] == '}' {
				fail("Illegal trailing comma before end of object", comma)
			}
		}
	}
	arr = func(i int) (V, int) {
		out := []V{}
		i = ws(i)
		if i < n && s[i] == ']' {
			return &List{out}, i + 1
		}
		for {
			var v V
			v, i = value(i)
			out = append(out, v)
			i = ws(i)
			if i < n && s[i] == ']' {
				return &List{out}, i + 1
			}
			if i >= n || s[i] != ',' {
				fail("Expecting ',' delimiter", i)
			}
			comma := i
			i = ws(i + 1)
			if i < n && s[i] == ']' {
				fail("Illegal trailing comma before end of array", comma)
			}
		}
	}
	var result V
	func() {
		defer func() {
			if r := recover(); r != nil {
				je, ok := r.(*jsonError)
				if !ok {
					panic(r)
				}
				before := s[:je.pos]
				line := 1
				last := -1
				for k, ch := range before {
					if ch == '\n' {
						line++
						last = k
					}
				}
				col := je.pos - last
				panic(ConversionFailed(fmt.Sprintf("This is not JSON: %s (line %d, column %d).", je.msg, line, col)))
			}
		}()
		v, end := value(ws(0))
		end = ws(end)
		if end != n {
			fail("Extra data", end)
		}
		result = v
	}()
	return result
}

func jsonReady(v V) V {
	switch x := v.(type) {
	case nil, bool, string, *big.Int, *Dec:
		return v
	case *Money:
		panic(KindMismatch("Money has no JSON form of its own: use its amount, for example price's amount."))
	case *List:
		out := make([]V, len(x.Items))
		for i, y := range x.Items {
			out[i] = jsonReady(y)
		}
		return &List{out}
	case *Tuple:
		out := make([]V, len(x.Items))
		for i, y := range x.Items {
			out[i] = jsonReady(y)
		}
		return &List{out}
	case *Dict:
		out := newDict()
		for _, e := range x.entries() {
			if _, ok := e.k.(string); !ok {
				panic(KindMismatch("A JSON object's keys are text, but one is " + describe(e.k) + "."))
			}
			out.set(e.k, jsonReady(e.v))
		}
		return out
	case *Record:
		out := newDict()
		for _, f := range x.Cls.Fields {
			out.set(f.Py, jsonReady(x.F[f.Py]))
		}
		return out
	}
	panic(KindMismatch(describe(v) + " has no JSON form."))
}

func jsonStr(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, ch := range s {
		switch {
		case ch == '"':
			b.WriteString("\\\"")
		case ch == '\\':
			b.WriteString("\\\\")
		case ch == '\n':
			b.WriteString("\\n")
		case ch == '\r':
			b.WriteString("\\r")
		case ch == '\t':
			b.WriteString("\\t")
		case ch == '\b':
			b.WriteString("\\b")
		case ch == '\f':
			b.WriteString("\\f")
		case ch >= 0x20 && ch <= 0x7e:
			b.WriteRune(ch)
		case ch > 0xffff:
			v := ch - 0x10000
			b.WriteString(fmt.Sprintf("\\u%x\\u%x", 0xd800+(v>>10), 0xdc00+(v&0x3ff)))
		default:
			b.WriteString(fmt.Sprintf("\\u%04x", ch))
		}
	}
	b.WriteByte('"')
	return b.String()
}

func jsonText(v V) string {
	var w func(x V) string
	w = func(x V) string {
		switch y := x.(type) {
		case nil:
			return "null"
		case bool:
			if y {
				return "true"
			}
			return "false"
		case *big.Int:
			return y.String()
		case *Dec:
			t := y.String()
			if y.isIntegral() && strings.Contains(t, "E") {
				return y.toFixed(-1, false)
			}
			return t
		case string:
			return jsonStr(y)
		case *List:
			parts := make([]string, len(y.Items))
			for i, z := range y.Items {
				parts[i] = w(z)
			}
			return "[" + strings.Join(parts, ", ") + "]"
		case *Dict:
			parts := []string{}
			for _, e := range y.entries() {
				parts = append(parts, jsonStr(e.k.(string))+": "+w(e.v))
			}
			return "{" + strings.Join(parts, ", ") + "}"
		}
		return ""
	}
	return w(jsonReady(v))
}

// ── Helpers the generated code calls ───────────────────────────────────────────────────────────────────────────

const maxFrames = 997 // as deep as the generated Python goes (recursion limit 1000, less its own frames)

// RangeInt is a whole number for counting (range, repeat).
func RangeInt(v V) int64 {
	switch x := v.(type) {
	case *big.Int:
		return x.Int64()
	case bool:
		if x {
			return 1
		}
		return 0
	}
	name := "object"
	switch v.(type) {
	case *Dec:
		name = "decimal.Decimal"
	case nil:
		name = "NoneType"
	case *Money:
		name = "Money"
	case string:
		name = "str"
	}
	panic(TypeErr("'" + name + "' object cannot be interpreted as an integer"))
}

// I is a whole number from a Go number; Int from its digits.
func I(n int64) V { return big.NewInt(n) }
func Int(digits string) V {
	v, _ := new(big.Int).SetString(digits, 10)
	return v
}

// Unpack2 splits a pair into its two values, as Python's `a, b = el` does.
func Unpack2(el V) (V, V) {
	var items []V
	switch x := el.(type) {
	case *List:
		items = x.Items
	case *Tuple:
		items = x.Items
	case string:
		for _, r := range runes(x) {
			items = append(items, r)
		}
		if items == nil {
			items = []V{}
		}
	case *Dict:
		items = x.keys()
	}
	if items == nil {
		name := "object"
		switch el.(type) {
		case nil:
			name = "NoneType"
		case *big.Int:
			name = "int"
		case *Dec:
			name = "decimal.Decimal"
		case bool:
			name = "bool"
		}
		panic(TypeErr("cannot unpack non-iterable " + name + " object"))
	}
	if len(items) < 2 {
		panic(PyErr("ValueError", fmt.Sprintf("not enough values to unpack (expected 2, got %d)", len(items))))
	}
	if len(items) > 2 {
		panic(PyErr("ValueError", fmt.Sprintf("too many values to unpack (expected 2, got %d)", len(items))))
	}
	return items[0], items[1]
}

func MapItems(m V) V {
	d, ok := m.(*Dict)
	if !ok {
		panic(attrErr(m, "items"))
	}
	return &List{d.items()}
}
func PairsOf(c V) V {
	if d, ok := c.(*Dict); ok {
		return &List{d.items()}
	}
	return PyList(c)
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// ItemAt is "list at position": positions start at 1. dflt (optional) is given back when there is no such item.
func ItemAt(items V, position V, dflt ...V) V {
	p, ok := position.(*big.Int)
	if !ok {
		panic(KindMismatch("A position in a list is a whole number, not " + describe(position) + "."))
	}
	var list []V
	switch x := items.(type) {
	case *List:
		list = x.Items
	case *Tuple:
		list = x.Items
	default:
		name := "object"
		if items == nil {
			name = "NoneType"
		}
		panic(TypeErr("object of type '" + name + "' has no len()"))
	}
	if p.Cmp(bigOne) >= 0 && p.Cmp(big.NewInt(int64(len(list)))) <= 0 {
		return list[p.Int64()-1]
	}
	if len(dflt) > 0 {
		return dflt[0]
	}
	panic(MissingValue(fmt.Sprintf("There is no item %s: the list has %d item%s.", p.String(), len(list), plural(len(list)))))
}

func SetItem(items V, position V, value V) {
	ItemAt(items, position)
	items.(*List).Items[position.(*big.Int).Int64()-1] = value
}

func MapSet(m, k, v V) {
	switch x := m.(type) {
	case *Dict:
		x.set(k, v)
		return
	case nil:
		panic(TypeErr("'NoneType' object does not support item assignment"))
	case *List:
		SetItem(x, k, v)
		return
	case *Money:
		panic(TypeErr("'Money' object does not support item assignment"))
	}
	panic(TypeErr("'object' object does not support item assignment"))
}

func SetEntry(c, k, v V) {
	switch x := c.(type) {
	case *List:
		SetItem(x, k, v)
	case *Dict:
		x.set(k, v)
	case nil:
		panic(MissingValue("This value is nothing, so it has no entry for " + Show(k) + "."))
	default:
		panic(KindMismatch(describe(c) + " has no entries that can be changed."))
	}
}

func Entry(c, k V, dflt ...V) V {
	switch x := c.(type) {
	case *List, *Tuple:
		return ItemAt(c, k, dflt...)
	case *Dict:
		if v, ok := x.get(k); ok {
			return v
		}
		if len(dflt) > 0 {
			return dflt[0]
		}
		panic(MissingValue("There is no entry for " + Show(k) + "."))
	case nil:
		panic(MissingValue("This value is nothing, so it has no entry for " + Show(k) + "."))
	}
	panic(KindMismatch(describe(c) + " has no entries."))
}

func MapGet(m, k V, dflt ...V) V {
	switch x := m.(type) {
	case *Dict:
		if v, ok := x.get(k); ok {
			return v
		}
		if len(dflt) > 0 {
			return dflt[0]
		}
		panic(&Err{PyType: "KeyError", Message: PyStr(k), Args: []V{k}})
	case nil:
		if len(dflt) > 0 {
			panic(attrErr(m, "get"))
		}
		panic(TypeErr("'NoneType' object is not subscriptable"))
	}
	if len(dflt) > 0 {
		panic(attrErr(m, "get"))
	}
	if l, ok := m.(*List); ok {
		if i, ok := k.(*big.Int); ok {
			n := int64(len(l.Items))
			iv := i.Int64()
			if i.IsInt64() && iv >= -n && iv < n {
				if iv < 0 {
					iv += n
				}
				return l.Items[iv]
			}
		}
		panic(PyErr("IndexError", "list index out of range"))
	}
	if _, ok := m.(*Money); ok {
		panic(TypeErr("'Money' object is not subscriptable"))
	}
	panic(TypeErr("'object' object is not subscriptable"))
}

// GetAttr is obj.name for a record field (a Python attribute), or Money's amount.
func GetAttr(obj V, name string) V {
	if r, ok := obj.(*Record); ok {
		if v, ok := r.F[name]; ok {
			return v
		}
	}
	if m, ok := obj.(*Money); ok && name == "amount" {
		return m.Amount
	}
	panic(attrErr(obj, name))
}

func fieldNames(key string) []string {
	lower := strings.ToLower(key)
	return []string{key, strings.ReplaceAll(key, " ", "_"), lower, strings.ReplaceAll(lower, " ", "_")}
}

func GetField(obj V, key string) V {
	if obj == nil {
		panic(MissingValue("This value is nothing, so it has no " + key + "."))
	}
	names := fieldNames(key)
	if d, ok := obj.(*Dict); ok {
		for _, k := range names {
			if v, ok := d.get(k); ok {
				return v
			}
		}
		for _, e := range d.entries() {
			if strings.ToLower(pyStrip(PyStr(e.k))) == strings.ToLower(key) {
				return e.v
			}
		}
		ks := []string{}
		for _, k := range d.keys() {
			ks = append(ks, PyStr(k))
		}
		panic(MissingValue("There is no field \"" + key + "\". Fields here: " + strings.Join(ks, ", ") + "."))
	}
	for _, k := range names {
		if r, ok := obj.(*Record); ok {
			if v, ok := r.F[k]; ok {
				return v
			}
		}
		if m, ok := obj.(*Money); ok && k == "amount" {
			return m.Amount
		}
	}
	panic(MissingValue(describe(obj) + " has no field \"" + key + "\"."))
}

// SetAttr is obj.name = value: a record's Never rules run first, as its __setattr__ does.
func SetAttr(obj V, name string, value V) {
	if r, ok := obj.(*Record); ok {
		for _, rule := range r.Cls.Rules[name] {
			Never(rule.Cond(value), rule.Text, rule.Line, value)
		}
		r.F[name] = value
		return
	}
	if _, ok := obj.(*Money); ok {
		panic(PyErr("AttributeError", "Money cannot be changed; make new money instead."))
	}
	panic(attrErr(obj, name))
}

func SetField(obj V, key string, value V) {
	if d, ok := obj.(*Dict); ok {
		d.set(key, value)
		return
	}
	for _, k := range fieldNames(key) {
		if r, ok := obj.(*Record); ok {
			if _, has := r.F[k]; has {
				SetAttr(obj, k, value)
				return
			}
		}
	}
	panic(MissingValue(describe(obj) + " has no field \"" + key + "\"."))
}

func AddTo(target, value V) V {
	if l, ok := target.(*List); ok {
		l.Items = append(l.Items, value)
		return l
	}
	return Add(target, value)
}
func AppendTo(target, value V) {
	l, ok := target.(*List)
	if !ok {
		panic(attrErr(target, "append"))
	}
	l.Items = append(l.Items, value)
}
func RemoveFrom(target, value V) {
	if d, ok := target.(*Dict); ok {
		if !d.has(value) {
			panic(MissingValue("There is no entry for " + Show(value) + " to remove."))
		}
		d.del(value)
		return
	}
	if !contains(target, value) {
		panic(MissingValue(Show(value) + " is not in the list, so it can't be removed."))
	}
	l, ok := target.(*List)
	if !ok {
		panic(attrErr(target, "remove"))
	}
	for i, x := range l.Items {
		if sameRef(x, value) || Eq(x, value) {
			l.Items = append(l.Items[:i:i], l.Items[i+1:]...)
			return
		}
	}
}
func SortInPlace(target V, key func(V) V, desc bool) {
	l, ok := target.(*List)
	if !ok {
		panic(attrErr(target, "sort"))
	}
	l.Items = pySort(l.Items, key, desc)
}
func ReverseInPlace(target V) {
	l, ok := target.(*List)
	if !ok {
		panic(attrErr(target, "reverse"))
	}
	for i, j := 0, len(l.Items)-1; i < j; i, j = i+1, j-1 {
		l.Items[i], l.Items[j] = l.Items[j], l.Items[i]
	}
}

// Kind makes a kind of record.
func Kind(py string, fields []Field, rules map[string][]Rule) *RecordKind {
	if rules == nil {
		rules = map[string][]Rule{}
	}
	return &RecordKind{py, fields, rules}
}

// Pair is a field given when a record is made.
type Pair struct {
	Py string
	V  V
}

// NewRecord makes a record: the fields it is given, the others defaulted; each set through its Never rules.
func NewRecord(cls *RecordKind, given ...Pair) V {
	g := map[string]V{}
	for _, p := range given {
		g[p.Py] = p.V
	}
	missing := []string{}
	for _, f := range cls.Fields {
		if _, ok := g[f.Py]; !ok && f.Kind != "optional" && f.Kind != "list" && f.Kind != "map" {
			missing = append(missing, "'"+f.Py+"'")
		}
	}
	if len(missing) > 0 {
		sep := ", "
		if len(missing) == 2 {
			sep = " and "
		}
		panic(TypeErr(fmt.Sprintf("%s.__init__() missing %d required keyword-only argument%s: %s", cls.Py, len(missing), plural(len(missing)), strings.Join(missing, sep))))
	}
	rec := &Record{cls, map[string]V{}}
	for _, f := range cls.Fields {
		v, ok := g[f.Py]
		if !ok {
			switch f.Kind {
			case "optional":
				v = nil
			case "list":
				v = &List{[]V{}}
			default:
				v = newDict()
			}
		}
		SetAttr(rec, f.Py, v)
	}
	return rec
}

// Never is never(cond, text, rule, value): a broken Never rule stops the program.
func Never(cond V, text string, line int, value V) {
	if Truthy(cond) {
		panic(RuleBroken(fmt.Sprintf("%s (the rule on line %d), but the value is %s.", text, line, Show(value))))
	}
}

// ApplyOp is an operation written as words: the sum of, the first of, the words of, ...
func ApplyOp(op string, a V) V {
	switch op {
	case "sum":
		return totalOf(iterItems(a))
	case "average":
		items := iterItems(a)
		if len(items) == 0 {
			panic(MissingValue("I can't take the average of an empty list."))
		}
		return Divide(totalOf(items), big.NewInt(int64(len(items))))
	case "count", "length":
		return PyLen(a)
	case "min", "max":
		items := iterItems(a)
		if len(items) == 0 {
			if op == "min" {
				panic(MissingValue("An empty list has no smallest item."))
			}
			panic(MissingValue("An empty list has no largest item."))
		}
		best := items[0]
		cmp := "<"
		if op == "max" {
			cmp = ">"
		}
		for _, x := range items[1:] {
			if Compare(cmp, x, best) {
				best = x
			}
		}
		return best
	case "first", "last":
		items := iterItems(a)
		if len(items) == 0 {
			panic(MissingValue("An empty list has no " + op + " item."))
		}
		if op == "first" {
			return items[0]
		}
		return items[len(items)-1]
	case "words":
		out := []V{}
		for _, p := range pySplit(PyStr(a)) {
			if w := stripPunct(p.(string)); w != "" {
				out = append(out, w)
			}
		}
		return &List{out}
	case "lines":
		return &List{splitLines(strMethod(a, "splitlines"))}
	case "lowercase":
		return pyLower(strMethod(a, "lower"))
	case "uppercase":
		return pyUpper(strMethod(a, "upper"))
	case "trimmed":
		return pyStrip(strMethod(a, "strip"))
	case "parts":
		return &List{pySplit(textOf(a, "\"the parts of\""))}
	case "abs":
		if m, ok := a.(*Money); ok {
			return &Money{m.Amount.abs()}
		}
		if _, ok := a.(bool); ok || !isNumber(a) {
			panic(KindMismatch("\"the absolute value of\" needs a number or money, but it is " + describe(a) + "."))
		}
		if n, ok := a.(*big.Int); ok {
			return new(big.Int).Abs(n)
		}
		return a.(*Dec).abs()
	case "jsonText":
		return jsonText(a)
	case "jsonData":
		return jsonParse(textOf(a, "\"the JSON data in\""))
	case "keys":
		d, ok := a.(*Dict)
		if !ok {
			panic(attrErr(a, "keys"))
		}
		return &List{d.keys()}
	case "values":
		d, ok := a.(*Dict)
		if !ok {
			panic(attrErr(a, "values"))
		}
		return &List{d.values()}
	}
	panic(PyErr("NameError", "name '"+op+"' is not defined"))
}

// pyLower / pyUpper: Unicode case mapping, with the special cases JavaScript and Python share.
func pyLower(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == 'İ' {
			b.WriteString("i̇")
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}
func pyUpper(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case 'ß':
			b.WriteString("SS")
		case 'ŉ':
			b.WriteString("ʼN")
		case 'ﬀ':
			b.WriteString("FF")
		case 'ﬁ':
			b.WriteString("FI")
		case 'ﬂ':
			b.WriteString("FL")
		default:
			b.WriteRune(unicode.ToUpper(r))
		}
	}
	return b.String()
}

// Affix is "starts with" / "ends with": both sides must be text.
func Affix(t, a V, end bool) bool {
	what := "\"starts with\""
	if end {
		what = "\"ends with\""
	}
	ts := textOf(t, what)
	as := textOf(a, what)
	if end {
		return strings.HasSuffix(ts, as)
	}
	return strings.HasPrefix(ts, as)
}

// Between is lo <= v <= hi, the way Python chains it: hi is worked out only when the first part holds.
func Between(lo, v V, hi func() V) bool {
	if !Compare("<=", lo, v) {
		return false
	}
	return Compare("<=", v, hi())
}

// IsIn is `item in container`, with the item worked out first (as Python does).
func IsIn(item, container V) bool { return contains(container, item) }

// ReadText reads a file the program names, from the folder it runs in.
func ReadText(path V) V {
	p, ok := path.(string)
	if !ok {
		name := "object"
		if path == nil {
			name = "NoneType"
		}
		panic(TypeErr("expected str, bytes or os.PathLike object, not " + name))
	}
	wd, _ := os.Getwd()
	full := p
	if !filepath.IsAbs(p) {
		full = filepath.Join(wd, p)
	}
	st, err := os.Stat(full)
	if err != nil {
		if os.IsNotExist(err) {
			panic(MissingValue("There is no file \"" + p + "\" (looked in the folder the program runs in)."))
		}
		panic(PyErr("OSError", err.Error()))
	}
	if st.IsDir() {
		panic(PyErr("IsADirectoryError", "EISDIR: illegal operation on a directory, read"))
	}
	data, err := os.ReadFile(full)
	if err != nil {
		panic(PyErr("OSError", err.Error()))
	}
	return string(data)
}

// Try runs `run`; a Thunder or Python error it raises is given back (anything else goes on).
func Try(run func()) (failure *Err) {
	defer func() {
		if r := recover(); r != nil {
			failure = AsPyErr(r)
		}
	}()
	run()
	return nil
}

// ExpectTrue / ExpectFailure / ExpectValue: the checks, the way thunder_runtime.py's expect_* do them.
func ExpectTrue(v V, text string) {
	if b, ok := v.(bool); !ok || !b {
		panic(ExpectationFailed(text + ", but it was not true."))
	}
}

func ExpectFailure(run func(), text string, msg V) {
	if err := Try(run); err != nil {
		if err.Thunder && msg != nil {
			m, ok := msg.(string)
			if !ok {
				name := "object"
				if isInt(msg) {
					name = "int"
				}
				panic(TypeErr("'in <string>' requires string as left operand, not " + name))
			}
			if !strings.Contains(err.Message, m) {
				panic(ExpectationFailed(text + ", but it failed with \"" + err.Message + "\"."))
			}
		}
		return
	}
	panic(ExpectationFailed(text + ", but it did not fail."))
}

var checks = map[string]func(a, b V) bool{
	"is":          func(a, b V) bool { return Eq(a, b) },
	"is not":      func(a, b V) bool { return !Eq(a, b) },
	"at least":    func(a, b V) bool { return Compare(">=", a, b) },
	"at most":     func(a, b V) bool { return Compare("<=", a, b) },
	"more than":   func(a, b V) bool { return Compare(">", a, b) },
	"less than":   func(a, b V) bool { return Compare("<", a, b) },
	"nothing":     func(a, b V) bool { return a == nil },
	"not nothing": func(a, b V) bool { return a != nil },
	"empty":       func(a, b V) bool { return Eq(PyLen(a), bigZero) },
	"positive":    func(a, b V) bool { return Compare(">", a, bigZero) },
	"negative":    func(a, b V) bool { return Compare("<", a, bigZero) },
	"zero":        func(a, b V) bool { return Eq(a, bigZero) },
	"between": func(a, b V) bool {
		lh := b.(*List).Items
		return Compare("<=", lh[0], a) && Compare("<=", a, lh[1])
	},
	"in":       func(a, b V) bool { return contains(b, a) },
	"contains": func(a, b V) bool { return contains(a, b) },
}

func ExpectValue(actual V, full, op string, want V, text string) {
	var ok bool
	if known, has := checks[full]; has {
		ok = known(actual, want)
	} else {
		ok = !checks[op](actual, want)
	}
	if !ok {
		panic(ExpectationFailed(text + ", but it was " + Show(actual) + "."))
	}
}

func describeError(e *Err) string {
	where := e.Where
	message := Explain(e)
	code := codeOf(e)
	if code == "TC508" && !e.Thunder {
		message = "Python code used by this line failed: " + message
	}
	place := "In the program"
	if len(where) > 0 {
		inner := where[len(where)-1]
		place = fmt.Sprintf("%s, line %d", inner.File, inner.Line)
		if len(where) > 1 {
			callers := []string{}
			for i := len(where) - 2; i >= 0; i-- {
				callers = append(callers, strconv.Itoa(where[i].Line))
			}
			place += " (reached from line " + strings.Join(callers, ", then line ") + ")"
		}
	}
	return place + ": " + message + "  [" + code + "]"
}

// Values the generated code writes literally.
func D(text string) V     { return ParseDec(text) }
func M(text string) V     { return moneyOf(text) }
func Today() V            { t := time.Now(); return &Date{t.Year(), int(t.Month()), t.Day()} }
func DateOf(text string) V {
	d := parseDate(text)
	if d == nil {
		panic(PyErr("ValueError", "Invalid isoformat string: '"+text+"'"))
	}
	return d
}

func isNumberText(s string) bool {
	if s == "" {
		return false
	}
	i := 0
	if s[0] == '+' || s[0] == '-' {
		i = 1
	}
	if i >= len(s) || s[i] < '0' || s[i] > '9' {
		return false
	}
	for i < len(s) && ((s[i] >= '0' && s[i] <= '9') || s[i] == '_') {
		i++
	}
	if i == len(s) {
		return true
	}
	if s[i] != '.' || i+1 >= len(s) {
		return false
	}
	i++
	for i < len(s) {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
		i++
	}
	return true
}

func ToNumber(x V) V {
	if isNumber(x) {
		return x
	}
	if m, ok := x.(*Money); ok {
		return m.Amount
	}
	if s, ok := x.(string); ok {
		t := strings.ReplaceAll(pyStrip(s), ",", "")
		if isNumberText(t) {
			if strings.Contains(t, ".") {
				return ParseDec(t)
			}
			v, _ := new(big.Int).SetString(strings.ReplaceAll(strings.TrimPrefix(t, "+"), "_", ""), 10)
			return v
		}
	}
	panic(ConversionFailed(describe(x) + " is not a number."))
}

func ToWhole(x V) V {
	n := ToNumber(x)
	if i, ok := n.(*big.Int); ok {
		return i
	}
	d := n.(*Dec)
	if d.isIntegral() {
		return d.toBigInt()
	}
	panic(ConversionFailed(Show(d) + " is not a whole number."))
}

func ToMoney(x V) V {
	if m, ok := x.(*Money); ok {
		return m
	}
	if s, ok := x.(string); ok {
		t := strings.ReplaceAll(pyStrip(s), ",", "")
		negative := strings.HasPrefix(t, "-")
		t = strings.TrimLeft(t, "-")
		t = strings.TrimLeft(t, "$")
		if isNumberText(t) {
			if negative {
				t = "-" + t
			}
			return moneyOf(t)
		}
		panic(ConversionFailed(describe(x) + " is not an amount of money."))
	}
	return &Money{toDec(ToNumber(x))}
}

func ToYesNo(x V) V {
	if b, ok := x.(bool); ok {
		return b
	}
	if s, ok := x.(string); ok {
		t := strings.ToLower(pyStrip(s))
		if t == "yes" || t == "true" {
			return true
		}
		if t == "no" || t == "false" {
			return false
		}
	}
	panic(ConversionFailed(describe(x) + " is not yes or no."))
}

func ToDate(x V) V {
	if d, ok := x.(*Date); ok {
		return d
	}
	if d := parseDate(pyStrip(PyStr(x))); d != nil {
		return d
	}
	panic(ConversionFailed(describe(x) + " is not a date (write it as YYYY-MM-DD)."))
}

func totalOf(items []V) V {
	if len(items) == 0 {
		return big.NewInt(0)
	}
	result := items[0]
	for _, x := range items[1:] {
		result = Add(result, x)
	}
	return result
}

func textOf(v V, what string) string {
	s, ok := v.(string)
	if !ok {
		panic(KindMismatch(what + " needs text, but it is " + describe(v) + "."))
	}
	return s
}

func Joined(items, sep V) V {
	sp := textOf(sep, "\"joined with\"")
	out := []string{}
	for i, x := range iterItems(items) {
		s, ok := x.(string)
		if !ok {
			panic(KindMismatch(fmt.Sprintf("\"joined with\" joins text, but item %d is %s. Turn it into text first.", i+1, describe(x))))
		}
		out = append(out, s)
	}
	return strings.Join(out, sp)
}

func SplitAt(text, sep V) V {
	sp := textOf(sep, "\"split at\"")
	if sp == "" {
		panic(KindMismatch("\"split at\" needs something to split at, not empty text."))
	}
	parts := strings.Split(textOf(text, "\"split at\""), sp)
	out := make([]V, len(parts))
	for i, p := range parts {
		out[i] = p
	}
	return &List{out}
}

func Replacing(text, old, nw V) V {
	o := textOf(old, "\"replacing\"")
	if o == "" {
		panic(KindMismatch("\"replacing\" needs something to replace, not empty text."))
	}
	t := textOf(text, "\"replacing\"")
	return strings.ReplaceAll(t, o, textOf(nw, "\"replacing … with\""))
}

const punct = ".,;:!?\"'()[]{}<>“”‘’…-"

func stripPunct(w string) string {
	rs := []rune(w)
	i, j := 0, len(rs)
	for i < j && strings.ContainsRune(punct, rs[i]) {
		i++
	}
	for j > i && strings.ContainsRune(punct, rs[j-1]) {
		j--
	}
	return string(rs[i:j])
}

// Filter / Pick: "where" and "from" over a list (items read as Python's comprehension does).
func Filter(list V, keep func(item V) bool) V {
	out := []V{}
	for _, x := range iterItems(list) {
		if keep(x) {
			out = append(out, x)
		}
	}
	return &List{out}
}
func Pick(list V, get func(item V) V) V {
	items := iterItems(list)
	out := make([]V, len(items))
	for i, x := range items {
		out[i] = get(x)
	}
	return &List{out}
}

// EntryAt is one item of a map's entry (0: the key, 1: the value), for sorting a map.
func EntryAt(entry V, k int) V { return entry.(*Tuple).Items[k] }

// Cmp / IsNothing / Not / And: small helpers for the generated conditions.
func Cmp(op string, a, b V) V { return Compare(op, a, b) }
func IsNothing(v V) bool      { return v == nil }
func EqLen0(v V) V             { return Eq(PyLen(v), bigZero) }

// ── Running: frames (for error lines), output, and the program or its tests ────────────────────────────────────

// Frame is where a program, test, call, or kept value is running: its Thunder file and current line.
type Frame struct {
	File string
	Line int
}

var frames []*Frame
var aborted bool
var exitCode int
var out = bufio.NewWriterSize(os.Stdout, 1<<16)

func snapshot() []Place {
	p := make([]Place, len(frames))
	for i, f := range frames {
		p[i] = Place{f.File, f.Line}
	}
	return p
}

// EnterFrame is a frame for a program, a test, or a kept value.
func EnterFrame(file string, line int) *Frame {
	if len(frames) >= maxFrames {
		panic(PyErr("RecursionError", "maximum recursion depth exceeded"))
	}
	f := &Frame{file, line}
	frames = append(frames, f)
	return f
}

// EnterCall is a frame for a call; first is the Thunder line the function starts on (0: none).
func EnterCall(file string, line int, first int) *Frame {
	if len(frames) >= maxFrames {
		err := PyErr("RecursionError", "maximum recursion depth exceeded")
		if first != 0 {
			err.Where = append(snapshot(), Place{file, first})
		}
		panic(err)
	}
	f := &Frame{file, line}
	frames = append(frames, f)
	return f
}

// Exit leaves the innermost frame. Called as `defer func() { T.Exit(recover()) }()`: an error on its way out
// remembers where it happened (the innermost frames first seen) and goes on.
func Exit(r V) {
	if r != nil {
		err := AsPyErr(r)
		if err.Where == nil {
			err.Where = snapshot()
		}
		frames = frames[:len(frames)-1]
		panic(err)
	}
	frames = frames[:len(frames)-1]
}

// TopFrame is the innermost frame (a record's Never rule runs in its caller's frame).
func TopFrame() *Frame { return frames[len(frames)-1] }

func withFrame(frame *Frame, fn func() V) (v V) {
	if len(frames) >= maxFrames {
		panic(PyErr("RecursionError", "maximum recursion depth exceeded"))
	}
	frames = append(frames, frame)
	defer func() { Exit(recover()) }()
	return fn()
}

// KeyAt is a key for sorting by a field: it runs in a frame at the sorting line, as the generated Python's lambda does.
func KeyAt(F *Frame, get func(item V) V) func(V) V {
	frame := &Frame{F.File, F.Line}
	return func(item V) V { return withFrame(&Frame{frame.File, frame.Line}, func() V { return get(item) }) }
}

// Say writes a line.
func Say(text string) { out.WriteString(text); out.WriteByte('\n') }

func report(r V) {
	out.Flush()
	fmt.Fprintln(os.Stderr, describeError(AsPyErr(r)))
	exitCode = 1
	aborted = true
}

// Init works out a file's kept values; an error stops the program with a Thunder message.
func Init(file string, fn func(F *Frame)) {
	if aborted {
		return
	}
	F := &Frame{file, 0}
	func() {
		defer func() {
			if r := recover(); r != nil {
				report(r)
			}
		}()
		withFrame(F, func() V { fn(F); return nil })
	}()
}

// Run runs a program's main part, then ends the process with Python's exit status.
func Run(main func()) {
	if !aborted {
		func() {
			defer func() {
				if r := recover(); r != nil {
					report(r)
				}
			}()
			main()
		}()
	}
	out.Flush()
	os.Exit(exitCode)
}

// Test is one Test block: its title, its code, and its line.
type Test struct {
	Title string
	Run   func()
	Line  int
}

// Suite is a file's Test blocks.
type Suite struct {
	File  string
	Tests []Test
}

// RunTests runs every Test block, the way run_tests.py does: one line per test, then the totals.
func RunTests(suites []Suite) {
	if !aborted {
		passed, failed := 0, 0
		for _, s := range suites {
			for _, t := range s.Tests {
				if err := Try(t.Run); err != nil {
					failed++
					Say(fmt.Sprintf("FAIL  %s (%s, line %d)", t.Title, s.File, t.Line))
					Say("      " + describeError(err))
				} else {
					passed++
					Say(fmt.Sprintf("PASS  %s (%s, line %d)", t.Title, s.File, t.Line))
				}
			}
		}
		total := passed + failed
		Say(fmt.Sprintf("%d test%s: %d passed, %d failed", total, plural(total), passed, failed))
		if failed > 0 {
			exitCode = 1
		}
	}
	out.Flush()
	os.Exit(exitCode)
}

// Str / Shown: the text of a value inside {holes} and in say.
func Str(v V) string   { return PyStr(v) }
func Shown(v V) string { return Show(v) }
