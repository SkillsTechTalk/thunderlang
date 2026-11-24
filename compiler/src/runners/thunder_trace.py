"""Proof by running, Python side: run real code and record what actually happened, with no third-party packages.

Thunder reads code into flows (questions with Yes and No sides, loops, Stops, endings). This recorder runs the code
and writes down, for every function under --root:

  * each decision it reached (if / elif / while / for / match / except), where the code went next, and which part of
    the statement that is according to Python's own parser (`ast`): the body, the else, a case, or past the
    statement altogether;
  * each ending: the `return` line (with the value, when it is a plain number, text, yes/no, or None), the `raise`
    line with the exception type and its base classes, or "reached the end without returning".

It never interprets Thunder: the comparison with Thunder's flow is done in compiler/src/executed.mjs. It uses
sys.monitoring (Python 3.12+), so tracing costs little outside the functions being recorded.

Usage (always run with `python -I`, from a scratch directory):
  python -I thunder_trace.py --root DIR --out trace.json [--max-seconds 120]
         (--generate | --discover TESTDIR | --pytest -- PYTEST_ARGS...)

  --generate   call each module-level function that looks free of side effects with inputs made from its parameter
               types and the values its own body mentions (each limit, one either side, 0, empty text, None).
  --discover   import test_*.py / *_test.py files under TESTDIR and call every test_* function that takes nothing.
  --pytest     run pytest in this process with the given arguments (pytest must be installed where this runs).
"""
import ast
import importlib
import importlib.util
import itertools
import json
import os
import random
import signal
import sys
import time

MON = getattr(sys, 'monitoring', None)
TOOL = 4  # a free tool id (0-5); 0 is the debugger, 1 coverage, 2 profiler, 5 optimizer
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', 'venv', '.venv', 'env', 'site-packages', 'build', 'dist', '.tox', '.eggs'}
TEST_FILE = lambda p: os.path.basename(p).startswith('test_') or os.path.basename(p).endswith('_test.py') or os.path.basename(p) == 'conftest.py' or any(part in ('test', 'tests', 'testing') for part in p.split(os.sep))
DECISIONS = (ast.If, ast.While, ast.For, ast.AsyncFor, ast.Match)
COMPOUND_EXIT = (ast.With, ast.AsyncWith, ast.Try) + ((ast.TryStar,) if hasattr(ast, 'TryStar') else ())


# ── What Python's parser says about one file ─────────────────────────────────────────────────────────────

class FileInfo:
    def __init__(self, path, rel):
        self.path, self.rel = path, rel
        with open(path, encoding='utf-8') as fh:
            self.tree = ast.parse(fh.read(), path)
        self.parent, self.field, self.depth = {}, {}, {}
        self.starts, self.covers = {}, {}
        self.handler_first = {}   # id(first stmt of an except body) -> except line
        self.in_finally = set()   # ids of statements inside a finally body
        self.funcs = {}           # (first line incl. decorators, name) -> def line
        self.returns = {}         # return line -> line of the innermost if / case that holds it
        self.spans = {}           # first line of a compound statement -> its last line
        self._walk(self.tree, None, None, 0, None, False)

    def _walk(self, node, parent, field, depth, encl, fin):
        for name, value in ast.iter_fields(node):
            items = value if isinstance(value, list) else [value]
            for idx, child in enumerate(items):
                if not isinstance(child, ast.AST):
                    continue
                if isinstance(child, ast.stmt):
                    self.parent[id(child)] = node
                    self.field[id(child)] = name
                    self.depth[id(child)] = depth
                    if fin or (name == 'finalbody'):
                        self.in_finally.add(id(child))
                    cur = self.starts.get(child.lineno)
                    if cur is None or self.depth[id(cur)] > depth:
                        self.starts[child.lineno] = child
                    for line in range(child.lineno, (child.end_lineno or child.lineno) + 1):
                        c = self.covers.setdefault(line, [])
                        c.append(child)
                    if isinstance(node, ast.ExceptHandler) and name == 'body' and idx == 0:
                        self.handler_first[id(child)] = node.lineno
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        first = min([child.lineno] + [d.lineno for d in child.decorator_list])
                        self.funcs[(first, child.name)] = child.lineno
                    if isinstance(child, ast.Return):
                        self.returns[child.lineno] = encl
                    if (child.end_lineno or child.lineno) > child.lineno:
                        self.spans[child.lineno] = max(self.spans.get(child.lineno, 0), child.end_lineno)
                    inner = encl
                    if isinstance(child, ast.If):
                        inner = child.lineno
                    self._walk(child, child, name, depth + 1, inner, fin or name == 'finalbody')
                elif isinstance(child, ast.match_case):
                    self.parent[id(child)] = node
                    self.field[id(child)] = 'case'
                    self._walk(child, child, name, depth, child.pattern.lineno, fin)
                elif isinstance(child, ast.ExceptHandler):
                    self.parent[id(child)] = node
                    self.field[id(child)] = 'handlers'
                    self._walk(child, child, name, depth, encl, fin)
                elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                    self._walk(child, child, name, depth + 1, encl, fin)
                # expressions hold no statements (except lambdas, which have none either)

    def at_line(self, line):
        """The statement a LINE event belongs to: the outermost one starting on the line, else the innermost one
        whose lines include it (a continued expression, or an `except` line, which belongs to its try)."""
        s = self.starts.get(line)
        if s is not None:
            return s
        c = self.covers.get(line)
        return max(c, key=lambda x: self.depth[id(x)]) if c else None

    def at_pos(self, line, col):
        """The innermost statement that contains (line, col)."""
        if line is None:
            return None
        best = None
        for s in self.covers.get(line, []):
            if (s.lineno, s.col_offset) <= (line, col if col is not None else 0) <= (s.end_lineno, s.end_col_offset):
                if best is None or self.depth[id(s)] > self.depth[id(best)]:
                    best = s
        return best

    def where(self, d, n):
        """Where statement n sits relative to decision d: body, orelse, case:<line>, or after."""
        x = n
        while x is not None:
            p = self.parent.get(id(x))
            if p is d:
                return self.field.get(id(x))
            if isinstance(p, ast.match_case) and self.parent.get(id(p)) is d:
                return 'case:%d' % p.pattern.lineno
            x = p
        return 'after'


# ── The recorder ──────────────────────────────────────────────────────────────────────────────────────────

class Frame:
    __slots__ = ('cur', 'pending', 'last_return', 'func')

    def __init__(self, func):
        self.cur = None
        self.pending = None
        self.last_return = None
        self.func = func


class Recorder:
    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.files = {}        # real path -> FileInfo or None
        self.codes = {}        # code -> (FileInfo, def line) for recorded functions
        self.frames = {}
        self.out = {}          # rel -> {'functions': {}, 'decisions': {}, 'returns': {}}
        self.instrumented = []

    def info_for(self, filename):
        if filename in self.files:
            return self.files[filename]
        real = os.path.realpath(filename)
        info = None
        if real.endswith('.py') and real.startswith(self.root + os.sep):
            rel = os.path.relpath(real, self.root)
            if not TEST_FILE(rel) and not any(p in SKIP_DIRS for p in rel.split(os.sep)):
                try:
                    info = FileInfo(real, rel.replace(os.sep, '/'))
                    self.out[info.rel] = {'functions': {}, 'decisions': {}, 'returns': {str(k): v for k, v in info.returns.items()}, 'spans': {str(k): v for k, v in info.spans.items()}}
                except (SyntaxError, UnicodeDecodeError, OSError):
                    info = None
        self.files[filename] = info
        return info

    def fn(self, info, line):
        return self.out[info.rel]['functions'].setdefault(str(line), {'runs': 0, 'returns': {}, 'raises': {}, 'fellOff': 0, 'unwound': 0})

    # Events ---------------------------------------------------------------------------------------------
    def on_start(self, code, offset):
        hit = self.codes.get(code)
        if hit is None:
            info = self.info_for(code.co_filename)
            line = info.funcs.get((code.co_firstlineno, code.co_name)) if info else None
            if line is None:
                return MON.DISABLE
            hit = self.codes[code] = (info, line)
            MON.set_local_events(TOOL, code, MON.events.LINE | MON.events.PY_RETURN)
            self.instrumented.append(code)
        info, line = hit
        self.fn(info, line)['runs'] += 1
        self.frames[id(sys._getframe(1))] = Frame(line)

    def state(self, code):
        hit = self.codes.get(code)
        if hit is None:
            return None, None
        f = sys._getframe(2)
        st = self.frames.get(id(f))
        if st is None:
            st = self.frames[id(f)] = Frame(hit[1])
        return hit[0], st

    def resolve(self, info, st, n):
        d = st.pending
        st.pending = None
        where = info.where(d, n) if n is not None else 'end'
        if where in ('orelse',) and isinstance(d, (ast.For, ast.AsyncFor, ast.While)):
            where = 'after'
        kind = 'if' if isinstance(d, ast.If) else 'while' if isinstance(d, ast.While) else 'match' if isinstance(d, ast.Match) else 'for'
        rec = self.out[info.rel]['decisions'].setdefault(str(d.lineno), {'kind': kind, 'obs': {}})
        key = '%s|%s' % (where, n.lineno if n is not None else '')
        rec['obs'][key] = rec['obs'].get(key, 0) + 1

    def on_line(self, code, line):
        info, st = self.state(code)
        if info is None:
            return
        s = info.at_line(line)
        if s is None or s is st.cur:
            return
        st.cur = s
        h = info.handler_first.get(id(s))
        if h is not None:
            rec = self.out[info.rel]['decisions'].setdefault(str(h), {'kind': 'handler', 'obs': {}})
            key = 'body|%d' % s.lineno
            rec['obs'][key] = rec['obs'].get(key, 0) + 1
        if st.pending is not None:
            self.resolve(info, st, s)
        if isinstance(s, ast.Return):
            st.last_return = s
        elif st.last_return is not None and not isinstance(s, COMPOUND_EXIT) and id(s) not in info.in_finally:
            st.last_return = None
        if isinstance(s, DECISIONS) and line == s.lineno:
            st.pending = s

    def position(self, code, offset):
        try:
            p = list(code.co_positions())[offset // 2]
            return p[0], p[2]
        except Exception:
            return None, None

    def on_return(self, code, offset, value):
        info, st = self.state(code)
        if info is None:
            return
        self.frames.pop(id(sys._getframe(1)), None)
        line, col = self.position(code, offset)
        s = info.at_pos(line, col)
        if st.pending is not None:
            if s is not None and s is not st.pending:
                self.resolve(info, st, s)
            else:
                self.resolve(info, st, None)
        fn = self.fn(info, st.func)
        r = s if isinstance(s, ast.Return) else st.last_return
        if r is not None:
            e = fn['returns'].setdefault(str(r.lineno), {'count': 0, 'values': []})
            e['count'] += 1
            v = plain(value)
            if v is not None and v not in e['values'] and len(e['values']) < 6:
                e['values'].append(v)
        elif code.co_flags & 0x20 or code.co_flags & 0x80 or code.co_flags & 0x200:
            pass  # a generator or coroutine finishing is not an ending a person reads
        else:
            fn['fellOff'] += 1
            if st.cur is not None:
                at = fn.setdefault('fellOffAt', {})
                at[str(st.cur.lineno)] = at.get(str(st.cur.lineno), 0) + 1

    def on_raise(self, code, offset, exc):
        hit = self.codes.get(code)
        if hit is None:
            return
        info = hit[0]
        st = self.frames.get(id(sys._getframe(1)))
        line, col = self.position(code, offset)
        s = info.at_pos(line, col)
        if st is not None and st.pending is not None:
            if s is not None and s is not st.pending and info.where(st.pending, s) != 'after':
                self.resolve(info, st, s)
            else:
                st.pending = None  # the condition itself failed
        if isinstance(s, ast.Raise):
            fn = self.fn(info, hit[1])
            e = fn['raises'].setdefault(str(s.lineno), {'count': 0, 'types': {}})
            e['count'] += 1
            t = type(exc)
            e['types'][t.__name__] = [c.__name__ for c in t.__mro__]

    def on_unwind(self, code, offset, exc):
        hit = self.codes.get(code)
        if hit is None:
            return
        self.frames.pop(id(sys._getframe(1)), None)
        self.fn(hit[0], hit[1])['unwound'] += 1

    def start(self):
        MON.use_tool_id(TOOL, 'thunder-proof')
        E = MON.events
        MON.register_callback(TOOL, E.PY_START, self.on_start)
        MON.register_callback(TOOL, E.LINE, self.on_line)
        MON.register_callback(TOOL, E.PY_RETURN, self.on_return)
        MON.register_callback(TOOL, E.RAISE, self.on_raise)
        MON.register_callback(TOOL, E.PY_UNWIND, self.on_unwind)
        MON.set_events(TOOL, E.PY_START | E.RAISE | E.PY_UNWIND)

    def stop(self):
        MON.set_events(TOOL, 0)
        for c in self.instrumented:
            try:
                MON.set_local_events(TOOL, c, 0)
            except Exception:
                pass
        MON.free_tool_id(TOOL)


def plain(v):
    """A value written so Thunder can compare it: numbers, text, yes/no, nothing. Anything else is not compared."""
    if v is None:
        return 'None'
    if isinstance(v, bool):
        return 'True' if v else 'False'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str) and len(v) <= 80:
        return json.dumps(v)
    return None


# ── Inputs ───────────────────────────────────────────────────────────────────────────────────────────────

SAFE_CALLS = set('abs all any bool dict divmod enumerate filter float frozenset int isinstance issubclass len list map max min range repr reversed round set sorted str sum tuple zip ValueError TypeError KeyError IndexError ZeroDivisionError ArithmeticError RuntimeError LookupError NotImplementedError Exception'.split())
SAFE_METHODS = set('lower upper strip lstrip rstrip split rsplit join replace startswith endswith format get items keys values append extend insert pop count index find rfind title capitalize isdigit isalpha isalnum isspace copy add discard update setdefault partition rpartition zfill ljust rjust center casefold encode decode'.split())


class Timeout(Exception):
    pass


def looks_pure(fn, module_names, imported):
    """True when a function calls only builtins, plain text/list/dict methods, and this module's own functions and
    classes: safe to call with made-up inputs (no files, network, processes, or clocks)."""
    for n in ast.walk(fn):
        if isinstance(n, (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal, ast.Await, ast.Yield, ast.YieldFrom)):
            return False
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name):
                if f.id not in SAFE_CALLS and f.id not in module_names:
                    return False
            elif isinstance(f, ast.Attribute):
                base = f.value
                while isinstance(base, ast.Attribute):
                    base = base.value
                if isinstance(base, ast.Name) and base.id in imported:
                    return False
                if f.attr not in SAFE_METHODS:
                    return False
            else:
                return False
    return True


def literals(fn):
    nums, texts = set(), set()
    for n in ast.walk(fn):
        if isinstance(n, ast.Constant):
            if isinstance(n.value, bool):
                continue
            if isinstance(n.value, (int, float)):
                for v in (n.value - 1, n.value, n.value + 1):
                    nums.add(v)
                if isinstance(n.value, float):
                    nums.update((round(n.value - 0.01, 6), round(n.value + 0.01, 6)))
            elif isinstance(n.value, str) and len(n.value) <= 40:
                texts.add(n.value)
    return sorted(nums)[:12], sorted(texts)[:8]


def values_for(arg, default, nums, texts):
    ann = ast.unparse(arg.annotation) if arg.annotation is not None else ''
    nums = nums or [0]
    ints = sorted({int(x) for x in nums} | {0, 1, -1})
    floats = sorted(set(nums) | {0.0, 1.5, -1.0})
    strs = sorted(set(texts) | {'', 'x'})
    out = []
    if default is not None:
        try:
            out.append(ast.literal_eval(default))
        except Exception:
            pass
    a = ann.replace(' ', '')
    if a in ('int',):
        out += ints
    elif a in ('float',):
        out += floats
    elif a in ('bool',):
        out += [True, False]
    elif a in ('str',):
        out += strs
    elif a.startswith(('list', 'List', 'Sequence', 'Iterable', 'tuple', 'Tuple')):
        out += [[], [0], [1, 20, 3], ['a', ''], ints[:4]]
    elif a.startswith(('dict', 'Dict', 'Mapping')):
        out += [{}, {'a': 1}]
    elif a.startswith(('Optional[', 'None|')) or a.endswith('|None'):
        inner = a.replace('Optional[', '')[:-1] if a.startswith('Optional[') else a.replace('|None', '').replace('None|', '')
        out += [None] + (ints if inner == 'int' else floats if inner == 'float' else strs if inner == 'str' else [0, ''])
    elif not a:
        out += [None, 0, 1, -1, '', 'x', True, False, []] + ints[:6] + list(texts)[:4]
    else:
        return None  # a type we cannot make
    seen, uniq = set(), []
    for v in out:
        k = repr(v)
        if k not in seen:
            seen.add(k)
            uniq.append(v)
    return uniq


def generated_calls(tree, module, cap):
    module_names = {n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef))}
    imported = set()
    for n in tree.body:
        if isinstance(n, ast.Import):
            imported.update(a.asname or a.name.split('.')[0] for a in n.names)
        elif isinstance(n, ast.ImportFrom):
            imported.update(a.asname or a.name for a in n.names)
    module_names -= imported
    for fn in tree.body:
        if not isinstance(fn, ast.FunctionDef) or fn.decorator_list:
            continue
        target = getattr(module, fn.name, None)
        if not callable(target) or not looks_pure(fn, module_names, imported):
            continue
        a = fn.args
        if a.vararg or a.kwarg or a.posonlyargs or any(d is None for d in a.kw_defaults):
            continue
        nums, texts = literals(fn)
        defaults = [None] * (len(a.args) - len(a.defaults)) + list(a.defaults)
        axes = []
        for arg, d in zip(a.args, defaults):
            vs = values_for(arg, d, nums, texts)
            if vs is None:
                axes = None
                break
            axes.append(vs)
        if axes is None:
            continue
        total = 1
        for ax in axes:
            total *= len(ax)
        if total <= cap:
            combos = itertools.product(*axes)
        else:
            rnd = random.Random(fn.name)
            combos = (tuple(ax[rnd.randrange(len(ax))] for ax in axes) for _ in range(cap))
            combos = [tuple(ax[0] for ax in axes)] + list(combos)
        yield fn.name, target, combos


def call_with_timeout(f, args, seconds):
    def alarm(signum, frame):
        raise Timeout()
    old = signal.signal(signal.SIGALRM, alarm)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        f(*[_copy(x) for x in args])
        return 'ok'
    except Timeout:
        return 'timeout'
    except Exception:
        return 'raised'
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


def _copy(x):
    return list(x) if isinstance(x, list) else dict(x) if isinstance(x, dict) else x


def module_name(root, path):
    rel = os.path.relpath(path, root)[:-3].split(os.sep)
    if rel[-1] == '__init__':
        rel = rel[:-1]
    return '.'.join(rel)


def py_files(root, tests=False):
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS and not x.startswith('.'))
        for name in sorted(files):
            p = os.path.join(d, name)
            if name.endswith('.py') and TEST_FILE(os.path.relpath(p, root)) == tests:
                yield p


def main(argv):
    args = {'--root': None, '--out': None, '--max-seconds': '120', '--max-calls': '200', '--discover': None}
    mode, rest, i = None, [], 0
    while i < len(argv):
        a = argv[i]
        if a in ('--generate',):
            mode = 'generate'
        elif a == '--pytest':
            mode = 'pytest'
        elif a == '--':
            rest = argv[i + 1:]
            break
        elif a in args:
            args[a] = argv[i + 1]
            i += 1
            if a == '--discover':
                mode = 'discover'
        i += 1
    root, out = args['--root'], args['--out']
    meta = {'python': sys.version.split()[0], 'mode': mode, 'calls': 0, 'raised': 0, 'timeouts': 0, 'capped': False, 'errors': []}
    if MON is None:
        meta['errors'].append('Python %s has no sys.monitoring (3.12 or newer is needed).' % meta['python'])
        json.dump({'meta': meta, 'files': {}}, open(out, 'w'))
        return 0
    root = os.path.realpath(root)
    rec = Recorder(root)
    limit = float(args['--max-seconds'])
    began = time.time()
    if mode == 'generate':
        sys.path.insert(0, root)
        rec.start()
        try:
            for p in py_files(root):
                if time.time() - began > limit:
                    meta['capped'] = True
                    break
                try:
                    tree = ast.parse(open(p, encoding='utf-8').read())
                    mod = importlib.import_module(module_name(root, p))
                except BaseException as e:  # a module that cannot be imported is simply not run
                    meta['errors'].append('%s: %s' % (os.path.relpath(p, root), str(e)[:160]))
                    continue
                for name, target, combos in generated_calls(tree, mod, int(args['--max-calls'])):
                    for combo in combos:
                        if time.time() - began > limit:
                            meta['capped'] = True
                            break
                        r = call_with_timeout(target, combo, 0.5)
                        meta['calls'] += 1
                        meta['raised'] += r == 'raised'
                        meta['timeouts'] += r == 'timeout'
        finally:
            rec.stop()
    elif mode == 'discover':
        tdir = os.path.realpath(args['--discover'])
        sys.path.insert(0, root)
        sys.path.insert(0, tdir)
        rec.start()
        try:
            for p in py_files(tdir, tests=True):
                if os.path.basename(p) == 'conftest.py':
                    continue
                try:
                    spec = importlib.util.spec_from_file_location('thunder_test_' + module_name(tdir, p).replace('.', '_'), p)
                    mod = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(mod)
                except BaseException as e:
                    meta['errors'].append('%s: %s' % (os.path.relpath(p, tdir), str(e)[:160]))
                    continue
                for name in sorted(dir(mod)):
                    f = getattr(mod, name)
                    if name.startswith('test') and callable(f) and getattr(f, '__code__', None) and f.__code__.co_argcount == 0:
                        if time.time() - began > limit:
                            meta['capped'] = True
                            break
                        r = call_with_timeout(f, (), 5)
                        meta['calls'] += 1
                        meta['raised'] += r == 'raised'
                        meta['timeouts'] += r == 'timeout'
        finally:
            rec.stop()
    elif mode == 'pytest':
        import pytest
        def alarm(signum, frame):
            meta['capped'] = True
            rec.stop()
        signal.signal(signal.SIGALRM, alarm)
        signal.setitimer(signal.ITIMER_REAL, limit)
        rec.start()
        try:
            meta['exit'] = int(pytest.main(rest))
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            if not meta['capped']:
                rec.stop()
    meta['seconds'] = round(time.time() - began, 2)
    with open(out, 'w') as fh:
        json.dump({'meta': meta, 'files': rec.out}, fh)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
