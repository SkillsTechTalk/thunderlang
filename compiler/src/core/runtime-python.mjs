// thunder_runtime.py: written next to every generated Python program. It is plain Python (3.10+, standard
// library only), so the generated program runs without Thunder installed. Each function implements one rule
// from the "Semantics" section of docs/core.md; change both together.

export const RUNTIME_VERSION = '0.1.0';

export const PYTHON_RUNTIME = String.raw`"""Thunder runtime for generated Python (Thunder Core v0, runtime 0.1.0).

Written by the Thunder compiler next to the code it generates. Standard library only.
The rules implemented here are the Thunder semantics that must be the same in every target language:
exact decimals, money, division, rounding, positions that start at 1, "nothing", and errors that name
the Thunder line (read from the "# thunder:N" comments in the generated files).
"""
import json
import linecache
import re
import sys
import traceback
from contextlib import contextmanager
from dataclasses import fields, is_dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, DivisionByZero, InvalidOperation


class ThunderError(Exception):
    """An error with a plain-words message. code is the stable Thunder code (TC5xx)."""

    code = "TC500"


class Stop(ThunderError):
    code = "TC507"


class RuleBroken(ThunderError):
    code = "TC504"


class ExpectationFailed(ThunderError):
    code = "TC505"


class KindMismatch(ThunderError, TypeError):
    code = "TC506"


class ConversionFailed(ThunderError, ValueError):
    code = "TC509"


class MissingValue(ThunderError, LookupError):
    code = "TC503"


class DividedByZero(ThunderError, ZeroDivisionError):
    code = "TC501"


# ---------------------------------------------------------------- numbers and money

def _is_number(x):
    return isinstance(x, (int, Decimal)) and not isinstance(x, bool)


class _NotGiven:
    def __repr__(self):
        return "not given"


NOT_GIVEN = _NotGiven()


def num(x):
    """A Python float that reaches Thunder becomes the exact decimal it is written as (19.99, never
    19.989999999999998). Everything else is left as it is, so text, lists and records pass through."""
    if isinstance(x, float) and not isinstance(x, bool):
        return Decimal(repr(x))
    return x


def _decimal(x):
    if isinstance(x, Decimal):
        return x
    if isinstance(x, bool):
        raise KindMismatch("A yes/no value was used where a number was needed.")
    if isinstance(x, int):
        return Decimal(x)
    if isinstance(x, float):
        return Decimal(repr(x))
    if x is None:
        raise KindMismatch("A value was nothing where a number was needed.")
    raise KindMismatch("%s was used where a number was needed." % _describe(x))


class Money:
    """An exact amount of money. Money adds to money; it multiplies and divides by plain numbers."""

    __slots__ = ("amount",)

    def __init__(self, amount):
        if isinstance(amount, Money):
            amount = amount.amount
        elif isinstance(amount, str):
            amount = Decimal(amount.replace(",", "").replace("$", "").strip())
        else:
            amount = _decimal(amount)
        object.__setattr__(self, "amount", amount)

    def __setattr__(self, name, value):
        raise AttributeError("Money cannot be changed; make new money instead.")

    def _other(self, other, verb):
        if isinstance(other, Money):
            return other.amount
        if other == 0 and _is_number(other):
            return Decimal(0)
        raise KindMismatch("I can't %s money and %s. Write the number as money, for example $5." % (verb, _describe(other)))

    def __add__(self, other):
        return Money(self.amount + self._other(other, "add"))

    __radd__ = __add__

    def __sub__(self, other):
        return Money(self.amount - self._other(other, "subtract"))

    def __rsub__(self, other):
        return Money(self._other(other, "subtract") - self.amount)

    def __mul__(self, other):
        if isinstance(other, Money):
            raise KindMismatch("Money can't be multiplied by money.")
        return Money(self.amount * _decimal(other))

    __rmul__ = __mul__

    def __truediv__(self, other):
        return divide(self, other)

    def __neg__(self):
        return Money(-self.amount)

    def __abs__(self):
        return Money(abs(self.amount))

    def _cmp(self, other):
        if other is None:
            return None
        return self._other(other, "compare")

    def __eq__(self, other):
        if other is None or isinstance(other, (str, bool)):
            return False
        return self.amount == self._cmp(other)

    def __ne__(self, other):
        return not self.__eq__(other)

    def __lt__(self, other):
        return self.amount < self._cmp(other)

    def __le__(self, other):
        return self.amount <= self._cmp(other)

    def __gt__(self, other):
        return self.amount > self._cmp(other)

    def __ge__(self, other):
        return self.amount >= self._cmp(other)

    def __hash__(self):
        return hash(("Money", self.amount))

    def __str__(self):
        a = self.amount
        places = max(2, -a.as_tuple().exponent) if a.as_tuple().exponent < 0 else 2
        text = format(abs(a), ",.%df" % places)
        return ("-$" if a < 0 else "$") + text

    def __repr__(self):
        return "Money(%r)" % format(self.amount, "f")


def divide(a, b):
    """Division always gives the exact answer as a decimal: 7 / 2 is 3.5, never 3."""
    if isinstance(a, Money):
        if isinstance(b, Money):
            if b.amount == 0:
                raise DividedByZero("You divided by zero.")
            return a.amount / b.amount
        d = _decimal(b)
        if d == 0:
            raise DividedByZero("You divided by zero.")
        return Money(a.amount / d)
    if isinstance(b, Money):
        raise KindMismatch("A plain number can't be divided by money.")
    x, y = _decimal(a), _decimal(b)
    if y == 0:
        raise DividedByZero("You divided by zero.")
    return x / y


def modulo(a, b):
    """The remainder after dividing, with the sign of the divisor (7 mod 3 is 1, -7 mod 3 is 2)."""
    money = isinstance(a, Money)
    x = a.amount if money else _decimal(a)
    y = b.amount if isinstance(b, Money) else _decimal(b)
    if y == 0:
        raise DividedByZero("You divided by zero.")
    r = x % y
    if r != 0 and (r < 0) != (y < 0):
        r += y
    if money:
        return Money(r)
    return int(r) if isinstance(a, int) and isinstance(b, int) else r


def round_to(x, places=0):
    """Rounds half away from zero (2.5 -> 3, -2.5 -> -3), the way people round by hand."""
    if isinstance(x, Money):
        return Money(x.amount.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))
    if isinstance(x, int) and not isinstance(x, bool):
        return x
    d = _decimal(x).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return int(d) if places == 0 else d


# ---------------------------------------------------------------- showing values

def show(v):
    """A value the way Thunder says it: yes/no, nothing, $1.50, 3.5 (no trailing zeros), [1, 2]."""
    if v is None:
        return "nothing"
    if v is True:
        return "yes"
    if v is False:
        return "no"
    if isinstance(v, Decimal):
        text = format(v, "f")
        return text.rstrip("0").rstrip(".") if "." in text else text
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(show(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ", ".join("%s: %s" % (show(k), show(x)) for k, x in v.items()) + "}"
    if is_dataclass(v) and not isinstance(v, type):
        return "%s(%s)" % (type(v).__name__, ", ".join("%s: %s" % (f.name.replace("_", " "), show(getattr(v, f.name))) for f in fields(v)))
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def yes_no(v):
    """A condition or a comparison with yes/no needs a real yes/no value: "truthy" differs between languages."""
    if isinstance(v, bool):
        return v
    raise KindMismatch("This needs a yes/no value, but it is %s. Compare it instead, for example: is 0, is empty, is nothing." % _describe(v))


def _describe(v):
    if v is None:
        return "nothing"
    if isinstance(v, bool):
        return "a yes/no value"
    if isinstance(v, str):
        return 'the text "%s"' % v
    if _is_number(v):
        return "the number %s" % show(v)
    if isinstance(v, Money):
        return str(v)
    return "a value (%s)" % type(v).__name__


# ---------------------------------------------------------------- conversions

_NUMBER = re.compile(r"^[+-]?(\d[\d_]*)(\.\d+)?$")


def to_number(x):
    if _is_number(x):
        return x
    if isinstance(x, Money):
        return x.amount
    if isinstance(x, float):
        return Decimal(repr(x))
    if isinstance(x, str):
        s = x.strip().replace(",", "")
        if _NUMBER.match(s):
            return int(s.replace("_", "")) if "." not in s else Decimal(s)
    raise ConversionFailed("%s is not a number." % _describe(x))


def to_whole(x):
    n = to_number(x)
    if isinstance(n, int):
        return n
    if n == n.to_integral_value():
        return int(n)
    raise ConversionFailed("%s is not a whole number." % show(n))


def to_money(x):
    if isinstance(x, Money):
        return x
    if isinstance(x, str):
        s = x.strip().replace(",", "")
        neg = s.startswith("-")
        s = s.lstrip("-").lstrip("$")
        if _NUMBER.match(s):
            return Money(("-" if neg else "") + s)
        raise ConversionFailed("%s is not an amount of money." % _describe(x))
    return Money(to_number(x))


def to_text(x):
    return show(x)


def to_yes_no(x):
    if isinstance(x, bool):
        return x
    if isinstance(x, str) and x.strip().lower() in ("yes", "true"):
        return True
    if isinstance(x, str) and x.strip().lower() in ("no", "false"):
        return False
    raise ConversionFailed("%s is not yes or no." % _describe(x))


def to_date(x):
    if isinstance(x, date):
        return x
    try:
        return date.fromisoformat(str(x).strip())
    except ValueError:
        raise ConversionFailed("%s is not a date (write it as YYYY-MM-DD)." % _describe(x)) from None


# ---------------------------------------------------------------- lists, maps, records

def total_of(items):
    items = list(items)
    if not items:
        return 0
    result = items[0]
    for x in items[1:]:
        result = result + x
    return result


def _text(v, what):
    if not isinstance(v, str):
        raise KindMismatch("%s needs text, but it is %s." % (what, _describe(v)))
    return v


def starts_with(text, start):
    return _text(text, '"starts with"').startswith(_text(start, '"starts with"'))


def ends_with(text, end):
    return _text(text, '"ends with"').endswith(_text(end, '"ends with"'))


def joined(items, sep):
    """The items of a list as one text, with sep between them. Every item must be text (no silent conversion)."""
    sep = _text(sep, '"joined with"')
    out = []
    for i, x in enumerate(items):
        if not isinstance(x, str):
            raise KindMismatch('"joined with" joins text, but item %d is %s. Turn it into text first.' % (i + 1, _describe(x)))
        out.append(x)
    return sep.join(out)


def split_at(text, sep):
    """Text cut at each sep: "a,,b" split at "," is ["a", "", "b"] (empty parts are kept)."""
    sep = _text(sep, '"split at"')
    if sep == "":
        raise KindMismatch('"split at" needs something to split at, not empty text.')
    return _text(text, '"split at"').split(sep)


def parts_of(text):
    """The parts of text between runs of spaces, tabs and new lines; no empty parts, punctuation kept."""
    return _text(text, '"the parts of"').split()


def replacing(text, old, new):
    old = _text(old, '"replacing"')
    if old == "":
        raise KindMismatch('"replacing" needs something to replace, not empty text.')
    return _text(text, '"replacing"').replace(old, _text(new, '"replacing … with"'))


def sorted_values(items, descending=False):
    return sorted([num(x) for x in items], reverse=descending) if any(isinstance(x, float) for x in items) else sorted(items, reverse=descending)


def absolute(v):
    if isinstance(v, Money):
        return Money(abs(v.amount))
    if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)):
        raise KindMismatch('"the absolute value of" needs a number or money, but it is %s.' % _describe(v))
    return abs(num(v))


def _json_ready(v):
    if v is None or isinstance(v, (bool, str, int)):
        return v
    if isinstance(v, float):
        return Decimal(repr(v))
    if isinstance(v, Decimal):
        return v
    if isinstance(v, Money):
        raise KindMismatch("Money has no JSON form of its own: use its amount, for example price's amount.")
    if isinstance(v, (list, tuple)):
        return [_json_ready(x) for x in v]
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            if not isinstance(k, str):
                raise KindMismatch("A JSON object's keys are text, but one is %s." % _describe(k))
            out[k] = _json_ready(x)
        return out
    if is_dataclass(v):
        return {f.name: _json_ready(getattr(v, f.name)) for f in fields(v)}
    raise KindMismatch("%s has no JSON form." % _describe(v))


def json_text(v):
    """A value as JSON text, written as Python's json.dumps writes it (", " and ": "); numbers exactly."""
    ready = _json_ready(v)
    marker = {}
    def default(x):
        if isinstance(x, Decimal):
            key = "\u0000%d\u0000" % len(marker)
            marker[key] = format(x, "f") if x == x.to_integral_value() and "E" in str(x) else str(x)
            return key
        raise TypeError(x)
    def swap(o):
        if isinstance(o, Decimal):
            return default(o)
        if isinstance(o, list):
            return [swap(x) for x in o]
        if isinstance(o, dict):
            return {k: swap(x) for k, x in o.items()}
        return o
    text = json.dumps(swap(ready))
    for key, number in marker.items():
        text = text.replace(json.dumps(key), number)
    return text


def json_data(text):
    """JSON text read into lists, maps, text, yes/no, nothing, and exact numbers (never binary floats)."""
    try:
        return json.loads(_text(text, '"the JSON data in"'), parse_float=Decimal)
    except json.JSONDecodeError as e:
        raise ConversionFailed("This is not JSON: %s (line %d, column %d)." % (e.msg, e.lineno, e.colno))


def words_of(text):
    """The words in text: split at spaces, with punctuation at either end removed ("dog." is "dog"; "don't" stays)."""
    words = []
    for piece in str(text).split():
        word = piece.strip(_PUNCTUATION)
        if word:
            words.append(word)
    return words


_PUNCTUATION = ".,;:!?\"'()[]{}<>\u201c\u201d\u2018\u2019\u2026-"


def average_of(items):
    items = list(items)
    if not items:
        raise MissingValue("I can't take the average of an empty list.")
    return divide(total_of(items), len(items))


def smallest_of(items):
    items = list(items)
    if not items:
        raise MissingValue("An empty list has no smallest item.")
    return min(items)


def largest_of(items):
    items = list(items)
    if not items:
        raise MissingValue("An empty list has no largest item.")
    return max(items)


def first_of(items):
    items = list(items)
    if not items:
        raise MissingValue("An empty list has no first item.")
    return items[0]


def last_of(items):
    items = list(items)
    if not items:
        raise MissingValue("An empty list has no last item.")
    return items[-1]


def item_at(items, position, *default):
    """Positions start at 1: item 1 is the first item."""
    if not isinstance(position, int) or isinstance(position, bool):
        raise KindMismatch("A position in a list is a whole number, not %s." % _describe(position))
    if 1 <= position <= len(items):
        return items[position - 1]
    if default:
        return default[0]
    raise MissingValue("There is no item %d: the list has %d item%s." % (position, len(items), "" if len(items) == 1 else "s"))


def set_item(items, position, value):
    item_at(items, position)
    items[position - 1] = value


def set_entry(container, key, value):
    """Set an entry when the kind is not known in advance: a list position (from 1) or a map key."""
    if isinstance(container, list):
        set_item(container, key, value)
    elif isinstance(container, dict):
        container[key] = value
    elif container is None:
        raise MissingValue("This value is nothing, so it has no entry for %s." % show(key))
    else:
        raise KindMismatch("%s has no entries that can be changed." % _describe(container))


def entry(container, key, *default):
    if isinstance(container, (list, tuple)):
        return item_at(container, key, *default)
    if isinstance(container, dict):
        if key in container:
            return container[key]
        if default:
            return default[0]
        raise MissingValue("There is no entry for %s." % show(key))
    if container is None:
        raise MissingValue("This value is nothing, so it has no entry for %s." % show(key))
    raise KindMismatch("%s has no entries." % _describe(container))


def _field_names(key):
    yield key
    yield key.replace(" ", "_")
    yield key.lower()
    yield key.lower().replace(" ", "_")


def get_field(obj, key):
    """A field read from a value whose kind is not known in advance (a CSV row, a value from Python)."""
    if obj is None:
        raise MissingValue("This value is nothing, so it has no %s." % key)
    if isinstance(obj, dict):
        for k in _field_names(key):
            if k in obj:
                return obj[k]
        lowered = {str(k).strip().lower(): v for k, v in obj.items()}
        if key.lower() in lowered:
            return lowered[key.lower()]
        raise MissingValue('There is no field "%s". Fields here: %s.' % (key, ", ".join(str(k) for k in obj)))
    for k in _field_names(key):
        if hasattr(obj, k):
            return getattr(obj, k)
    raise MissingValue('%s has no field "%s".' % (_describe(obj), key))


def set_field(obj, key, value):
    if isinstance(obj, dict):
        obj[key] = value
        return
    for k in _field_names(key):
        if hasattr(obj, k):
            setattr(obj, k, value)
            return
    raise MissingValue('%s has no field "%s".' % (_describe(obj), key))


def add_to(target, value):
    if isinstance(target, list):
        target.append(value)
        return target
    return target + value


def remove_from(target, value):
    if isinstance(target, dict):
        if value not in target:
            raise MissingValue("There is no entry for %s to remove." % show(value))
        del target[value]
        return
    if value not in target:
        raise MissingValue("%s is not in the list, so it can't be removed." % show(value))
    target.remove(value)


def pairs_of(container):
    if isinstance(container, dict):
        return list(container.items())
    return list(container)


def read_file(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise MissingValue('There is no file "%s" (looked in the folder the program runs in).' % path) from None


# ---------------------------------------------------------------- rules and tests

def never(broken, text, rule=0, value=None):
    """A Never rule: raise RuleBroken when the forbidden thing has happened."""
    if broken:
        raise RuleBroken("%s (the rule on line %d), but the value is %s." % (text, rule, show(value)))



def expect_true(ok, text):
    if ok is not True:
        raise ExpectationFailed("%s, but it was not true." % text)


_CHECKS = {
    "is": lambda a, b: a == b,
    "is not": lambda a, b: a != b,
    "at least": lambda a, b: a >= b,
    "at most": lambda a, b: a <= b,
    "more than": lambda a, b: a > b,
    "less than": lambda a, b: a < b,
    "nothing": lambda a, b: a is None,
    "not nothing": lambda a, b: a is not None,
    "empty": lambda a, b: len(a) == 0,
    "positive": lambda a, b: a > 0,
    "negative": lambda a, b: a < 0,
    "zero": lambda a, b: a == 0,
    "between": lambda a, b: b[0] <= a <= b[1],
    "in": lambda a, b: a in b,
    "contains": lambda a, b: b in a,
}


def expect_value(actual, check, expected, text):
    negate = check.startswith("not ") and check not in _CHECKS
    ok = _CHECKS[check[4:] if negate else check](actual, expected)
    if negate:
        ok = not ok
    if not ok:
        raise ExpectationFailed("%s, but it was %s." % (text, show(actual)))


@contextmanager
def expect_failure(text, message=None):
    try:
        yield
    except ThunderError as e:
        if message is not None and message not in str(e):
            raise ExpectationFailed('%s, but it failed with "%s".' % (text, e)) from None
        return
    except Exception:
        return
    raise ExpectationFailed("%s, but it did not fail." % text)


# ---------------------------------------------------------------- errors in Thunder words

def explain(error):
    """The error as a sentence a person can act on."""
    if isinstance(error, ThunderError):
        return str(error)
    if isinstance(error, (ZeroDivisionError, DivisionByZero)):
        return "You divided by zero."
    if isinstance(error, InvalidOperation):
        return "This calculation has no answer (for example, zero divided by zero)."
    if isinstance(error, KeyError):
        return "There is no entry for %s." % show(error.args[0] if error.args else None)
    if isinstance(error, (TypeError, AttributeError)) and "NoneType" in str(error):
        return "A value was nothing where a value was needed."
    if isinstance(error, TypeError):
        return "Values of different kinds were mixed (%s)." % error
    if isinstance(error, RecursionError):
        return "A function called itself too many times."
    if isinstance(error, FileNotFoundError):
        return "There is no file %s." % error.filename
    return "%s: %s" % (type(error).__name__, error)


def _code(error):
    if isinstance(error, ThunderError):
        return error.code
    if isinstance(error, (ZeroDivisionError, DivisionByZero)):
        return "TC501"
    if isinstance(error, (TypeError, AttributeError)) and "NoneType" in str(error):
        return "TC502"
    if isinstance(error, KeyError):
        return "TC503"
    if isinstance(error, TypeError):
        return "TC506"
    return "TC508"


_MARK = re.compile(r"#\s*thunder:(\d+)\s*$")
_SOURCE = re.compile(r"^# Generated by the Thunder compiler from (.+)\.$")


def _source_of(filename):
    first = linecache.getline(filename, 1).strip()
    m = _SOURCE.match(first)
    return m.group(1) if m else None


def thunder_place(tb):
    """(thunder file, line, from_python): the innermost generated line the error passed through."""
    frames = traceback.extract_tb(tb)
    innermost_generated = None
    for i in range(len(frames) - 1, -1, -1):
        f = frames[i]
        if f.name == "__setattr__":
            continue
        src = _source_of(f.filename)
        if not src:
            continue
        m = _MARK.search(linecache.getline(f.filename, f.lineno).rstrip())
        if m:
            innermost_generated = (src, int(m.group(1)), i)
            break
    if not innermost_generated:
        return None, None, False
    src, line, i = innermost_generated
    outside = frames[i + 1:]
    from_python = any(_source_of(f.filename) is None and not f.filename.endswith("thunder_runtime.py") and f.filename != "<string>" for f in outside)
    return src, line, from_python


def _callers(tb):
    """The Thunder lines that led to the error, outermost first (where each function was called from)."""
    lines = []
    for f in traceback.extract_tb(tb):
        if f.name in ("__setattr__", "run", "run_tests") or not _source_of(f.filename):
            continue
        m = _MARK.search(linecache.getline(f.filename, f.lineno).rstrip())
        if m:
            lines.append(int(m.group(1)))
    return lines[:-1]


def describe_error(error):
    placed = getattr(error, "thunder_where", None)  # a stored list's file: its Store line
    src, line, from_python = (*placed, False) if placed else thunder_place(error.__traceback__)
    message = explain(error)
    code = _code(error)
    # Any error Thunder has no words for came from Python code reached through "Use" (TC508), even when that
    # code is built into Python and leaves no Python frame of its own (math.sqrt(-1)).
    if (from_python or code == "TC508") and not isinstance(error, ThunderError):
        message = "Python code used by this line failed: " + message
        code = "TC508"
    where = "%s, line %d" % (src, line) if src else "In the program"
    callers = _callers(error.__traceback__)
    if callers and src:
        where += " (reached from line %s)" % ", then line ".join(str(n) for n in reversed(callers))
    return "%s: %s  [%s]" % (where, message, code)


# ── Stored lists (Store habits as a list of Habit): data/<name>.json, the format of store-format.mjs ─────────────
_STORES = []
_STORE_KINDS = {"whole": "a whole number", "number": "a number", "money": "money", "text": "text", "bool": "yes or no", "date": "a date"}


def new_store(source, line, name, cls, kinds):
    """A stored list: empty until the program starts (run fills it), saved when the program finishes well.
    A file it can't read is reported at its Store line (source, line), as on the Thunder engine and TypeScript."""
    items = []
    _STORES.append((source, line, name, cls, kinds, items))
    return items


def _store_encode(v, kind):
    if kind.startswith("?"):
        return None if v is None else _store_encode(v, kind[1:])
    if v is None:
        return None
    if kind == "whole":
        return v if -(2 ** 53 - 1) <= v <= 2 ** 53 - 1 else str(v)
    if kind == "number":
        return str(v)
    if kind == "money":
        return str(v).replace("$", "")
    if kind == "date":
        return v.isoformat()
    return v


def _store_decode(x, kind, where, has="the file has"):
    if kind.startswith("?"):
        return None if x is None else _store_decode(x, kind[1:], where, has)
    def bad():
        return ConversionFailed("%s should be %s, but %s %s." % (where, _STORE_KINDS.get(kind, "a value"), has, json.dumps(x)))
    if kind == "whole":
        if isinstance(x, int) and not isinstance(x, bool):
            return x
        if isinstance(x, str) and re.fullmatch(r"-?\d+", x):
            return int(x)
        raise bad()
    if kind == "number":
        if isinstance(x, int) and not isinstance(x, bool):
            return x
        if isinstance(x, str):
            if re.fullmatch(r"-?\d+", x):
                return int(x)
            try:
                return Decimal(x)
            except InvalidOperation:
                raise bad()
        raise bad()
    if kind == "money":
        try:
            return Money(Decimal(str(x)))
        except (InvalidOperation, ValueError):
            raise bad()
    if kind == "text":
        if isinstance(x, str):
            return x
        raise bad()
    if kind == "bool":
        if isinstance(x, bool):
            return x
        raise bad()
    if kind == "date":
        try:
            return date.fromisoformat(x)
        except (TypeError, ValueError):
            raise bad()
    return x


def _store_file(name):
    return "data/%s.json" % name


def _fill_stores():
    import os
    for source, line, name, cls, kinds, items in _STORES:
        path = _store_file(name)
        if not os.path.exists(path):
            continue
        try:
            items[:] = _read_store(path, cls, kinds)
        except Exception as error:  # noqa: BLE001 - reported at the Store line
            error.thunder_where = (source, line)
            raise


def _read_store(path, cls, kinds):
    """The records in a store's file; a problem names the item and field."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    try:
        rows = json.loads(text)
    except ValueError as error:
        raise ConversionFailed("%s is not a list Thunder can read (%s)." % (path, error))
    if not isinstance(rows, list):
        raise ConversionFailed("%s should hold a list, written [ … ]." % path)
    return [_record_from(row, cls, kinds, "%s, item %d" % (path, i + 1)) for i, row in enumerate(rows)]


def _record_from(row, cls, kinds, where, has="the file has"):
    """A record from a JSON object, each field read by its kind; a problem names where it is and the field."""
    if not isinstance(row, dict):
        raise ConversionFailed("%s should be a record, written { … }." % where)
    given = {}
    for field_name, kind in kinds.items():
        if field_name not in row:
            if kind.startswith("?"):
                given[field_name] = None
                continue
            raise ConversionFailed('%s has no "%s".' % (where, field_name))
        given[field_name] = _store_decode(row[field_name], kind, '%s, "%s"' % (where, field_name), has)
    return cls(**given)


def _save_stores():
    import os
    for source, line, name, cls, kinds, items in _STORES:
        path = _store_file(name)
        rows = [{f: _store_encode(getattr(item, f), kind) for f, kind in kinds.items()} for item in items]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + ".saving", "w", encoding="utf-8") as fh:
            fh.write(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
        os.replace(path + ".saving", path)


# ── HTTP (When someone calls GET /habits: and the answer from GET "…"): data in the stored-list format ──────────
class CallFailed(ThunderError):
    code = "TC510"


_ANSWER_STATUS = [None]


def answer_status(status):
    """Give … with status 201: the status this request answers with (a direct call in a test ignores it)."""
    _ANSWER_STATUS[0] = status


def stop_with(message, status):
    """Stop with "…" and status 404: a Stop that an endpoint answers with that status."""
    error = Stop(message)
    error.status = status
    return error


def _data_ready(v):
    """A value as JSON data, written by its kind: whole numbers as numbers (text when too large), numbers and money as
    exact text, dates as "2026-11-28", records as objects. The same on every target."""
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return v if -(2 ** 53 - 1) <= v <= 2 ** 53 - 1 else str(v)
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, Money):
        return str(v).replace("$", "", 1)
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_data_ready(x) for x in v]
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            if not isinstance(k, str):
                raise KindMismatch("A JSON object's keys are text, but one is %s." % show(k))
            out[k] = _data_ready(x)
        return out
    if is_dataclass(v):
        return {f.name: _data_ready(getattr(v, f.name)) for f in fields(v)}
    raise KindMismatch("%s can't be sent as JSON." % show(v))


def data_json(v):
    return json.dumps(_data_ready(v), ensure_ascii=False, separators=(",", ":"))


def _unreachable_reason(error):
    """Why a service could not be reached, in words that are the same on every target."""
    import socket
    reason = getattr(error, "reason", error)
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "no answer within 30 seconds"
    if isinstance(reason, ConnectionRefusedError):
        return "nothing is answering there"
    if isinstance(reason, socket.gaierror):
        return "the address could not be found"
    return str(reason)


def http_call(method, url, body, read_as):
    """the answer from GET "…": the answer's text, or records read from it (read_as = (record, kinds, many))."""
    import urllib.error
    import urllib.request
    where = "The answer from %s %s" % (method, url)
    data = data_json(body).encode("utf-8") if body is not None else None
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as reply:
            text = reply.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raise CallFailed("%s %s answered %d: %s" % (method, url, error.code, error.read().decode("utf-8", "replace").strip()[:300]))
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise CallFailed("%s %s could not be reached (%s)." % (method, url, _unreachable_reason(error)))
    if read_as is None:
        return text
    cls, kinds, many = read_as
    try:
        answer = json.loads(text)
    except ValueError:
        raise ConversionFailed("%s is not JSON Thunder can read." % where)
    if many:
        if not isinstance(answer, list):
            raise ConversionFailed("%s should be a list, written [ … ]." % where)
        return [_record_from(row, cls, kinds, "%s, item %d" % (where, i + 1), "it has") for i, row in enumerate(answer)]
    return _record_from(answer, cls, kinds, where, "it has")


def _input_value(raw, kind, where, from_text):
    """A request's input read by its kind. Path and query parts are text, so yes/no is written yes, no, true, or false."""
    plain = kind.lstrip("?")
    if from_text and plain == "bool" and isinstance(raw, str) and raw.lower() in ("yes", "no", "true", "false"):
        raw = raw.lower() in ("yes", "true")
    return _store_decode(raw, kind, where, "the request has")


def _serve(routes):
    """Answer requests on this machine, one at a time, until stopped (Ctrl+C). Stored lists are saved after each
    request that finishes well."""
    import os
    import urllib.parse
    from http.server import BaseHTTPRequestHandler, HTTPServer

    host = os.environ.get("THUNDER_HOST", "127.0.0.1")
    port = int(os.environ.get("THUNDER_PORT", "8080"))
    table = []
    for method, path, handler, inputs in routes:
        parts = [p for p in path.split("/") if p]
        table.append((method, path, parts, handler, inputs))

    def match(parts, request_parts):
        if len(parts) != len(request_parts):
            return None
        found = {}
        for want, got in zip(parts, request_parts):
            if want.startswith("{") and want.endswith("}"):
                found[want[1:-1].strip().lower()] = urllib.parse.unquote(got)
            elif want != got:
                return None
        return found

    class Handler(BaseHTTPRequestHandler):
        server_version = "Thunder"

        def answer(self, status, value):
            data = data_json(value).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            print("%s %s -> %d" % (self.command, self.path, status), flush=True)

        def handle_any(self):
            url = urllib.parse.urlsplit(self.path)
            request_parts = [p for p in url.path.split("/") if p]
            query = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
            chosen, methods = None, []
            for method, path, parts, handler, inputs in table:
                found = match(parts, request_parts)
                if found is None:
                    continue
                methods.append(method)
                if method == self.command:
                    chosen = (method, path, handler, inputs, found)
            if chosen is None:
                if methods:
                    return self.answer(405, {"problem": "%s answers only %s." % (url.path, ", ".join(methods))})
                return self.answer(404, {"problem": "Nothing here answers %s %s." % (self.command, url.path)})
            method, path, handler, inputs, found = chosen
            body = {}
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except ValueError:
                    return self.answer(400, {"problem": "The request's body is not JSON Thunder can read."})
                if not isinstance(body, dict):
                    return self.answer(400, {"problem": "The request's body should be a JSON object, written { … }."})
            args = {}
            try:
                for text, py_name, kind, source, has_default in inputs:
                    key = text.lower()
                    if source == "path":
                        args[py_name] = _input_value(found[key], kind, '"%s"' % text, True)
                    elif key in query:
                        args[py_name] = _input_value(query[key], kind, '"%s"' % text, True)
                    elif text in body or key in body:
                        args[py_name] = _input_value(body.get(text, body.get(key)), kind, '"%s"' % text, False)
                    elif not has_default:
                        if kind.startswith("?"):
                            args[py_name] = None
                        else:
                            return self.answer(400, {"problem": "%s %s needs %s (%s)." % (method, path, text, _STORE_KINDS.get(kind, kind))})
            except ThunderError as error:
                return self.answer(400, {"problem": explain(error)})
            _ANSWER_STATUS[0] = None
            try:
                value = handler(**args)
            except Stop as error:
                return self.answer(getattr(error, "status", 400), {"problem": explain(error)})
            except RuleBroken as error:
                return self.answer(422, {"problem": explain(error)})
            except Exception as error:  # noqa: BLE001 - reported in Thunder words, the server keeps answering
                print(describe_error(error), file=sys.stderr, flush=True)
                return self.answer(500, {"problem": explain(error)})
            status = _ANSWER_STATUS[0] or 200
            try:
                _save_stores()
                data = data_json(value)
            except Exception as error:  # noqa: BLE001
                print(describe_error(error), file=sys.stderr, flush=True)
                return self.answer(500, {"problem": explain(error)})
            self.answer(status, json.loads(data) if data != "null" else None)

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = handle_any

        def log_message(self, *args):
            pass

    server = HTTPServer((host, port), Handler)
    print("Thunder is answering on http://%s:%d" % (host, port), flush=True)
    for method, path, handler, inputs in routes:
        print("  %s %s" % (method, path), flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped answering.", flush=True)
    finally:
        server.server_close()


def run(main, file=None, routes=None):
    """Runs a generated program; an error is reported against the Thunder line, then the program exits with 1.
    Stored lists are filled first and saved only when the program finishes well. With endpoints, it then answers
    requests until stopped."""
    try:
        _fill_stores()
        main()
        _save_stores()
    except KeyboardInterrupt:
        raise
    except Exception as error:  # noqa: BLE001 - every error is reported in Thunder words
        print(describe_error(error), file=sys.stderr)
        sys.exit(1)
    if routes:
        _serve(routes)


def run_tests(modules):
    """Runs every Test block (THUNDER_TESTS in each module). Prints one line per test; exits 1 if any failed."""
    passed = failed = 0
    for module in modules:
        source = getattr(module, "THUNDER_SOURCE", module.__name__)
        for name, test, line in getattr(module, "THUNDER_TESTS", []):
            try:
                test()
            except Exception as error:  # noqa: BLE001
                failed += 1
                print("FAIL  %s (%s, line %d)" % (name, source, line))
                print("      " + describe_error(error))
            else:
                passed += 1
                print("PASS  %s (%s, line %d)" % (name, source, line))
    total = passed + failed
    print("%d test%s: %d passed, %d failed" % (total, "" if total == 1 else "s", passed, failed))
    sys.exit(1 if failed else 0)
`;
