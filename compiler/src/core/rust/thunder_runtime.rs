// thunder_runtime.rs: written by the Thunder compiler next to compiled Rust. Standard library only, no crates.
//
// One meaning of Thunder: every value and rule here is a line-by-line port of the Thunder engine's own value code
// (compiler/src/core/engine-values.mjs), which itself follows the Python target. The same program prints the same
// output, and fails with the same words, on Python, the Thunder engine, compiled TypeScript, and compiled Rust
// (compiler/test/core-engines.mjs checks every Core test program on all of them).
//
// Values:   whole number -> Int (arbitrary size)   decimal number -> Dec (exact, like Python's Decimal)
//           money -> Money                         text -> Text   yes/no -> Bool   nothing -> Nothing
//           list -> List (shared, like Python's)   a pair from a map -> Tuple   map -> Map   record -> Record
//
// An error is a Rust panic carrying a TErr: it unwinds to the nearest frame, which remembers the Thunder line it
// happened on, exactly as the other targets' exceptions do.
#![allow(dead_code, clippy::all, non_snake_case, unused_variables, unused_mut)]

use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fmt::Write as _;
use std::io::Write as _;
use std::rc::Rc;

// ── Whole numbers of any size ───────────────────────────────────────────────────────────────────────────────────

const BASE: u64 = 1_000_000_000;

/// A whole number of any size: sign and magnitude (base 10^9, least significant limb first).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BigInt { neg: bool, mag: Vec<u32> }

fn trim(m: &mut Vec<u32>) { while m.len() > 1 && *m.last().unwrap() == 0 { m.pop(); } if m.is_empty() { m.push(0); } }
fn mag_is_zero(m: &[u32]) -> bool { m.len() == 1 && m[0] == 0 }
fn mag_cmp(a: &[u32], b: &[u32]) -> Ordering {
    if a.len() != b.len() { return a.len().cmp(&b.len()); }
    for i in (0..a.len()).rev() { if a[i] != b[i] { return a[i].cmp(&b[i]); } }
    Ordering::Equal
}
fn mag_add(a: &[u32], b: &[u32]) -> Vec<u32> {
    let mut out = Vec::with_capacity(a.len().max(b.len()) + 1);
    let mut carry = 0u64;
    for i in 0..a.len().max(b.len()) {
        let s = *a.get(i).unwrap_or(&0) as u64 + *b.get(i).unwrap_or(&0) as u64 + carry;
        out.push((s % BASE) as u32);
        carry = s / BASE;
    }
    if carry > 0 { out.push(carry as u32); }
    trim(&mut out);
    out
}
/// a - b, where a >= b.
fn mag_sub(a: &[u32], b: &[u32]) -> Vec<u32> {
    let mut out = Vec::with_capacity(a.len());
    let mut borrow = 0i64;
    for i in 0..a.len() {
        let mut d = a[i] as i64 - *b.get(i).unwrap_or(&0) as i64 - borrow;
        if d < 0 { d += BASE as i64; borrow = 1; } else { borrow = 0; }
        out.push(d as u32);
    }
    trim(&mut out);
    out
}
fn mag_mul(a: &[u32], b: &[u32]) -> Vec<u32> {
    if mag_is_zero(a) || mag_is_zero(b) { return vec![0]; }
    let mut acc = vec![0u64; a.len() + b.len() + 1];
    for (i, &x) in a.iter().enumerate() {
        let mut carry = 0u64;
        for (j, &y) in b.iter().enumerate() {
            let t = acc[i + j] + x as u64 * y as u64 + carry;
            acc[i + j] = t % BASE;
            carry = t / BASE;
        }
        let mut k = i + b.len();
        while carry > 0 { let t = acc[k] + carry; acc[k] = t % BASE; carry = t / BASE; k += 1; }
    }
    let mut out: Vec<u32> = acc.into_iter().map(|x| x as u32).collect();
    trim(&mut out);
    out
}
fn mag_mul_small(a: &[u32], m: u32) -> Vec<u32> {
    let mut out = Vec::with_capacity(a.len() + 1);
    let mut carry = 0u64;
    for &x in a { let t = x as u64 * m as u64 + carry; out.push((t % BASE) as u32); carry = t / BASE; }
    if carry > 0 { out.push(carry as u32); }
    trim(&mut out);
    out
}
/// (quotient, remainder) of magnitudes; b is not zero.
fn mag_divmod(a: &[u32], b: &[u32]) -> (Vec<u32>, Vec<u32>) {
    if mag_cmp(a, b) == Ordering::Less { return (vec![0], a.to_vec()); }
    if b.len() == 1 {
        let d = b[0] as u64;
        let mut q = vec![0u32; a.len()];
        let mut r = 0u64;
        for i in (0..a.len()).rev() { let cur = r * BASE + a[i] as u64; q[i] = (cur / d) as u32; r = cur % d; }
        trim(&mut q);
        return (q, vec![r as u32]);
    }
    let mut q = vec![0u32; a.len()];
    let mut r: Vec<u32> = vec![0];
    for i in (0..a.len()).rev() {
        // r = r * BASE + a[i]
        let mut nr = Vec::with_capacity(r.len() + 1);
        nr.push(a[i]);
        nr.extend_from_slice(&r);
        trim(&mut nr);
        r = nr;
        if mag_cmp(&r, b) == Ordering::Less { continue; }
        // The quotient digit, by binary search between estimates.
        let (mut lo, mut hi) = (0u64, BASE - 1);
        while lo < hi {
            let mid = (lo + hi + 1) / 2;
            if mag_cmp(&mag_mul_small(b, mid as u32), &r) != Ordering::Greater { lo = mid; } else { hi = mid - 1; }
        }
        q[i] = lo as u32;
        r = mag_sub(&r, &mag_mul_small(b, lo as u32));
    }
    trim(&mut q);
    (q, r)
}

impl BigInt {
    pub fn zero() -> BigInt { BigInt { neg: false, mag: vec![0] } }
    pub fn from_i64(n: i64) -> BigInt {
        let neg = n < 0;
        let mut u = n.unsigned_abs();
        let mut mag = Vec::new();
        if u == 0 { mag.push(0); }
        while u > 0 { mag.push((u % BASE) as u32); u /= BASE; }
        BigInt { neg, mag }
    }
    fn norm(mut self) -> BigInt { trim(&mut self.mag); if mag_is_zero(&self.mag) { self.neg = false; } self }
    pub fn parse(text: &str) -> Option<BigInt> {
        let t = text.trim().replace('_', "");
        let (neg, digits) = if let Some(r) = t.strip_prefix('-') { (true, r.to_string()) } else if let Some(r) = t.strip_prefix('+') { (false, r.to_string()) } else { (false, t.clone()) };
        if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) { return None; }
        let bytes = digits.as_bytes();
        let mut mag = Vec::new();
        let mut end = bytes.len();
        while end > 0 {
            let start = end.saturating_sub(9);
            mag.push(std::str::from_utf8(&bytes[start..end]).unwrap().parse::<u32>().unwrap());
            end = start;
        }
        Some(BigInt { neg, mag }.norm())
    }
    pub fn is_zero(&self) -> bool { mag_is_zero(&self.mag) }
    pub fn is_neg(&self) -> bool { self.neg }
    pub fn abs(&self) -> BigInt { BigInt { neg: false, mag: self.mag.clone() } }
    pub fn negate(&self) -> BigInt { BigInt { neg: !self.neg, mag: self.mag.clone() }.norm() }
    pub fn add(&self, o: &BigInt) -> BigInt {
        if self.neg == o.neg { return BigInt { neg: self.neg, mag: mag_add(&self.mag, &o.mag) }.norm(); }
        match mag_cmp(&self.mag, &o.mag) {
            Ordering::Equal => BigInt::zero(),
            Ordering::Greater => BigInt { neg: self.neg, mag: mag_sub(&self.mag, &o.mag) }.norm(),
            Ordering::Less => BigInt { neg: o.neg, mag: mag_sub(&o.mag, &self.mag) }.norm(),
        }
    }
    pub fn sub(&self, o: &BigInt) -> BigInt { self.add(&o.negate()) }
    pub fn mul(&self, o: &BigInt) -> BigInt { BigInt { neg: self.neg != o.neg, mag: mag_mul(&self.mag, &o.mag) }.norm() }
    pub fn mul_small(&self, m: u32) -> BigInt { BigInt { neg: self.neg, mag: mag_mul_small(&self.mag, m) }.norm() }
    /// Truncated division (toward zero), as JavaScript's BigInt / and %.
    pub fn divrem(&self, o: &BigInt) -> (BigInt, BigInt) {
        let (q, r) = mag_divmod(&self.mag, &o.mag);
        (BigInt { neg: self.neg != o.neg, mag: q }.norm(), BigInt { neg: self.neg, mag: r }.norm())
    }
    pub fn cmp(&self, o: &BigInt) -> Ordering {
        match (self.neg, o.neg) {
            (false, true) => Ordering::Greater,
            (true, false) => Ordering::Less,
            (false, false) => mag_cmp(&self.mag, &o.mag),
            (true, true) => mag_cmp(&o.mag, &self.mag),
        }
    }
    pub fn pow10(n: i64) -> BigInt {
        let mut mag = vec![0u32; (n / 9) as usize];
        mag.push(10u32.pow((n % 9) as u32));
        BigInt { neg: false, mag }
    }
    pub fn is_even(&self) -> bool { self.mag[0] % 2 == 0 }
    pub fn to_i64(&self) -> Option<i64> {
        if self.mag.len() > 3 { return None; }
        let mut v: i128 = 0;
        for &l in self.mag.iter().rev() { v = v * BASE as i128 + l as i128; }
        if self.neg { v = -v; }
        if v > i64::MAX as i128 || v < i64::MIN as i128 { None } else { Some(v as i64) }
    }
    pub fn ndigits(&self) -> i64 {
        let top = *self.mag.last().unwrap();
        (self.mag.len() as i64 - 1) * 9 + if top == 0 { 1 } else { top.to_string().len() as i64 }
    }
    pub fn digits(&self) -> String {
        let mut s = String::new();
        let mut first = true;
        for &l in self.mag.iter().rev() { if first { let _ = write!(s, "{}", l); first = false; } else { let _ = write!(s, "{:09}", l); } }
        s
    }
    pub fn to_string(&self) -> String { format!("{}{}", if self.neg { "-" } else { "" }, self.digits()) }
}

fn big(n: i64) -> BigInt { BigInt::from_i64(n) }

// ── Exact decimals: Python's Decimal with its default context (28 digits, half-even when a result is too long) ──

const PREC: i64 = 28;

/// sign (true when negative), coefficient >= 0, exponent.
#[derive(Clone, Debug)]
pub struct Dec { pub s: bool, pub c: BigInt, pub e: i64 }

fn p10(n: i64) -> BigInt { BigInt::pow10(n) }

impl Dec {
    pub fn new(s: bool, c: BigInt, e: i64) -> Dec { Dec { s, c, e } }
    pub fn int(n: &BigInt) -> Dec { Dec { s: n.is_neg(), c: n.abs(), e: 0 } }
    /// Decimal("text"): exact; None when the text is not a number.
    pub fn parse(text: &str) -> Option<Dec> {
        let t: String = text.trim().replace('_', "");
        let b = t.as_bytes();
        let mut i = 0;
        let mut neg = false;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') { neg = b[i] == b'-'; i += 1; }
        let s0 = i;
        while i < b.len() && b[i].is_ascii_digit() { i += 1; }
        let int_part = &t[s0..i];
        let mut frac = "";
        if i < b.len() && b[i] == b'.' { i += 1; let f0 = i; while i < b.len() && b[i].is_ascii_digit() { i += 1; } frac = &t[f0..i]; }
        if int_part.is_empty() && frac.is_empty() { return None; }
        let mut exp: i64 = 0;
        if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
            i += 1;
            let e0 = i;
            if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
            let d0 = i;
            while i < b.len() && b[i].is_ascii_digit() { i += 1; }
            if d0 == i { return None; }
            exp = t[e0..i].parse::<i64>().ok()?;
        }
        if i != b.len() { return None; }
        let digits = format!("{}{}", int_part, frac);
        let c = BigInt::parse(if digits.is_empty() { "0" } else { &digits })?;
        Some(Dec { s: neg, c, e: exp - frac.len() as i64 })
    }
    pub fn is_zero(&self) -> bool { self.c.is_zero() }
    /// _fix: round to 28 significant digits, half to even.
    pub fn fix(self) -> Dec {
        let d = self.c.ndigits() - PREC;
        if d <= 0 { return self; }
        let p = p10(d);
        let (mut q, r) = self.c.divrem(&p);
        let half = p10(d - 1).mul_small(5);
        let c = r.cmp(&half);
        if c == Ordering::Greater || (c == Ordering::Equal && !q.is_even()) { q = q.add(&big(1)); }
        let mut e = self.e + d;
        if q.ndigits() > PREC { q = q.divrem(&big(10)).0; e += 1; }
        Dec { s: self.s, c: q, e }
    }
    pub fn signed(&self) -> BigInt { if self.s { self.c.negate() } else { self.c.clone() } }
    pub fn add(a: &Dec, b: &Dec) -> Dec {
        let e = a.e.min(b.e);
        let x = a.signed().mul(&p10(a.e - e));
        let y = b.signed().mul(&p10(b.e - e));
        let sum = x.add(&y);
        let s = if sum.is_zero() {
            if a.s && b.s && a.c.is_zero() && b.c.is_zero() { true } else if a.c.is_zero() && b.c.is_zero() { a.s && b.s } else { false }
        } else { sum.is_neg() };
        Dec { s, c: sum.abs(), e }.fix()
    }
    pub fn negated(&self) -> Dec { Dec { s: !self.s, c: self.c.clone(), e: self.e } }
    pub fn sub(a: &Dec, b: &Dec) -> Dec { Dec::add(a, &b.negated()) }
    pub fn mul(a: &Dec, b: &Dec) -> Dec { Dec { s: a.s != b.s, c: a.c.mul(&b.c), e: a.e + b.e }.fix() }
    /// Python's Decimal division: exact when it can be, else 28 digits.
    pub fn div(a: &Dec, b: &Dec) -> Dec {
        let s = a.s != b.s;
        if a.c.is_zero() { return Dec { s, c: BigInt::zero(), e: a.e - b.e }.fix(); }
        let shift = b.c.ndigits() - a.c.ndigits() + PREC + 1;
        let mut exp = a.e - b.e - shift;
        let (mut coeff, rem);
        if shift >= 0 { let n = a.c.mul(&p10(shift)); let qr = n.divrem(&b.c); coeff = qr.0; rem = qr.1; }
        else { let d = b.c.mul(&p10(-shift)); let qr = a.c.divrem(&d); coeff = qr.0; rem = qr.1; }
        if !rem.is_zero() {
            if coeff.divrem(&big(5)).1.is_zero() { coeff = coeff.add(&big(1)); }
        } else {
            let ideal = a.e - b.e;
            while exp < ideal && coeff.divrem(&big(10)).1.is_zero() { coeff = coeff.divrem(&big(10)).0; exp += 1; }
        }
        Dec { s, c: coeff, e: exp }.fix()
    }
    /// Decimal % Decimal: the remainder with the sign of the dividend.
    pub fn rem(a: &Dec, b: &Dec) -> Dec {
        let e = a.e.min(b.e);
        let x = a.c.mul(&p10(a.e - e));
        let y = b.c.mul(&p10(b.e - e));
        Dec { s: a.s, c: x.divrem(&y).1, e }.fix()
    }
    pub fn neg(&self) -> Dec { (if self.c.is_zero() { Dec { s: false, c: BigInt::zero(), e: self.e } } else { self.negated() }).fix() }
    pub fn abs(&self) -> Dec { Dec { s: false, c: self.c.clone(), e: self.e }.fix() }
    pub fn cmp(a: &Dec, b: &Dec) -> Ordering {
        let e = a.e.min(b.e);
        let x = a.signed().mul(&p10(a.e - e));
        let y = b.signed().mul(&p10(b.e - e));
        x.cmp(&y)
    }
    /// quantize to exponent `e`, rounding half away from zero.
    pub fn quantize_half_up(&self, e: i64) -> Dec {
        if e <= self.e { return Dec { s: self.s, c: self.c.mul(&p10(self.e - e)), e }; }
        let p = p10(e - self.e);
        let (mut q, r) = self.c.divrem(&p);
        if r.mul_small(2).cmp(&p) != Ordering::Less { q = q.add(&big(1)); }
        Dec { s: self.s, c: q, e }
    }
    pub fn is_integral(&self) -> bool { if self.e >= 0 { return true; } self.c.divrem(&p10(-self.e)).1.is_zero() }
    /// int(d): toward zero.
    pub fn to_bigint(&self) -> BigInt {
        let v = if self.e >= 0 { self.c.mul(&p10(self.e)) } else { self.c.divrem(&p10(-self.e)).0 };
        if self.s { v.negate() } else { v }
    }
    /// str(Decimal): Python's to-scientific-string.
    pub fn to_sci(&self) -> String {
        let digits = self.c.digits();
        let n = digits.len() as i64;
        let left = self.e + n;
        let dot = if self.e <= 0 && left > -6 { left } else { 1 };
        let (ip, fp) = if dot <= 0 { ("0".to_string(), format!(".{}{}", "0".repeat((-dot) as usize), digits)) }
            else if dot >= n { (format!("{}{}", digits, "0".repeat((dot - n) as usize)), String::new()) }
            else { (digits[..dot as usize].to_string(), format!(".{}", &digits[dot as usize..])) };
        let ex = if left == dot { String::new() } else { format!("E{}{}", if left - dot >= 0 { "+" } else { "" }, left - dot) };
        format!("{}{}{}{}", if self.s { "-" } else { "" }, ip, fp, ex)
    }
    /// format(d, "f") or format(d, ",.Nf").
    pub fn to_fixed(&self, places: Option<i64>, group: bool) -> String {
        let d = match places { Some(p) => self.round_half_even(-p), None => self.clone() };
        let digits = d.c.digits();
        let n = digits.len() as i64;
        let dot = d.e + n;
        let (mut ip, fp) = if dot < 0 { ("0".to_string(), format!("{}{}", "0".repeat((-dot) as usize), digits)) }
            else if dot > n { (format!("{}{}", digits, "0".repeat((dot - n) as usize)), String::new()) }
            else { (if dot == 0 { "0".to_string() } else { digits[..dot as usize].to_string() }, digits[dot as usize..].to_string()) };
        if group {
            let b: Vec<char> = ip.chars().collect();
            let mut g = String::new();
            for (i, ch) in b.iter().enumerate() { if i > 0 && (b.len() - i) % 3 == 0 { g.push(','); } g.push(*ch); }
            ip = g;
        }
        format!("{}{}{}", if d.s { "-" } else { "" }, ip, if fp.is_empty() { String::new() } else { format!(".{}", fp) })
    }
    pub fn round_half_even(&self, e: i64) -> Dec {
        if e <= self.e { return Dec { s: self.s, c: self.c.mul(&p10(self.e - e)), e }; }
        let p = p10(e - self.e);
        let (mut q, r) = self.c.divrem(&p);
        let c = r.mul_small(2).cmp(&p);
        if c == Ordering::Greater || (c == Ordering::Equal && !q.is_even()) { q = q.add(&big(1)); }
        Dec { s: self.s, c: q, e }
    }
    /// A key equal for equal numbers (1 and 1.0 and 1.00 are the same map key, as in Python).
    pub fn key(&self) -> String {
        if self.c.is_zero() { return "0".to_string(); }
        let mut c = self.c.clone();
        let mut e = self.e;
        loop { let (q, r) = c.divrem(&big(10)); if !r.is_zero() { break; } c = q; e += 1; }
        format!("{}{}e{}", if self.s { "-" } else { "" }, c.digits(), e)
    }
}

// ── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────────

/// An error: a Thunder one (code TC5xx and its words) or one Python itself would raise (its type and message).
#[derive(Clone, Debug)]
pub struct TErr {
    pub code: Option<&'static str>,
    pub py_type: String,
    pub message: String,
    /// What a KeyError names, as Thunder shows it.
    pub arg: Option<String>,
    /// Where it happened: the frames' files and lines, outermost first.
    pub at: Option<Vec<(String, i64)>>,
}
impl TErr {
    pub fn thunder(&self) -> bool { self.code.is_some() }
}
pub fn thunder_err(code: &'static str, m: String, py_type: &str) -> TErr { TErr { code: Some(code), py_type: py_type.to_string(), message: m, arg: None, at: None } }
pub fn py_err(py_type: &str, m: String) -> TErr { TErr { code: None, py_type: py_type.to_string(), message: m, arg: None, at: None } }

/// Raise an error: it unwinds to the nearest frame (or "If this fails", or an Expect that wants it).
pub fn raise(e: TErr) -> ! { std::panic::panic_any(e) }
pub fn Stop(m: String) -> ! { raise(thunder_err("TC507", m, "Stop")) }
fn rule_broken(m: String) -> ! { raise(thunder_err("TC504", m, "RuleBroken")) }
fn expectation_failed(m: String) -> ! { raise(thunder_err("TC505", m, "ExpectationFailed")) }
fn kind_mismatch(m: String) -> ! { raise(thunder_err("TC506", m, "TypeError")) }
fn conversion_failed(m: String) -> ! { raise(thunder_err("TC509", m, "ValueError")) }
fn missing_value(m: String) -> ! { raise(thunder_err("TC503", m, "LookupError")) }
fn divided_by_zero() -> ! { raise(thunder_err("TC501", "You divided by zero.".to_string(), "ZeroDivisionError")) }
fn type_err(m: String) -> ! { raise(py_err("TypeError", m)) }

/// explain(error) in thunder_runtime.py: the error as a sentence.
pub fn explain_err(e: &TErr) -> String {
    if e.thunder() { return e.message.clone(); }
    let t = e.py_type.as_str();
    if t == "ZeroDivisionError" || t == "DivisionByZero" { return "You divided by zero.".to_string(); }
    if t == "InvalidOperation" { return "This calculation has no answer (for example, zero divided by zero).".to_string(); }
    if t == "KeyError" { return format!("There is no entry for {}.", e.arg.clone().unwrap_or_else(|| "nothing".to_string())); }
    if (t == "TypeError" || t == "AttributeError") && e.message.contains("NoneType") { return "A value was nothing where a value was needed.".to_string(); }
    if t == "TypeError" { return format!("Values of different kinds were mixed ({}).", e.message); }
    if t == "RecursionError" { return "A function called itself too many times.".to_string(); }
    format!("{}: {}", t, e.message)
}

/// _code(error) in thunder_runtime.py.
pub fn code_of(e: &TErr) -> &'static str {
    if let Some(c) = e.code { return c; }
    let t = e.py_type.as_str();
    if t == "ZeroDivisionError" || t == "DivisionByZero" { return "TC501"; }
    if (t == "TypeError" || t == "AttributeError") && e.message.contains("NoneType") { return "TC502"; }
    if t == "KeyError" { return "TC503"; }
    if t == "TypeError" { return "TC506"; }
    "TC508"
}

/// describe_error(error): "main.thunder, line 3 (reached from line 7): … [TC501]".
pub fn describe_error(e: &TErr) -> String {
    let at = e.at.clone().unwrap_or_default();
    let mut message = explain_err(e);
    let code = code_of(e);
    if code == "TC508" && !e.thunder() { message = format!("Python code used by this line failed: {}", message); }
    let mut place = match at.last() { Some((f, l)) => format!("{}, line {}", f, l), None => "In the program".to_string() };
    if at.len() > 1 {
        let callers: Vec<String> = at[..at.len() - 1].iter().rev().map(|(_, l)| l.to_string()).collect();
        place = format!("{} (reached from line {})", place, callers.join(", then line "));
    }
    format!("{}: {}  [{}]", place, message, code)
}

// ── Values ─────────────────────────────────────────────────────────────────────────────────────────────────────

/// A record's kind: its name, its fields (name and Thunder kind), and the Never rules on each field.
pub struct Kind { pub py: &'static str, pub fields: Vec<(&'static str, &'static str)>, pub rules: Vec<(&'static str, Vec<Rule>)> }
/// A Never rule: broken when `cond` is true of the new value.
pub struct Rule { pub cond: fn(Value) -> Value, pub text: &'static str, pub line: i64 }

/// A record: its kind, and its field values (in declaration order).
pub struct Rec { pub kind: Rc<Kind>, pub f: Vec<(&'static str, Value)> }
impl Rec {
    fn get(&self, name: &str) -> Option<Value> { self.f.iter().find(|(k, _)| *k == name).map(|(_, v)| v.clone()) }
    fn has(&self, name: &str) -> bool { self.f.iter().any(|(k, _)| *k == name) }
}

/// A Python dict: insertion order kept; keys equal the way Python compares them (1 == 1.0 == True).
#[derive(Clone, Default)]
pub struct PyDict { entries: Vec<Option<(Value, Value)>>, index: HashMap<String, usize>, live: usize }
impl PyDict {
    pub fn new() -> PyDict { PyDict::default() }
    pub fn has(&self, k: &Value) -> bool { self.index.contains_key(&key_of(k)) }
    pub fn get(&self, k: &Value) -> Option<Value> { self.index.get(&key_of(k)).and_then(|&i| self.entries[i].as_ref().map(|(_, v)| v.clone())) }
    pub fn set(&mut self, k: Value, v: Value) {
        let id = key_of(&k);
        if let Some(&i) = self.index.get(&id) { if let Some(e) = self.entries[i].as_mut() { e.1 = v; } return; }
        self.index.insert(id, self.entries.len());
        self.entries.push(Some((k, v)));
        self.live += 1;
    }
    pub fn delete(&mut self, k: &Value) { if let Some(i) = self.index.remove(&key_of(k)) { self.entries[i] = None; self.live -= 1; } }
    pub fn len(&self) -> usize { self.live }
    pub fn pairs(&self) -> Vec<(Value, Value)> { self.entries.iter().filter_map(|e| e.clone()).collect() }
    pub fn keys(&self) -> Vec<Value> { self.pairs().into_iter().map(|(k, _)| k).collect() }
    pub fn values(&self) -> Vec<Value> { self.pairs().into_iter().map(|(_, v)| v).collect() }
    fn key_ids(&self) -> Vec<String> { self.pairs().iter().map(|(k, _)| key_of(k)).collect() }
}

#[derive(Clone)]
pub enum Value {
    Nothing,
    Bool(bool),
    Int(BigInt),
    Dec(Dec),
    Money(Dec),
    Text(Rc<String>),
    List(Rc<RefCell<Vec<Value>>>),
    Tuple(Rc<Vec<Value>>),
    Map(Rc<RefCell<PyDict>>),
    Record(Rc<RefCell<Rec>>),
    Date(i64, i64, i64),
    NotGiven,
}
use Value::*;

pub const NOT_GIVEN: Value = Value::NotGiven;
pub const NOTHING: Value = Value::Nothing;

/// Values the generated code writes literally.
pub fn int(text: &str) -> Value { Int(BigInt::parse(text).expect("a whole number literal")) }
pub fn int_n(n: i64) -> Value { Int(big(n)) }
pub fn dec(text: &str) -> Value { Dec(Dec::parse(text).expect("a decimal literal")) }
pub fn money(text: &str) -> Value { money_of(&text_v(text)) }
pub fn text(s: &str) -> Value { Text(Rc::new(s.to_string())) }
pub fn text_v(s: &str) -> Value { Text(Rc::new(s.to_string())) }
pub fn string(s: String) -> Value { Text(Rc::new(s)) }
pub fn yes(b: bool) -> Value { Bool(b) }
pub fn list(items: Vec<Value>) -> Value { List(Rc::new(RefCell::new(items))) }
pub fn new_map() -> Value { Map(Rc::new(RefCell::new(PyDict::new()))) }
pub fn tuple(items: Vec<Value>) -> Value { Tuple(Rc::new(items)) }
pub fn date(t: &str) -> Value { match parse_date(t) { Some(d) => d, None => raise(py_err("ValueError", format!("Invalid isoformat string: '{}'", t))) } }
pub fn today() -> Value {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (y, m, d) = civil_from_days(secs.div_euclid(86400) + local_offset_days());
    Date(y, m, d)
}
fn local_offset_days() -> i64 { 0 }
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// date.fromisoformat for YYYY-MM-DD (and YYYYMMDD); None when it is not a date.
fn parse_date(text: &str) -> Option<Value> {
    let t = text.as_bytes();
    let digits = |s: &[u8]| s.iter().all(|c| c.is_ascii_digit());
    let (y, mo, d) = if t.len() == 10 && t[4] == b'-' && t[7] == b'-' && digits(&t[0..4]) && digits(&t[5..7]) && digits(&t[8..10]) { (&text[0..4], &text[5..7], &text[8..10]) }
        else if t.len() == 8 && digits(t) { (&text[0..4], &text[4..6], &text[6..8]) }
        else if t.len() == 9 && digits(&t[0..4]) && ((t[4] == b'-' && digits(&t[5..9])) || (t[6] == b'-' && digits(&t[0..6]) && digits(&t[7..9]))) {
            if t[4] == b'-' { (&text[0..4], &text[5..7], &text[7..9]) } else { (&text[0..4], &text[4..6], &text[7..9]) }
        } else { return None; };
    let (y, mo, d): (i64, i64, i64) = (y.parse().ok()?, mo.parse().ok()?, d.parse().ok()?);
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[(mo - 1) as usize] { return None; }
    Some(Date(y, mo, d))
}
fn iso(y: i64, m: i64, d: i64) -> String { format!("{:04}-{:02}-{:02}", y, m, d) }

// ── Kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────

fn is_int(v: &Value) -> bool { matches!(v, Int(_)) }
fn is_number(v: &Value) -> bool { matches!(v, Int(_) | Dec(_)) } // _is_number: never yes/no
fn is_int_like(v: &Value) -> bool { matches!(v, Int(_) | Bool(_)) }
fn is_num_like(v: &Value) -> bool { matches!(v, Int(_) | Bool(_) | Dec(_)) }
fn as_big(v: &Value) -> BigInt { match v { Int(n) => n.clone(), Bool(b) => big(if *b { 1 } else { 0 }), _ => BigInt::zero() } }
fn dec_of(v: &Value) -> Dec { match v { Dec(d) => d.clone(), Int(n) => Dec::int(n), Bool(b) => Dec::int(&big(if *b { 1 } else { 0 })), _ => Dec::int(&BigInt::zero()) } }
fn num_cmp(a: &Value, b: &Value) -> Ordering { if is_int_like(a) && is_int_like(b) { as_big(a).cmp(&as_big(b)) } else { Dec::cmp(&dec_of(a), &dec_of(b)) } }

/// Python's type name, as its error messages print it.
pub fn type_name(v: &Value) -> String {
    match v {
        Nothing => "NoneType".into(),
        Bool(_) => "bool".into(),
        Int(_) => "int".into(),
        Text(_) => "str".into(),
        Dec(_) => "decimal.Decimal".into(),
        Money(_) => "Money".into(),
        List(_) => "list".into(),
        Tuple(_) => "tuple".into(),
        Map(_) => "dict".into(),
        Date(..) => "datetime.date".into(),
        Record(r) => r.borrow().kind.py.to_string(),
        NotGiven => "_NotGiven".into(),
    }
}
fn short_name(v: &Value) -> String { match v { Dec(_) => "Decimal".into(), Date(..) => "date".into(), _ => type_name(v) } }

/// _describe(v) in thunder_runtime.py.
pub fn describe(v: &Value) -> String {
    match v {
        Nothing => "nothing".into(),
        Bool(_) => "a yes/no value".into(),
        Text(s) => format!("the text \"{}\"", s),
        Int(_) | Dec(_) => format!("the number {}", show_s(v)),
        Money(_) => money_str(v),
        _ => format!("a value ({})", short_name(v)),
    }
}

fn money_str(v: &Value) -> String {
    if let Money(a) = v {
        let places = if a.e < 0 { 2.max(-a.e) } else { 2 };
        format!("{}{}", if a.s && !a.c.is_zero() { "-$" } else { "$" }, a.abs().to_fixed(Some(places), true))
    } else { String::new() }
}

/// show(v): a value the way Thunder says it.
pub fn show_s(v: &Value) -> String {
    match v {
        Nothing => "nothing".into(),
        Bool(true) => "yes".into(),
        Bool(false) => "no".into(),
        Dec(d) => { let t = d.to_fixed(None, false); if t.contains('.') { t.trim_end_matches('0').trim_end_matches('.').to_string() } else { t } }
        List(items) => format!("[{}]", items.borrow().iter().map(show_s).collect::<Vec<_>>().join(", ")),
        Tuple(items) => format!("[{}]", items.iter().map(show_s).collect::<Vec<_>>().join(", ")),
        Map(m) => format!("{{{}}}", m.borrow().pairs().iter().map(|(k, x)| format!("{}: {}", show_s(k), show_s(x))).collect::<Vec<_>>().join(", ")),
        Record(r) => { let r = r.borrow(); format!("{}({})", r.kind.py, r.kind.fields.iter().map(|(f, _)| format!("{}: {}", f.replace('_', " "), show_s(&r.get(f).unwrap_or(Nothing)))).collect::<Vec<_>>().join(", ")) }
        Date(y, m, d) => iso(*y, *m, *d),
        _ => py_str_s(v),
    }
}

/// Python's repr(v).
pub fn py_repr(v: &Value) -> String {
    match v {
        Text(s) => {
            let q = if s.contains('\'') && !s.contains('"') { '"' } else { '\'' };
            let mut out = String::new();
            for ch in s.chars() {
                let cp = ch as u32;
                if ch == '\\' { out.push_str("\\\\"); }
                else if ch == q { out.push('\\'); out.push(q); }
                else if ch == '\n' { out.push_str("\\n"); }
                else if ch == '\r' { out.push_str("\\r"); }
                else if ch == '\t' { out.push_str("\\t"); }
                else if cp < 0x20 || cp == 0x7f { let _ = write!(out, "\\x{:02x}", cp); }
                else { out.push(ch); }
            }
            format!("{}{}{}", q, out, q)
        }
        Nothing => "None".into(),
        Bool(b) => if *b { "True".into() } else { "False".into() },
        Int(n) => n.to_string(),
        Dec(d) => format!("Decimal('{}')", d.to_sci()),
        Money(a) => format!("Money('{}')", a.to_fixed(None, false)),
        List(items) => format!("[{}]", items.borrow().iter().map(py_repr).collect::<Vec<_>>().join(", ")),
        Tuple(items) => if items.len() == 1 { format!("({},)", py_repr(&items[0])) } else { format!("({})", items.iter().map(py_repr).collect::<Vec<_>>().join(", ")) },
        Map(m) => format!("{{{}}}", m.borrow().pairs().iter().map(|(k, x)| format!("{}: {}", py_repr(k), py_repr(x))).collect::<Vec<_>>().join(", ")),
        Date(y, m, d) => format!("datetime.date({}, {}, {})", y, m, d),
        Record(r) => { let r = r.borrow(); format!("{}({})", r.kind.py, r.kind.fields.iter().map(|(f, _)| format!("{}={}", f, py_repr(&r.get(f).unwrap_or(Nothing)))).collect::<Vec<_>>().join(", ")) }
        NotGiven => "not given".into(),
    }
}

/// Python's str(v).
pub fn py_str_s(v: &Value) -> String {
    match v {
        Text(s) => s.to_string(),
        Money(_) => money_str(v),
        Date(y, m, d) => iso(*y, *m, *d),
        Dec(d) => d.to_sci(),
        _ => py_repr(v),
    }
}
pub fn show(v: Value) -> Value { string(show_s(&v)) }
/// Text with holes: the parts, already turned into text, joined.
pub fn cat(parts: Vec<Value>) -> Value { let mut s = String::new(); for p in parts { if let Text(t) = p { s.push_str(&t); } } string(s) }
pub fn len_of(v: Value) -> Value { py_len(&v) }
pub fn is_nothing(v: Value) -> bool { matches!(v, Nothing) }
pub fn tuple_at(v: Value, i: usize) -> Value { match &v { Tuple(t) => t[i].clone(), List(l) => l.borrow()[i].clone(), _ => Nothing } }
/// Stop with "message".
pub fn stop_with(v: Value) -> ! { Stop(py_str_s(&v)) }
pub fn py_str(v: Value) -> Value { string(py_str_s(&v)) }

/// Python's truth value (used only where the generated Python uses it: "where" conditions and Never rules).
pub fn truthy(v: &Value) -> bool {
    match v {
        Nothing | Bool(false) => false,
        Bool(true) => true,
        Int(n) => !n.is_zero(),
        Dec(d) => !d.is_zero(),
        Text(s) => !s.is_empty(),
        List(l) => !l.borrow().is_empty(),
        Tuple(t) => !t.is_empty(),
        Map(m) => m.borrow().len() > 0,
        _ => true,
    }
}

/// yes_no(v): a condition needs a real yes/no value.
pub fn yes_no(v: Value) -> bool {
    if let Bool(b) = v { return b; }
    kind_mismatch(format!("This needs a yes/no value, but it is {}. Compare it instead, for example: is 0, is empty, is nothing.", describe(&v)))
}

/// _decimal(x) in thunder_runtime.py.
fn to_dec(x: &Value) -> Dec {
    match x {
        Dec(d) => d.clone(),
        Bool(_) => kind_mismatch("A yes/no value was used where a number was needed.".into()),
        Int(n) => Dec::int(n),
        Nothing => kind_mismatch("A value was nothing where a number was needed.".into()),
        _ => kind_mismatch(format!("{} was used where a number was needed.", describe(x))),
    }
}

// ── Money ──────────────────────────────────────────────────────────────────────────────────────────────────────

fn money_of(x: &Value) -> Value {
    match x {
        Money(_) => x.clone(),
        Text(s) => {
            let cleaned = s.replace(',', "").replace('$', "");
            match Dec::parse(cleaned.trim()) { Some(d) => Money(d), None => raise(py_err("InvalidOperation", "[<class 'decimal.ConversionSyntax'>]".into())) }
        }
        _ => Money(to_dec(x)),
    }
}

/// Money._other: the amount of the other side, or a clear error.
fn money_other(other: &Value, verb: &str) -> Dec {
    if let Money(a) = other { return a.clone(); }
    if is_number(other) && num_cmp(other, &Int(BigInt::zero())) == Ordering::Equal { return Dec::int(&BigInt::zero()); }
    kind_mismatch(format!("I can't {} money and {}. Write the number as money, for example $5.", verb, describe(other)))
}

// ── Map keys ───────────────────────────────────────────────────────────────────────────────────────────────────

fn key_of(k: &Value) -> String {
    match k {
        Nothing => "N".into(),
        Text(s) => format!("s{}", s),
        Bool(_) | Int(_) | Dec(_) => format!("n{}", dec_of(k).key()),
        Money(a) => format!("m{}", a.key()),
        Date(y, m, d) => format!("d{}", iso(*y, *m, *d)),
        Tuple(items) => format!("t({})", items.iter().map(key_of).collect::<Vec<_>>().join(",")),
        NotGiven => "G".into(),
        _ => type_err(format!("unhashable type: '{}'", type_name(k))),
    }
}

// ── Python operators ───────────────────────────────────────────────────────────────────────────────────────────

pub fn py_len(v: &Value) -> Value {
    match v {
        Text(s) => int_n(s.chars().count() as i64),
        List(l) => int_n(l.borrow().len() as i64),
        Tuple(t) => int_n(t.len() as i64),
        Map(m) => int_n(m.borrow().len() as i64),
        _ => type_err(format!("object of type '{}' has no len()", type_name(v))),
    }
}

/// Iterate a value the way Python's for loop does.
pub fn py_iter(v: Value) -> Vec<Value> {
    match &v {
        List(l) => l.borrow().clone(),
        Tuple(t) => t.as_ref().clone(),
        Text(s) => s.chars().map(|c| string(c.to_string())).collect(),
        Map(m) => m.borrow().keys(),
        _ => type_err(format!("'{}' object is not iterable", type_name(&v))),
    }
}
pub fn py_list(v: Value) -> Value { list(py_iter(v)) }

pub fn add(a: Value, b: Value) -> Value {
    if let Money(x) = &a { return Money(Dec::add(x, &money_other(&b, "add"))); }
    if let Money(y) = &b { return Money(Dec::add(y, &money_other(&a, "add"))); }
    if is_int_like(&a) && is_int_like(&b) { return Int(as_big(&a).add(&as_big(&b))); }
    if is_num_like(&a) && is_num_like(&b) { return Dec(Dec::add(&dec_of(&a), &dec_of(&b))); }
    match (&a, &b) {
        (Text(x), Text(y)) => return string(format!("{}{}", x, y)),
        (Text(_), _) => type_err(format!("can only concatenate str (not \"{}\") to str", type_name(&b))),
        (List(x), List(y)) => { let mut v = x.borrow().clone(); v.extend(y.borrow().iter().cloned()); return list(v); }
        (List(_), _) => type_err(format!("can only concatenate list (not \"{}\") to list", type_name(&b))),
        (Tuple(x), Tuple(y)) => { let mut v = x.as_ref().clone(); v.extend(y.iter().cloned()); return tuple(v); }
        (Tuple(_), _) => type_err(format!("can only concatenate tuple (not \"{}\") to tuple", type_name(&b))),
        _ => type_err(format!("unsupported operand type(s) for +: '{}' and '{}'", type_name(&a), type_name(&b))),
    }
}

pub fn sub(a: Value, b: Value) -> Value {
    if let Money(x) = &a { return Money(Dec::sub(x, &money_other(&b, "subtract"))); }
    if let Money(y) = &b { return Money(Dec::sub(&money_other(&a, "subtract"), y)); }
    if is_int_like(&a) && is_int_like(&b) { return Int(as_big(&a).sub(&as_big(&b))); }
    if is_num_like(&a) && is_num_like(&b) { return Dec(Dec::sub(&dec_of(&a), &dec_of(&b))); }
    type_err(format!("unsupported operand type(s) for -: '{}' and '{}'", type_name(&a), type_name(&b)))
}

fn repeat(seq: &Value, n: &Value) -> Value {
    let k = as_big(n).to_i64().unwrap_or(0);
    match seq {
        Text(s) => string(if k > 0 { s.repeat(k as usize) } else { String::new() }),
        List(l) => { let items = l.borrow(); let mut out = Vec::new(); for _ in 0..k.max(0) { out.extend(items.iter().cloned()); } list(out) }
        _ => Nothing,
    }
}

pub fn mul(a: Value, b: Value) -> Value {
    if let Money(x) = &a { if matches!(b, Money(_)) { kind_mismatch("Money can't be multiplied by money.".into()) } return Money(Dec::mul(x, &to_dec(&b))); }
    if let Money(y) = &b { return Money(Dec::mul(y, &to_dec(&a))); }
    if is_int_like(&a) && is_int_like(&b) { return Int(as_big(&a).mul(&as_big(&b))); }
    if is_num_like(&a) && is_num_like(&b) { return Dec(Dec::mul(&dec_of(&a), &dec_of(&b))); }
    let seq = |x: &Value| matches!(x, Text(_) | List(_));
    if seq(&a) { if is_int_like(&b) { return repeat(&a, &b); } type_err(format!("can't multiply sequence by non-int of type '{}'", type_name(&b))) }
    if seq(&b) { if is_int_like(&a) { return repeat(&b, &a); } type_err(format!("can't multiply sequence by non-int of type '{}'", type_name(&a))) }
    type_err(format!("unsupported operand type(s) for *: '{}' and '{}'", type_name(&a), type_name(&b)))
}

pub fn neg(a: Value) -> Value {
    match &a {
        Money(x) => Money(x.neg()),
        Int(_) | Bool(_) => Int(as_big(&a).negate()),
        Dec(d) => Dec(d.neg()),
        _ => type_err(format!("bad operand type for unary -: '{}'", type_name(&a))),
    }
}

/// Python's % on two whole numbers: the sign of the divisor.
pub fn int_mod(a: Value, b: Value) -> Value {
    if !is_int_like(&a) || !is_int_like(&b) {
        if is_num_like(&a) && is_num_like(&b) { return modulo(a, b); }
        type_err(format!("unsupported operand type(s) for %: '{}' and '{}'", type_name(&a), type_name(&b)))
    }
    let (x, y) = (as_big(&a), as_big(&b));
    if y.is_zero() { raise(py_err("ZeroDivisionError", "integer modulo by zero".into())) }
    let mut r = x.divrem(&y).1;
    if !r.is_zero() && r.is_neg() != y.is_neg() { r = r.add(&y); }
    Int(r)
}

/// divide(a, b) in thunder_runtime.py: always exact.
pub fn divide(a: Value, b: Value) -> Value {
    if let Money(x) = &a {
        if let Money(y) = &b { if y.is_zero() { divided_by_zero() } return Dec(Dec::div(x, y)); }
        let d = to_dec(&b);
        if d.is_zero() { divided_by_zero() }
        return Money(Dec::div(x, &d));
    }
    if matches!(b, Money(_)) { kind_mismatch("A plain number can't be divided by money.".into()) }
    let (x, y) = (to_dec(&a), to_dec(&b));
    if y.is_zero() { divided_by_zero() }
    Dec(Dec::div(&x, &y))
}

/// modulo(a, b) in thunder_runtime.py.
pub fn modulo(a: Value, b: Value) -> Value {
    let money = matches!(a, Money(_));
    let x = if let Money(m) = &a { m.clone() } else { to_dec(&a) };
    let y = if let Money(m) = &b { m.clone() } else { to_dec(&b) };
    if y.is_zero() { divided_by_zero() }
    let mut r = Dec::rem(&x, &y);
    if !r.is_zero() && r.s != (y.s && !y.is_zero()) { r = Dec::add(&r, &y); }
    if money { return Money(r); }
    if is_int(&a) && is_int(&b) { Int(r.to_bigint()) } else { Dec(r) }
}

/// round_to(x, places).
pub fn round_to(x: Value, places: Value) -> Value {
    let p = match &places { Dec(d) => d.to_bigint().to_i64().unwrap_or(0), _ => as_big(&places).to_i64().unwrap_or(0) };
    if let Money(m) = &x { return Money(m.quantize_half_up(-p)); }
    if is_int(&x) { return x; }
    let d = to_dec(&x).quantize_half_up(-p);
    if p == 0 { Int(d.to_bigint()) } else { Dec(d) }
}

fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Nothing, Nothing) | (NotGiven, NotGiven) => true,
        (Bool(x), Bool(y)) => x == y,
        (Int(x), Int(y)) => x == y,
        (Text(x), Text(y)) => x == y,
        (List(x), List(y)) => Rc::ptr_eq(x, y),
        (Map(x), Map(y)) => Rc::ptr_eq(x, y),
        (Record(x), Record(y)) => Rc::ptr_eq(x, y),
        _ => false,
    }
}

/// Python ==.
pub fn eq_v(a: &Value, b: &Value) -> bool {
    if same(a, b) { return true; }
    if matches!(a, Money(_)) || matches!(b, Money(_)) {
        let (m, o) = if let Money(m) = a { (m, b) } else if let Money(m) = b { (m, a) } else { unreachable!() };
        if matches!(o, Nothing | Text(_) | Bool(_)) { return false; }
        return Dec::cmp(m, &money_other(o, "compare")) == Ordering::Equal;
    }
    if matches!(a, Nothing) || matches!(b, Nothing) { return false; }
    if is_num_like(a) && is_num_like(b) { return num_cmp(a, b) == Ordering::Equal; }
    if matches!(a, Text(_)) || matches!(b, Text(_)) { return false; }
    match (a, b) {
        (List(x), List(y)) => { let (x, y) = (x.borrow(), y.borrow()); x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| same(p, q) || eq_v(p, q)) }
        (Tuple(x), Tuple(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| eq_v(p, q)),
        (Map(x), Map(y)) => { let (x, y) = (x.borrow(), y.borrow()); x.len() == y.len() && x.pairs().iter().all(|(k, v)| y.has(k) && eq_v(v, &y.get(k).unwrap())) }
        (Record(x), Record(y)) => { let (x, y) = (x.borrow(), y.borrow()); Rc::ptr_eq(&x.kind, &y.kind) && x.kind.fields.iter().all(|(f, _)| eq_v(&x.get(f).unwrap_or(Nothing), &y.get(f).unwrap_or(Nothing))) }
        (Date(a1, b1, c1), Date(a2, b2, c2)) => a1 == a2 && b1 == b2 && c1 == c2,
        _ => false,
    }
}
pub fn eq(a: Value, b: Value) -> Value { Bool(eq_v(&a, &b)) }

fn flip(op: &str) -> &str { match op { "<" => ">", ">" => "<", "<=" => ">=", ">=" => "<=", o => o } }
fn holds(op: &str, c: Ordering) -> bool { match op { "<" => c == Ordering::Less, ">" => c == Ordering::Greater, "<=" => c != Ordering::Greater, _ => c != Ordering::Less } }

/// Python <, >, <=, >= (and == / != through eq).
pub fn compare_v(op: &str, a: &Value, b: &Value) -> bool {
    if op == "==" { return eq_v(a, b); }
    if op == "!=" { return !eq_v(a, b); }
    if matches!(a, Money(_)) || matches!(b, Money(_)) {
        let (m, o, o2) = if let Money(m) = a { (m, b, op) } else if let Money(m) = b { (m, a, flip(op)) } else { unreachable!() };
        if matches!(o, Nothing) { type_err(format!("'{}' not supported between instances of 'decimal.Decimal' and 'NoneType'", o2)) }
        return holds(o2, Dec::cmp(m, &money_other(o, "compare")));
    }
    match order(a, b) {
        Some(c) => holds(op, c),
        None => type_err(format!("'{}' not supported between instances of '{}' and '{}'", op, type_name(a), type_name(b))),
    }
}
pub fn compare(op: &str, a: Value, b: Value) -> Value { Bool(compare_v(op, &a, &b)) }

/// The order of two values, or None when Python cannot order them.
fn order(a: &Value, b: &Value) -> Option<Ordering> {
    if is_num_like(a) && is_num_like(b) { return Some(num_cmp(a, b)); }
    if let (Text(x), Text(y)) = (a, b) { return Some(x.as_str().cmp(y.as_str())); }
    if let (Date(..), Date(..)) = (a, b) { return Some(date_num(a).cmp(&date_num(b))); }
    let seq = |v: &Value| -> Option<Vec<Value>> { match v { List(l) => Some(l.borrow().clone()), Tuple(t) => Some(t.as_ref().clone()), _ => None } };
    if let (Some(x), Some(y)) = (seq(a), seq(b)) {
        if matches!(a, List(_)) == matches!(b, List(_)) {
            for i in 0..x.len().min(y.len()) {
                if eq_v(&x[i], &y[i]) { continue; }
                return Some(if compare_v("<", &x[i], &y[i]) { Ordering::Less } else { Ordering::Greater });
            }
            return Some(x.len().cmp(&y.len()));
        }
    }
    None
}
fn date_num(v: &Value) -> i64 { if let Date(y, m, d) = v { y * 10000 + m * 100 + d } else { 0 } }

/// Python's `item in container`.
pub fn contains_v(container: &Value, item: &Value) -> bool {
    match container {
        Text(s) => { if let Text(t) = item { s.contains(t.as_str()) } else { type_err(format!("'in <string>' requires string as left operand, not {}", type_name(item))) } }
        Map(m) => m.borrow().has(item),
        List(l) => l.borrow().iter().any(|x| same(x, item) || eq_v(x, item)),
        Tuple(t) => t.iter().any(|x| eq_v(x, item)),
        _ => type_err(format!("argument of type '{}' is not iterable", type_name(container))),
    }
}
/// `item in container`, with the item worked out first (as Python does).
pub fn is_in(item: Value, container: Value) -> Value { Bool(contains_v(&container, &item)) }

/// Python's list.sort / sorted: stable, using < only.
pub fn py_sort_with(items: Vec<Value>, key: Option<&dyn Fn(Value) -> Value>, reverse: bool) -> Vec<Value> {
    let mut keyed: Vec<(Value, Value, usize)> = items.into_iter().enumerate().map(|(i, v)| { let k = match key { Some(f) => f(v.clone()), None => v.clone() }; (v, k, i) }).collect();
    // A merge sort that calls compare (which can fail) the way JavaScript's stable sort does with this comparator.
    let cmp = |x: &(Value, Value, usize), y: &(Value, Value, usize)| -> Ordering {
        let (l, r) = if reverse { (&y.1, &x.1) } else { (&x.1, &y.1) };
        if compare_v("<", l, r) { return Ordering::Less; }
        let (l2, r2) = if reverse { (&x.1, &y.1) } else { (&y.1, &x.1) };
        if compare_v("<", l2, r2) { return Ordering::Greater; }
        x.2.cmp(&y.2)
    };
    merge_sort(&mut keyed, &cmp);
    keyed.into_iter().map(|x| x.0).collect()
}
fn merge_sort<T: Clone>(v: &mut Vec<T>, cmp: &dyn Fn(&T, &T) -> Ordering) {
    let n = v.len();
    if n < 2 { return; }
    // Short lists, as TimSort (Python's and V8's) sorts them, comparing in the same order so that a comparison that
    // fails (mixed kinds) fails the same way: count the first run, then binary insertion for the rest.
    if n <= 64 {
        let mut run = 2;
        let descending = cmp(&v[1], &v[0]) == Ordering::Less;
        while run < n {
            let o = cmp(&v[run], &v[run - 1]);
            if descending { if o != Ordering::Less { break; } } else if o == Ordering::Less { break; }
            run += 1;
        }
        if descending { v[..run].reverse(); }
        for start in run..n {
            let pivot = v[start].clone();
            let (mut left, mut right) = (0, start);
            while left < right {
                let mid = left + ((right - left) >> 1);
                if cmp(&pivot, &v[mid]) == Ordering::Less { right = mid; } else { left = mid + 1; }
            }
            let mut k = start;
            while k > left { v[k] = v[k - 1].clone(); k -= 1; }
            v[left] = pivot;
        }
        return;
    }
    let mid = n / 2;
    let mut a = v[..mid].to_vec();
    let mut b = v[mid..].to_vec();
    merge_sort(&mut a, cmp);
    merge_sort(&mut b, cmp);
    let (mut i, mut j, mut k) = (0, 0, 0);
    while i < a.len() && j < b.len() { if cmp(&b[j], &a[i]) == Ordering::Less { v[k] = b[j].clone(); j += 1; } else { v[k] = a[i].clone(); i += 1; } k += 1; }
    while i < a.len() { v[k] = a[i].clone(); i += 1; k += 1; }
    while j < b.len() { v[k] = b[j].clone(); j += 1; k += 1; }
}
pub fn py_sort(items: Value, key: Option<Box<dyn Fn(Value) -> Value>>, reverse: bool) -> Value {
    list(py_sort_with(py_iter(items), key.as_deref(), reverse))
}

// ── Attribute-style Python calls the generated code makes on values ────────────────────────────────────────────

fn attr_err(v: &Value, name: &str) -> TErr { py_err("AttributeError", format!("'{}' object has no attribute '{}'", type_name(v), name)) }
fn str_method(v: &Value, name: &str) -> String { if let Text(s) = v { s.to_string() } else { raise(attr_err(v, name)) } }

fn is_split_line(c: char) -> bool { matches!(c, '\n' | '\r' | '\u{0b}' | '\u{0c}' | '\u{1c}' | '\u{1d}' | '\u{1e}' | '\u{85}' | '\u{2028}' | '\u{2029}') }
fn split_lines(s: &str) -> Vec<Value> {
    let chars: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if is_split_line(c) {
            out.push(string(std::mem::take(&mut cur)));
            if c == '\r' && i + 1 < chars.len() && chars[i + 1] == '\n' { i += 1; }
        } else { cur.push(c); }
        i += 1;
    }
    if !cur.is_empty() { out.push(string(cur)); }
    out
}
/// JavaScript's \s, plus the separators Python's str.split/strip also treat as space.
fn is_py_space(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{0b}' | '\u{0c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}' | '\u{1c}'..='\u{1f}' | '\u{85}')
}
fn py_split(s: &str) -> Vec<String> { s.split(is_py_space).filter(|x| !x.is_empty()).map(|x| x.to_string()).collect() }
fn py_strip(s: &str) -> String { s.trim_matches(is_py_space).to_string() }

// ── JSON, the way Python's json module reads and writes it ─────────────────────────────────────────────────────

struct JsonErr { msg: String, pos: usize }

fn json_parse(text: &str) -> Value {
    let s: Vec<char> = text.chars().collect();
    // Positions in the message are in UTF-16 units, as JavaScript counts them.
    fn ws(s: &[char], mut i: usize) -> usize { while i < s.len() && matches!(s[i], ' ' | '\t' | '\n' | '\r') { i += 1; } i }
    fn st(s: &[char], begin: usize) -> Result<(String, usize), JsonErr> {
        let mut i = begin + 1;
        let mut out = String::new();
        loop {
            if i >= s.len() { return Err(JsonErr { msg: "Unterminated string starting at".into(), pos: begin }); }
            let ch = s[i];
            if ch == '"' { return Ok((out, i + 1)); }
            if (ch as u32) < 0x20 { return Err(JsonErr { msg: "Invalid control character at".into(), pos: i }); }
            if ch != '\\' { out.push(ch); i += 1; continue; }
            if i + 1 >= s.len() { return Err(JsonErr { msg: "Unterminated string starting at".into(), pos: begin }); }
            let esc = s[i + 1];
            let simple = match esc { '"' => Some('"'), '\\' => Some('\\'), '/' => Some('/'), 'b' => Some('\u{8}'), 'f' => Some('\u{c}'), 'n' => Some('\n'), 'r' => Some('\r'), 't' => Some('\t'), _ => None };
            if let Some(c) = simple { out.push(c); i += 2; continue; }
            if esc != 'u' { return Err(JsonErr { msg: "Invalid \\escape".into(), pos: i }); }
            let hex: String = s[(i + 2).min(s.len())..(i + 6).min(s.len())].iter().collect();
            if hex.len() != 4 || !hex.chars().all(|c| c.is_ascii_hexdigit()) { return Err(JsonErr { msg: "Invalid \\uXXXX escape".into(), pos: i + 1 }); }
            let mut cp = u32::from_str_radix(&hex, 16).unwrap();
            i += 6;
            if (0xd800..=0xdbff).contains(&cp) && i + 1 < s.len() && s[i] == '\\' && s[i + 1] == 'u' {
                let lo_hex: String = s[(i + 2).min(s.len())..(i + 6).min(s.len())].iter().collect();
                if lo_hex.len() == 4 && lo_hex.chars().all(|c| c.is_ascii_hexdigit()) {
                    let lo = u32::from_str_radix(&lo_hex, 16).unwrap();
                    if (0xdc00..=0xdfff).contains(&lo) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); i += 6; }
                }
            }
            out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
        }
    }
    fn num(s: &[char], i: usize) -> Option<(String, bool, usize)> {
        let mut j = i;
        if j < s.len() && s[j] == '-' { j += 1; }
        if j >= s.len() || !s[j].is_ascii_digit() { return None; }
        if s[j] == '0' { j += 1; } else { while j < s.len() && s[j].is_ascii_digit() { j += 1; } }
        let mut frac = false;
        if j + 1 < s.len() && s[j] == '.' && s[j + 1].is_ascii_digit() { frac = true; j += 1; while j < s.len() && s[j].is_ascii_digit() { j += 1; } }
        if j < s.len() && (s[j] == 'e' || s[j] == 'E') {
            let mut k = j + 1;
            if k < s.len() && (s[k] == '+' || s[k] == '-') { k += 1; }
            if k < s.len() && s[k].is_ascii_digit() { while k < s.len() && s[k].is_ascii_digit() { k += 1; } frac = true; j = k; }
        }
        Some((s[i..j].iter().collect(), frac, j))
    }
    fn starts(s: &[char], i: usize, w: &str) -> bool { let w: Vec<char> = w.chars().collect(); i + w.len() <= s.len() && s[i..i + w.len()] == w[..] }
    fn value(s: &[char], i: usize) -> Result<(Value, usize), JsonErr> {
        if i >= s.len() { return Err(JsonErr { msg: "Expecting value".into(), pos: i }); }
        let ch = s[i];
        if ch == '"' { let (t, j) = st(s, i)?; return Ok((string(t), j)); }
        if ch == '{' { return obj(s, i + 1); }
        if ch == '[' { return arr(s, i + 1); }
        if starts(s, i, "null") { return Ok((Nothing, i + 4)); }
        if starts(s, i, "true") { return Ok((Bool(true), i + 4)); }
        if starts(s, i, "false") { return Ok((Bool(false), i + 5)); }
        if let Some((t, frac, j)) = num(s, i) { return Ok((if frac { Dec(Dec::parse(&t).unwrap()) } else { Int(BigInt::parse(&t).unwrap()) }, j)); }
        Err(JsonErr { msg: "Expecting value".into(), pos: i })
    }
    fn obj(s: &[char], i: usize) -> Result<(Value, usize), JsonErr> {
        let mut d = PyDict::new();
        let mut i = ws(s, i);
        if i < s.len() && s[i] == '}' { return Ok((Map(Rc::new(RefCell::new(d))), i + 1)); }
        loop {
            if i >= s.len() || s[i] != '"' { return Err(JsonErr { msg: "Expecting property name enclosed in double quotes".into(), pos: i }); }
            let (k, j) = st(s, i)?;
            i = ws(s, j);
            if i >= s.len() || s[i] != ':' { return Err(JsonErr { msg: "Expecting ':' delimiter".into(), pos: i }); }
            i = ws(s, i + 1);
            let (v, j) = value(s, i)?;
            d.set(string(k), v);
            i = ws(s, j);
            if i < s.len() && s[i] == '}' { return Ok((Map(Rc::new(RefCell::new(d))), i + 1)); }
            if i >= s.len() || s[i] != ',' { return Err(JsonErr { msg: "Expecting ',' delimiter".into(), pos: i }); }
            let comma = i;
            i = ws(s, i + 1);
            if i < s.len() && s[i] == '}' { return Err(JsonErr { msg: "Illegal trailing comma before end of object".into(), pos: comma }); }
        }
    }
    fn arr(s: &[char], i: usize) -> Result<(Value, usize), JsonErr> {
        let mut out = Vec::new();
        let mut i = ws(s, i);
        if i < s.len() && s[i] == ']' { return Ok((list(out), i + 1)); }
        loop {
            let (v, j) = value(s, i)?;
            out.push(v);
            i = ws(s, j);
            if i < s.len() && s[i] == ']' { return Ok((list(out), i + 1)); }
            if i >= s.len() || s[i] != ',' { return Err(JsonErr { msg: "Expecting ',' delimiter".into(), pos: i }); }
            let comma = i;
            i = ws(s, i + 1);
            if i < s.len() && s[i] == ']' { return Err(JsonErr { msg: "Illegal trailing comma before end of array".into(), pos: comma }); }
        }
    }
    let result = (|| { let (v, end) = value(&s, ws(&s, 0))?; let end = ws(&s, end); if end != s.len() { return Err(JsonErr { msg: "Extra data".into(), pos: end }); } Ok(v) })();
    match result {
        Ok(v) => v,
        Err(e) => {
            let before = &s[..e.pos.min(s.len())];
            let line = before.iter().filter(|c| **c == '\n').count() + 1;
            let last_nl = before.iter().rposition(|c| *c == '\n');
            let u16len = |cs: &[char]| cs.iter().map(|c| c.len_utf16()).sum::<usize>();
            let col = match last_nl { Some(p) => u16len(&before[p + 1..]) + 1, None => u16len(before) + 1 };
            conversion_failed(format!("This is not JSON: {} (line {}, column {}).", e.msg, line, col))
        }
    }
}

fn json_ready(v: &Value) -> Value {
    match v {
        Nothing | Bool(_) | Text(_) | Int(_) | Dec(_) => v.clone(),
        Money(_) => kind_mismatch("Money has no JSON form of its own: use its amount, for example price's amount.".into()),
        List(l) => list(l.borrow().iter().map(json_ready).collect()),
        Tuple(t) => list(t.iter().map(json_ready).collect()),
        Map(m) => {
            let mut out = PyDict::new();
            for (k, x) in m.borrow().pairs() { if !matches!(k, Text(_)) { kind_mismatch(format!("A JSON object's keys are text, but one is {}.", describe(&k))) } out.set(k, json_ready(&x)); }
            Map(Rc::new(RefCell::new(out)))
        }
        Record(r) => { let r = r.borrow(); let mut out = PyDict::new(); for (f, _) in &r.kind.fields { out.set(text(f), json_ready(&r.get(f).unwrap_or(Nothing))); } Map(Rc::new(RefCell::new(out))) }
        _ => kind_mismatch(format!("{} has no JSON form.", describe(v))),
    }
}

fn json_str(s: &str) -> String {
    let mut out = String::from("\"");
    for ch in s.chars() {
        let cp = ch as u32;
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            _ if (0x20..=0x7e).contains(&cp) => out.push(ch),
            _ if cp > 0xffff => { let v = cp - 0x10000; let _ = write!(out, "\\u{:x}\\u{:x}", 0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)); }
            _ => { let _ = write!(out, "\\u{:04x}", cp); }
        }
    }
    out.push('"');
    out
}

fn json_text(v: &Value) -> String {
    fn w(x: &Value) -> String {
        match x {
            Nothing => "null".into(),
            Bool(true) => "true".into(),
            Bool(false) => "false".into(),
            Int(n) => n.to_string(),
            Dec(d) => { let t = d.to_sci(); if d.is_integral() && t.contains('E') { d.to_fixed(None, false) } else { t } }
            Text(s) => json_str(s),
            List(l) => format!("[{}]", l.borrow().iter().map(w).collect::<Vec<_>>().join(", ")),
            Map(m) => format!("{{{}}}", m.borrow().pairs().iter().map(|(k, y)| format!("{}: {}", json_str(&py_str_s(k)), w(y))).collect::<Vec<_>>().join(", ")),
            _ => String::new(),
        }
    }
    w(&json_ready(v))
}

// ── Frames: which Thunder line is running, for errors ──────────────────────────────────────────────────────────

pub const MAX_FRAMES: usize = 997; // as deep as the generated Python goes (recursion limit 1000, less its own frames)

thread_local! {
    static FRAMES: RefCell<Vec<(&'static str, i64)>> = RefCell::new(Vec::new());
    static OUT: RefCell<Vec<u8>> = RefCell::new(Vec::new());
    static ABORTED: RefCell<bool> = RefCell::new(false);
    static EXIT: RefCell<i32> = RefCell::new(0);
}

fn snapshot() -> Vec<(String, i64)> { FRAMES.with(|f| f.borrow().iter().map(|(file, line)| (file.to_string(), *line)).collect()) }
fn depth() -> usize { FRAMES.with(|f| f.borrow().len()) }
/// The line now running in the innermost frame.
pub fn set_line(line: i64) { FRAMES.with(|f| { if let Some(top) = f.borrow_mut().last_mut() { top.1 = line; } }) }
fn top_frame() -> (&'static str, i64) { FRAMES.with(|f| *f.borrow().last().unwrap_or(&("", 0))) }

/// Run `body`, catching a Thunder error (any other panic is a bug in the runtime, reported as one).
pub fn catch<R>(body: impl FnOnce() -> R) -> Result<R, TErr> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(body)) {
        Ok(v) => Ok(v),
        Err(payload) => Err(match payload.downcast::<TErr>() {
            Ok(e) => *e,
            Err(other) => {
                let msg = other.downcast_ref::<String>().cloned().or_else(|| other.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_else(|| "the Rust runtime stopped".into());
                py_err("RuntimeError", msg)
            }
        }),
    }
}

/// An error on its way out of a frame: remember where it happened (the innermost frames first seen).
fn fail(mut e: TErr) -> TErr { if e.at.is_none() { e.at = Some(snapshot()); } e }

fn in_frame<R>(file: &'static str, line: i64, body: impl FnOnce() -> R) -> R {
    FRAMES.with(|f| f.borrow_mut().push((file, line)));
    let r = catch(body);
    match r {
        Ok(v) => { FRAMES.with(|f| { f.borrow_mut().pop(); }); v }
        Err(e) => { let e = fail(e); FRAMES.with(|f| { f.borrow_mut().pop(); }); raise(e) }
    }
}

/// A frame for a program, a test, or a kept value (as the engine's withFrame).
pub fn frame<R>(file: &'static str, line: i64, body: impl FnOnce() -> R) -> R {
    if depth() >= MAX_FRAMES { raise(py_err("RecursionError", "maximum recursion depth exceeded".into())) }
    in_frame(file, line, body)
}
/// A frame for a call; `first` is the Thunder line the function starts on (where Python stops when it is too deep).
pub fn call<R>(file: &'static str, line: i64, first: Option<i64>, body: impl FnOnce() -> R) -> R {
    if depth() >= MAX_FRAMES {
        let mut err = py_err("RecursionError", "maximum recursion depth exceeded".into());
        if let Some(fl) = first { let mut w = snapshot(); w.push((file.to_string(), fl)); err.at = Some(w); }
        raise(err)
    }
    in_frame(file, line, body)
}
/// A key for sorting by a field: it runs in a frame at the sorting line, as the generated Python's lambda does.
pub fn key_at(get: fn(Value) -> Value) -> Box<dyn Fn(Value) -> Value> {
    let (file, line) = top_frame();
    Box::new(move |item: Value| frame(file, line, || get(item)))
}
pub fn key_with(get: Box<dyn Fn(Value) -> Value>) -> Box<dyn Fn(Value) -> Value> {
    let (file, line) = top_frame();
    Box::new(move |item: Value| frame(file, line, || get(item)))
}

pub fn say(t: Value) { let s = match &t { Text(x) => x.to_string(), _ => show_s(&t) }; OUT.with(|o| { let mut o = o.borrow_mut(); o.extend_from_slice(s.as_bytes()); o.push(b'\n'); }); }
fn flush() { OUT.with(|o| { let mut o = o.borrow_mut(); let mut out = std::io::stdout(); let _ = out.write_all(&o); let _ = out.flush(); o.clear(); }) }

// ── Records ────────────────────────────────────────────────────────────────────────────────────────────────────

/// obj.name for a record field (a Python attribute), or Money's amount.
pub fn get_attr(obj: Value, name: &str) -> Value {
    if let Record(r) = &obj { if let Some(v) = r.borrow().get(name) { return v; } }
    if let Money(a) = &obj { if name == "amount" { return Dec(a.clone()); } }
    raise(attr_err(&obj, name))
}
/// obj.name = value: the record's Never rules first, as its __setattr__ does.
pub fn set_attr(obj: Value, name: &str, value: Value) {
    match &obj {
        Record(r) => {
            let kind = r.borrow().kind.clone();
            if let Some((_, rules)) = kind.rules.iter().find(|(f, _)| *f == name) { for rule in rules { never((rule.cond)(value.clone()), rule.text, rule.line, value.clone()); } }
            let mut rec = r.borrow_mut();
            if let Some(slot) = rec.f.iter_mut().find(|(k, _)| *k == name) { slot.1 = value; } else {
                let field = kind.fields.iter().find(|(f, _)| *f == name).map(|(f, _)| *f).unwrap_or("?");
                rec.f.push((field, value));
            }
        }
        Money(_) => raise(py_err("AttributeError", "Money cannot be changed; make new money instead.".into())),
        _ => raise(attr_err(&obj, name)),
    }
}
fn field_names(key: &str) -> [String; 4] { [key.to_string(), key.replace(' ', "_"), key.to_lowercase(), key.to_lowercase().replace(' ', "_")] }
pub fn get_field(obj: Value, key: &str) -> Value {
    if matches!(obj, Nothing) { missing_value(format!("This value is nothing, so it has no {}.", key)) }
    let names = field_names(key);
    if let Map(m) = &obj {
        let m = m.borrow();
        for k in &names { let kv = text(k); if m.has(&kv) { return m.get(&kv).unwrap(); } }
        for (k, v) in m.pairs() { if py_strip(&py_str_s(&k)).to_lowercase() == key.to_lowercase() { return v; } }
        missing_value(format!("There is no field \"{}\". Fields here: {}.", key, m.keys().iter().map(py_str_s).collect::<Vec<_>>().join(", ")))
    }
    for k in &names {
        if let Record(r) = &obj { if let Some(v) = r.borrow().get(k) { return v; } }
        if let Money(a) = &obj { if k == "amount" { return Dec(a.clone()); } }
    }
    missing_value(format!("{} has no field \"{}\".", describe(&obj), key))
}
pub fn set_field(obj: Value, key: &str, value: Value) {
    if let Map(m) = &obj { m.borrow_mut().set(text(key), value); return; }
    for k in field_names(key) {
        if let Record(r) = &obj {
            let field = { let rb = r.borrow(); rb.kind.fields.iter().find(|(f, _)| *f == k).map(|(f, _)| *f) };
            if let Some(f) = field { if r.borrow().has(f) { set_attr(obj.clone(), f, value); return; } }
        }
    }
    missing_value(format!("{} has no field \"{}\".", describe(&obj), key))
}
/// A record: the fields it is given, the others defaulted; each set through its Never rules.
pub fn new_record(kind: Rc<Kind>, given: Vec<(&'static str, Value)>) -> Value {
    let rec = Rc::new(RefCell::new(Rec { kind: kind.clone(), f: Vec::new() }));
    let missing: Vec<&str> = kind.fields.iter().filter(|(f, k)| !given.iter().any(|(g, _)| g == f) && !["optional", "list", "map"].contains(k)).map(|(f, _)| *f).collect();
    if !missing.is_empty() {
        let names: Vec<String> = missing.iter().map(|f| format!("'{}'", f)).collect();
        type_err(format!("{}.__init__() missing {} required keyword-only argument{}: {}", kind.py, missing.len(), if missing.len() == 1 { "" } else { "s" }, names.join(if missing.len() == 2 { " and " } else { ", " })))
    }
    let obj = Record(rec);
    for (f, k) in &kind.fields {
        let v = match given.iter().find(|(g, _)| g == f) { Some((_, v)) => v.clone(), None => match *k { "optional" => Nothing, "list" => list(vec![]), _ => new_map() } };
        set_attr(obj.clone(), f, v);
    }
    obj
}

/// never(cond, text, rule, value): a broken Never rule stops the program.
pub fn never(cond: Value, text: &str, line: i64, value: Value) {
    if truthy(&cond) { rule_broken(format!("{} (the rule on line {}), but the value is {}.", text, line, show_s(&value))) }
}

// ── Helpers the generated code calls ───────────────────────────────────────────────────────────────────────────

pub fn range_int(v: Value) -> i64 {
    match &v {
        Int(n) => n.to_i64().unwrap_or(i64::MAX),
        Bool(b) => if *b { 1 } else { 0 },
        _ => type_err(format!("'{}' object cannot be interpreted as an integer", match v { Dec(_) => "decimal.Decimal", Nothing => "NoneType", Money(_) => "Money", Text(_) => "str", _ => "object" })),
    }
}
pub fn unpack2(el: Value) -> (Value, Value) {
    let items: Option<Vec<Value>> = match &el { List(l) => Some(l.borrow().clone()), Tuple(t) => Some(t.as_ref().clone()), Text(s) => Some(s.chars().map(|c| string(c.to_string())).collect()), Map(m) => Some(m.borrow().keys()), _ => None };
    let items = match items { Some(i) => i, None => type_err(format!("cannot unpack non-iterable {} object", match el { Nothing => "NoneType", Int(_) => "int", Dec(_) => "decimal.Decimal", Bool(_) => "bool", _ => "object" })) };
    if items.len() < 2 { raise(py_err("ValueError", format!("not enough values to unpack (expected 2, got {})", items.len()))) }
    if items.len() > 2 { raise(py_err("ValueError", format!("too many values to unpack (expected 2, got {})", items.len()))) }
    (items[0].clone(), items[1].clone())
}
pub fn map_items(m: Value) -> Vec<Value> { if let Map(d) = &m { d.borrow().pairs().into_iter().map(|(k, v)| tuple(vec![k, v])).collect() } else { raise(attr_err(&m, "items")) } }
pub fn pairs_of(c: Value) -> Vec<Value> { if matches!(c, Map(_)) { map_items(c) } else { py_iter(c) } }

fn seq_items(v: &Value) -> Option<Vec<Value>> { match v { List(l) => Some(l.borrow().clone()), Tuple(t) => Some(t.as_ref().clone()), _ => None } }
pub fn item_at(items: Value, position: Value, dflt: Option<Value>) -> Value {
    let pos = match &position { Int(n) => n.clone(), _ => kind_mismatch(format!("A position in a list is a whole number, not {}.", describe(&position))) };
    let l = match seq_items(&items) { Some(l) => l, None => type_err(format!("object of type '{}' has no len()", if matches!(items, Nothing) { "NoneType" } else { "object" })) };
    if pos.cmp(&big(1)) != Ordering::Less && pos.cmp(&big(l.len() as i64)) != Ordering::Greater { return l[pos.to_i64().unwrap() as usize - 1].clone(); }
    if let Some(d) = dflt { return d; }
    missing_value(format!("There is no item {}: the list has {} item{}.", pos.to_string(), l.len(), if l.len() == 1 { "" } else { "s" }))
}
pub fn set_item(items: Value, position: Value, value: Value) {
    item_at(items.clone(), position.clone(), None);
    if let (List(l), Int(n)) = (&items, &position) { l.borrow_mut()[n.to_i64().unwrap() as usize - 1] = value; }
}
pub fn map_set(m: Value, k: Value, v: Value) {
    match &m {
        Map(d) => d.borrow_mut().set(k, v),
        Nothing => type_err("'NoneType' object does not support item assignment".into()),
        List(_) => set_item(m, k, v),
        _ => type_err(format!("'{}' object does not support item assignment", if matches!(m, Money(_)) { "Money" } else { "object" })),
    }
}
pub fn set_entry(c: Value, k: Value, v: Value) {
    match &c {
        List(_) => set_item(c, k, v),
        Map(d) => d.borrow_mut().set(k, v),
        Nothing => missing_value(format!("This value is nothing, so it has no entry for {}.", show_s(&k))),
        _ => kind_mismatch(format!("{} has no entries that can be changed.", describe(&c))),
    }
}
pub fn entry(c: Value, k: Value, dflt: Option<Value>) -> Value {
    match &c {
        List(_) | Tuple(_) => item_at(c, k, dflt),
        Map(d) => { let d = d.borrow(); if d.has(&k) { return d.get(&k).unwrap(); } if let Some(x) = dflt { return x; } missing_value(format!("There is no entry for {}.", show_s(&k))) }
        Nothing => missing_value(format!("This value is nothing, so it has no entry for {}.", show_s(&k))),
        _ => kind_mismatch(format!("{} has no entries.", describe(&c))),
    }
}
pub fn map_get(m: Value, k: Value, dflt: Option<Value>) -> Value {
    if let Map(d) = &m { let d = d.borrow(); if d.has(&k) { return d.get(&k).unwrap(); } if let Some(x) = dflt { return x; } let mut e = py_err("KeyError", py_str_s(&k)); e.arg = Some(show_s(&k)); raise(e) }
    if matches!(m, Nothing) { if dflt.is_some() { raise(attr_err(&m, "get")) } type_err("'NoneType' object is not subscriptable".into()) }
    if dflt.is_some() { raise(attr_err(&m, "get")) }
    if let (List(l), Int(n)) = (&m, &k) {
        let l = l.borrow();
        let len = l.len() as i64;
        if let Some(i) = n.to_i64() { if i >= -len && i < len { return l[(if i < 0 { len + i } else { i }) as usize].clone(); } }
        raise(py_err("IndexError", "list index out of range".into()))
    }
    if matches!(m, List(_)) { raise(py_err("IndexError", "list index out of range".into())) }
    type_err(format!("'{}' object is not subscriptable", if matches!(m, Money(_)) { "Money" } else { "object" }))
}

pub fn add_to(target: Value, value: Value) -> Value { if let List(l) = &target { l.borrow_mut().push(value); return target; } add(target, value) }
pub fn append_to(target: Value, value: Value) { if let List(l) = &target { l.borrow_mut().push(value); } else { raise(attr_err(&target, "append")) } }
pub fn remove_from(target: Value, value: Value) {
    if let Map(d) = &target { if !d.borrow().has(&value) { missing_value(format!("There is no entry for {} to remove.", show_s(&value))) } d.borrow_mut().delete(&value); return; }
    if !contains_v(&target, &value) { missing_value(format!("{} is not in the list, so it can't be removed.", show_s(&value))) }
    if let List(l) = &target {
        let idx = l.borrow().iter().position(|x| same(x, &value) || eq_v(x, &value));
        if let Some(i) = idx { l.borrow_mut().remove(i); }
    } else { raise(attr_err(&target, "remove")) }
}
pub fn sort_in_place(target: Value, key: Option<Box<dyn Fn(Value) -> Value>>, desc: bool) {
    if let List(l) = &target { let items = l.borrow().clone(); let sorted = py_sort_with(items, key.as_deref(), desc); *l.borrow_mut() = sorted; }
    else { raise(attr_err(&target, "sort")) }
}
pub fn reverse_in_place(target: Value) { if let List(l) = &target { l.borrow_mut().reverse(); } else { raise(attr_err(&target, "reverse")) } }

fn total_of(items: Vec<Value>) -> Value {
    if items.is_empty() { return int_n(0); }
    let mut it = items.into_iter();
    let mut result = it.next().unwrap();
    for x in it { result = add(result, x); }
    result
}
fn text_of(v: &Value, what: &str) -> String { if let Text(s) = v { s.to_string() } else { kind_mismatch(format!("{} needs text, but it is {}.", what, describe(v))) } }
const PUNCT: &str = ".,;:!?\"'()[]{}<>“”‘’…-";
fn strip_punct(w: &str) -> String { w.trim_matches(|c| PUNCT.contains(c)).to_string() }

/// The operations written as words: the sum of, the first of, the words of, …
pub fn apply_op(op: &str, a: Value) -> Value {
    match op {
        "sum" => total_of(py_iter(a)),
        "average" => { let items = py_iter(a); if items.is_empty() { missing_value("I can't take the average of an empty list.".into()) } let n = items.len() as i64; divide(total_of(items), int_n(n)) }
        "count" | "length" => py_len(&a),
        "min" => { let items = py_iter(a); if items.is_empty() { missing_value("An empty list has no smallest item.".into()) } let mut best = items[0].clone(); for x in items.into_iter().skip(1) { if compare_v("<", &x, &best) { best = x; } } best }
        "max" => { let items = py_iter(a); if items.is_empty() { missing_value("An empty list has no largest item.".into()) } let mut best = items[0].clone(); for x in items.into_iter().skip(1) { if compare_v(">", &x, &best) { best = x; } } best }
        "first" => { let items = py_iter(a); if items.is_empty() { missing_value("An empty list has no first item.".into()) } items[0].clone() }
        "last" => { let items = py_iter(a); if items.is_empty() { missing_value("An empty list has no last item.".into()) } items[items.len() - 1].clone() }
        "words" => list(py_split(&py_str_s(&a)).iter().map(|p| strip_punct(p)).filter(|p| !p.is_empty()).map(string).collect()),
        "lines" => list(split_lines(&str_method(&a, "splitlines"))),
        "lowercase" => string(str_method(&a, "lower").to_lowercase()),
        "uppercase" => string(str_method(&a, "upper").to_uppercase()),
        "trimmed" => string(py_strip(&str_method(&a, "strip"))),
        "parts" => list(py_split(&text_of(&a, "\"the parts of\"")).into_iter().map(string).collect()),
        "abs" => match &a {
            Money(m) => Money(m.abs()),
            Int(n) => Int(n.abs()),
            Dec(d) => Dec(d.abs()),
            _ => kind_mismatch(format!("\"the absolute value of\" needs a number or money, but it is {}.", describe(&a))),
        },
        "jsonText" => string(json_text(&a)),
        "jsonData" => json_parse(&text_of(&a, "\"the JSON data in\"")),
        "keys" => if let Map(d) = &a { list(d.borrow().keys()) } else { raise(attr_err(&a, "keys")) },
        "values" => if let Map(d) = &a { list(d.borrow().values()) } else { raise(attr_err(&a, "values")) },
        _ => raise(py_err("NameError", format!("name '{}' is not defined", op))),
    }
}

/// "starts with" / "ends with": both sides must be text.
pub fn affix(t: Value, a: Value, end: bool) -> Value {
    let what = if end { "\"ends with\"" } else { "\"starts with\"" };
    let (x, y) = (text_of(&t, what), text_of(&a, what));
    Bool(if end { x.ends_with(&y) } else { x.starts_with(&y) })
}
/// a <= v <= hi, the way Python chains it: hi is worked out only when the first part holds.
pub fn between(lo: Value, v: Value, hi: impl FnOnce() -> Value) -> Value {
    if !compare_v("<=", &lo, &v) { return Bool(false); }
    let h = hi();
    Bool(compare_v("<=", &v, &h))
}

pub fn joined(items: Value, sep: Value) -> Value {
    let sep = text_of(&sep, "\"joined with\"");
    let mut out = Vec::new();
    for (i, x) in py_iter(items).into_iter().enumerate() {
        if let Text(s) = &x { out.push(s.to_string()); } else { kind_mismatch(format!("\"joined with\" joins text, but item {} is {}. Turn it into text first.", i + 1, describe(&x))) }
    }
    string(out.join(&sep))
}
pub fn split_at(t: Value, sep: Value) -> Value {
    let sep = text_of(&sep, "\"split at\"");
    if sep.is_empty() { kind_mismatch("\"split at\" needs something to split at, not empty text.".into()) }
    list(text_of(&t, "\"split at\"").split(sep.as_str()).map(|p| string(p.to_string())).collect())
}
pub fn replacing(t: Value, old: Value, nw: Value) -> Value {
    let old = text_of(&old, "\"replacing\"");
    if old.is_empty() { kind_mismatch("\"replacing\" needs something to replace, not empty text.".into()) }
    let x = text_of(&t, "\"replacing\"");
    let parts: Vec<&str> = x.split(old.as_str()).collect();
    string(parts.join(&text_of(&nw, "\"replacing … with\"")))
}

pub fn read_text(path: Value) -> Value {
    let p = match &path { Text(s) => s.to_string(), _ => type_err(format!("expected str, bytes or os.PathLike object, not {}", if matches!(path, Nothing) { "NoneType" } else { "object" })) };
    match std::fs::read(&p) {
        Ok(bytes) => string(String::from_utf8_lossy(&bytes).to_string()),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound { missing_value(format!("There is no file \"{}\" (looked in the folder the program runs in).", p)) }
            if std::path::Path::new(&p).is_dir() { raise(py_err("IsADirectoryError", format!("EISDIR: illegal operation on a directory, read"))) }
            raise(py_err("OSError", e.to_string()))
        }
    }
}

// ── Conversions ────────────────────────────────────────────────────────────────────────────────────────────────

fn number_text(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
    if i >= b.len() || !b[i].is_ascii_digit() { return false; }
    while i < b.len() && (b[i].is_ascii_digit() || b[i] == b'_') { i += 1; }
    if i < b.len() && b[i] == b'.' { i += 1; let d0 = i; while i < b.len() && b[i].is_ascii_digit() { i += 1; } if d0 == i { return false; } }
    i == b.len()
}
pub fn to_number(x: Value) -> Value {
    if is_number(&x) { return x; }
    if let Money(a) = &x { return Dec(a.clone()); }
    if let Text(t) = &x {
        let s = py_strip(t).replace(',', "");
        if number_text(&s) { return if s.contains('.') { Dec(Dec::parse(&s).unwrap()) } else { Int(BigInt::parse(&s.replace('_', "")).unwrap()) }; }
    }
    conversion_failed(format!("{} is not a number.", describe(&x)))
}
pub fn to_whole(x: Value) -> Value {
    let n = to_number(x);
    if is_int(&n) { return n; }
    if let Dec(d) = &n { if d.is_integral() { return Int(d.to_bigint()); } }
    conversion_failed(format!("{} is not a whole number.", show_s(&n)))
}
pub fn to_money(x: Value) -> Value {
    if matches!(x, Money(_)) { return x; }
    if let Text(t) = &x {
        let mut s = py_strip(t).replace(',', "");
        let negative = s.starts_with('-');
        s = s.trim_start_matches('-').trim_start_matches('$').to_string();
        if number_text(&s) { return money_of(&string(format!("{}{}", if negative { "-" } else { "" }, s))); }
        conversion_failed(format!("{} is not an amount of money.", describe(&x)))
    }
    Money(to_dec(&to_number(x)))
}
pub fn to_yes_no(x: Value) -> Value {
    if let Bool(_) = x { return x; }
    if let Text(t) = &x { let s = py_strip(t).to_lowercase(); if s == "yes" || s == "true" { return Bool(true); } if s == "no" || s == "false" { return Bool(false); } }
    conversion_failed(format!("{} is not yes or no.", describe(&x)))
}
pub fn to_date(x: Value) -> Value {
    if let Date(..) = x { return x; }
    if let Some(d) = parse_date(&py_strip(&py_str_s(&x))) { return d; }
    conversion_failed(format!("{} is not a date (write it as YYYY-MM-DD).", describe(&x)))
}

// ── Expect ─────────────────────────────────────────────────────────────────────────────────────────────────────

pub fn expect_true(v: Value, t: &str) { if !matches!(v, Bool(true)) { expectation_failed(format!("{}, but it was not true.", t)) } }
pub fn expect_failure(body: impl FnOnce(), t: &str, msg: Value) {
    match catch(body) {
        Ok(()) => expectation_failed(format!("{}, but it did not fail.", t)),
        Err(err) => {
            if err.thunder() && !matches!(msg, Nothing) {
                let m = match &msg { Text(s) => s.to_string(), _ => type_err(format!("'in <string>' requires string as left operand, not {}", if is_int(&msg) { "int" } else { "object" })) };
                if !err.message.contains(&m) { expectation_failed(format!("{}, but it failed with \"{}\".", t, err.message)) }
            }
        }
    }
}
fn check(name: &str, a: &Value, b: &Value) -> bool {
    match name {
        "is" => eq_v(a, b),
        "is not" => !eq_v(a, b),
        "at least" => compare_v(">=", a, b),
        "at most" => compare_v("<=", a, b),
        "more than" => compare_v(">", a, b),
        "less than" => compare_v("<", a, b),
        "nothing" => matches!(a, Nothing),
        "not nothing" => !matches!(a, Nothing),
        "empty" => eq_v(&py_len(a), &int_n(0)),
        "positive" => compare_v(">", a, &int_n(0)),
        "negative" => compare_v("<", a, &int_n(0)),
        "zero" => eq_v(a, &int_n(0)),
        "between" => { let (lo, hi) = match b { List(l) => { let l = l.borrow(); (l[0].clone(), l[1].clone()) } _ => (Nothing, Nothing) }; compare_v("<=", &lo, a) && compare_v("<=", a, &hi) }
        "in" => contains_v(b, a),
        "contains" => contains_v(a, b),
        _ => false,
    }
}
fn known_check(name: &str) -> bool { matches!(name, "is" | "is not" | "at least" | "at most" | "more than" | "less than" | "nothing" | "not nothing" | "empty" | "positive" | "negative" | "zero" | "between" | "in" | "contains") }
pub fn expect_value(actual: Value, full: &str, op: &str, want: Value, t: &str) {
    let ok = if known_check(full) { check(full, &actual, &want) } else { !check(op, &actual, &want) };
    if !ok { expectation_failed(format!("{}, but it was {}.", t, show_s(&actual))) }
}

/// "If this fails": the error, in words.
pub fn explain(e: TErr) -> Value { string(explain_err(&e)) }

// ── Running the program or its tests ───────────────────────────────────────────────────────────────────────────

fn report(e: &TErr) {
    flush();
    eprintln!("{}", describe_error(e));
    EXIT.with(|x| *x.borrow_mut() = 1);
    ABORTED.with(|a| *a.borrow_mut() = true);
}
fn aborted() -> bool { ABORTED.with(|a| *a.borrow()) }

/// Work out a file's kept values; an error stops the program with a Thunder message.
pub fn init(file: &'static str, body: impl FnOnce()) {
    if aborted() { return; }
    if let Err(e) = catch(|| frame(file, 0, body)) { report(&e); }
}
pub fn run(main: impl FnOnce()) {
    if aborted() { return; }
    if let Err(e) = catch(main) { report(&e); }
}
/// Every Test block, the way run_tests.py runs them: one line per test, then the totals.
pub fn run_tests(modules: Vec<(&'static str, Vec<(&'static str, fn(), i64)>)>) {
    if aborted() { return; }
    let (mut passed, mut failed) = (0, 0);
    for (file, tests) in modules {
        for (title, f, line) in tests {
            match catch(f) {
                Ok(()) => { passed += 1; say(string(format!("PASS  {} ({}, line {})", title, file, line))); }
                Err(e) => { failed += 1; say(string(format!("FAIL  {} ({}, line {})", title, file, line))); say(string(format!("      {}", describe_error(&e)))); }
            }
        }
    }
    let total = passed + failed;
    say(string(format!("{} test{}: {} passed, {} failed", total, if total == 1 { "" } else { "s" }, passed, failed)));
    if failed > 0 { EXIT.with(|x| *x.borrow_mut() = 1); }
}

/// The program's entry: on a thread with a deep stack (Thunder allows calls nested about 1000 deep), with Rust's own
/// panic messages silenced (a Thunder error is reported in Thunder words instead). `body(tests)` runs the program
/// (tests = false) or its Test blocks (tests = true, from `--tests` on the command line).
pub fn start(body: fn(bool)) {
    std::panic::set_hook(Box::new(|_| {}));
    let tests = std::env::args().any(|a| a == "--tests");
    let handle = std::thread::Builder::new().stack_size(1 << 30).spawn(move || {
        body(tests);
        flush();
        EXIT.with(|x| *x.borrow())
    }).expect("start the Thunder thread");
    let code = handle.join().unwrap_or(70);
    std::process::exit(code);
}

/// A kind for records, made once per program run.
pub fn kind(py: &'static str, fields: Vec<(&'static str, &'static str)>, rules: Vec<(&'static str, Vec<Rule>)>) -> Rc<Kind> { Rc::new(Kind { py, fields, rules }) }

/// A kept value's slot: written once by init, read anywhere.
pub struct Kept(RefCell<Value>);
impl Kept {
    pub const fn new() -> Kept { Kept(RefCell::new(Value::Nothing)) }
    pub fn get(&self) -> Value { self.0.borrow().clone() }
    pub fn set(&self, v: Value) { *self.0.borrow_mut() = v; }
}
