// Thunder write, measured on code Thunder was not built for: realistic change requests on Click (pallets/click),
// each with a hidden test written before the writer ran. Run by scripts/write-bench.mjs.
//
// A task passes only when all of these hold:
//   1. thunder write writes it (status "written", its own proof passed);
//   2. the changed file parses and the package still imports;
//   3. the hidden test FAILS on the original code (so it really tests the change) and PASSES on the written code.
// Each hidden test also checks behavior the request must not change. The edits are written in Thunder's words
// where Thunder has words for them, and as code where it does not yet (a call such as str(default)).

export const CORPUS = {
  name: 'click',
  repo: 'https://github.com/pallets/click.git',
  commit: '08b803cf32ceb2ae6a772c62d5da42757a897d44',
  src: 'src', // the folder that goes on sys.path
};

const m = (file, name, line) => ({ file, name, line });

export const TASKS = [
  {
    id: 'join-options-separator',
    request: 'Join option names with " / " instead of ", " in help output.',
    file: 'click/formatting.py',
    edits: [{ op: 'setValue', member: m('click/formatting.py', 'join_options', 311), step: 'line:329', from: ', ', to: ' / ' }],
    test: `
from click.formatting import join_options
assert join_options(["--all", "-a"]) == ("-a / --all", False), join_options(["--all", "-a"])
assert join_options(["/debug"]) == ("/debug", True)
`,
  },
  {
    id: 'short-help-negative-limit',
    request: 'Refuse a negative max_length when shortening help text, with a clear error.',
    file: 'click/utils.py',
    edits: [{ op: 'addStop', member: m('click/utils.py', '_make_default_short_help', 58), before: 'line:64', when: 'max length is below 0', message: 'max_length must not be negative' }],
    test: `
from click.utils import _make_default_short_help as short
try:
    short("Hello world.", -1)
except ValueError as e:
    assert "max_length must not be negative" in str(e)
else:
    raise AssertionError("no error for a negative max_length")
assert short("Hello world. More text here.") == "Hello world."
assert short("") == ""
`,
  },
  {
    id: 'short-help-placeholder',
    request: 'Let callers choose the placeholder used when help text is cut short (default "...").',
    file: 'click/utils.py',
    edits: [
      { op: 'addInput', member: m('click/utils.py', '_make_default_short_help', 58), name: 'placeholder', default: '"..."' },
      { op: 'setValue', member: m('click/utils.py', '_make_default_short_help', 58), step: 'line:90', from: '...', toValue: 'placeholder' },
      { op: 'setValue', member: m('click/utils.py', '_make_default_short_help', 58), step: 'line:89', from: '...', toValue: 'placeholder' },
      { op: 'setValue', member: m('click/utils.py', '_make_default_short_help', 58), step: 'line:96', from: '...', toValue: 'placeholder' },
    ],
    test: `
from click.utils import _make_default_short_help as short
assert short("abcdef", 1, placeholder="~") == "~", short("abcdef", 1, placeholder="~")
assert short("one two three four", 9, placeholder="~") == "one two~", short("one two three four", 9, placeholder="~")
assert short("abcdef", 2) == "..."
assert short("Hello world.") == "Hello world."
`,
  },
  {
    id: 'short-help-strict-limit',
    request: 'Treat help text exactly max_length long as too long (shorten it).',
    file: 'click/utils.py',
    edits: [{ op: 'setCondition', member: m('click/utils.py', '_make_default_short_help', 58), step: 'line:85', when: 'the length of text is below max length' }],
    test: `
from click.utils import _make_default_short_help as short
# Exactly max_length long now goes on to shortening; under three characters that gives "...".
assert short("ab", 2) == "...", short("ab", 2)
assert short("a", 2) == "a"
assert short("Hello world.") == "Hello world."
`,
  },
  {
    id: 'color-basic-palette',
    request: 'Only accept palette colors 0 to 15 (the basic and bright colors), not the full 0 to 255.',
    file: 'click/termui.py',
    edits: [{ op: 'setValue', member: m('click/termui.py', '_interpret_color', 616), step: 'line:624', from: 255, to: 15 }],
    test: `
from click.termui import _interpret_color
try:
    _interpret_color(200)
except ValueError:
    pass
else:
    raise AssertionError("200 should be refused")
assert _interpret_color(10) == "38;5;10"
assert _interpret_color("red") == "31"
assert _interpret_color((1, 2, 3)) == "38;2;1;2;3"
`,
  },
  {
    id: 'mask-hidden-none',
    request: 'When there is no message (None), give it back as it is instead of crashing.',
    file: 'click/termui.py',
    edits: [{ op: 'addStep', member: m('click/termui.py', '_mask_hidden_input', 61), before: 'line:71', step: { if: 'message is nothing', then: ['Give message'] } }],
    test: `
from click.termui import _mask_hidden_input, _HIDDEN_INPUT_MASK
assert _mask_hidden_input(None, "secret") is None
out = _mask_hidden_input("bad value secret here", "secret")
assert "secret" not in out and _HIDDEN_INPUT_MASK in out, out
`,
  },
  {
    id: 'prompt-without-choices',
    request: 'Stop listing the choices in prompts.',
    file: 'click/termui.py',
    edits: [{ op: 'removeStep', member: m('click/termui.py', '_build_prompt', 108), step: 'line:117' }],
    test: `
from click.termui import _build_prompt
from click.types import Choice
assert _build_prompt("Pick", ": ", type=Choice(["a", "b"])) == "Pick: ", _build_prompt("Pick", ": ", type=Choice(["a", "b"]))
assert _build_prompt("Pick", ": ", show_default=True, default=3) == "Pick [3]: "
`,
  },
  {
    id: 'format-default-as-text',
    request: 'Always show a default as text.',
    file: 'click/termui.py',
    edits: [{ op: 'setGivesBack', member: m('click/termui.py', '_format_default', 128), step: 'line:135', value: 'str(default)' }],
    test: `
from click.termui import _format_default
assert _format_default(5) == "5", repr(_format_default(5))
assert _format_default("x") == "x"
`,
  },
  {
    id: 'option-start-needs-two-chars',
    request: 'A lone prefix character such as "-" is not the start of an option.',
    file: 'click/shell_completion.py',
    edits: [{ op: 'setCondition', member: m('click/shell_completion.py', '_start_of_option', 657), step: 'line:659', when: 'the length of value is below 2' }],
    test: `
from click.shell_completion import _start_of_option
class Ctx:
    _opt_prefixes = {"-", "+"}
assert _start_of_option(Ctx(), "-") is False
assert _start_of_option(Ctx(), "-v") is True
assert _start_of_option(Ctx(), "") is False
assert _start_of_option(Ctx(), "xy") is False
`,
  },
  {
    id: 'split-opt-rename-input',
    request: 'Rename the input of _split_opt from opt to option (no change in behavior).',
    file: 'click/parser.py',
    edits: [{ op: 'rename', member: m('click/parser.py', '_split_opt', 111), from: 'opt', to: 'option' }],
    test: `
import inspect
from click.parser import _split_opt, _normalize_opt
assert list(inspect.signature(_split_opt).parameters) == ["option"]
assert _split_opt("--x") == ("--", "x") and _split_opt("-x") == ("-", "x") and _split_opt("x") == ("", "x")
assert _normalize_opt("--X", None) == "--X"
from click.formatting import join_options
assert join_options(["--all", "-a"]) == ("-a, --all", False)
`,
  },
  {
    id: 'iter-rows-negative-count',
    request: 'Refuse a negative column count when padding table rows.',
    file: 'click/formatting.py',
    edits: [{ op: 'addStop', member: m('click/formatting.py', 'iter_rows', 24), before: 'line:27', when: 'col count is below 0', message: 'col_count must not be negative' }],
    test: `
from click.formatting import iter_rows
try:
    list(iter_rows([("a",)], -1))
except ValueError as e:
    assert "col_count must not be negative" in str(e)
else:
    raise AssertionError("no error for a negative col_count")
assert list(iter_rows([("a",)], 2)) == [("a", "")]
`,
  },
  {
    id: 'iter-rows-fill',
    request: 'Let callers choose what fills the missing cells of a short row (default "").',
    file: 'click/formatting.py',
    edits: [
      { op: 'addInput', member: m('click/formatting.py', 'iter_rows', 24), name: 'fill', default: '""' },
      { op: 'setValue', member: m('click/formatting.py', 'iter_rows', 24), step: 'line:28', from: '', toValue: 'fill' },
    ],
    test: `
from click.formatting import iter_rows
assert list(iter_rows([("a",)], 3, "-")) == [("a", "-", "-")], list(iter_rows([("a",)], 3, "-"))
assert list(iter_rows([("a",)], 2)) == [("a", "")]
`,
  },
];
