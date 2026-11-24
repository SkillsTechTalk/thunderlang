// Faithfulness for C++: each case is a minimal copy of a function graded false (D) or misleading (C) in a hand review
// of fmt and nlohmann/json readings; the sample is in the test name. Text with values inside keeps its literal parts
// exactly and shows each value as a «placeholder» (docs/spec.md, "Text with values inside").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('fmt#2/#9/#12/#14: a macro in front of the type is not what comes back; void and destructors give back nothing', () => {
  const t = thunderText('a.cpp', 'FMT_CONSTEXPR void on_abbr_weekday() { unsupported(); }\nFMT_FUNC void vprintln(std::FILE* f, string_view fmt) {\n  print(f, fmt);\n}\nstruct B {\n  FMT_CONSTEXPR20 ~B() { deallocate(); }\n};\n');
  assert.doesNotMatch(t, /You get back/);
});

test('fmt#6/#8/json#12: the type after a macro, and `auto f() -> T`, are what comes back', () => {
  const t = thunderText('a.cpp', 'FMT_CONSTEXPR auto get_foreground() const noexcept -> detail::color_type {\n  return style_ & 0x3FFFFFF;\n}\nJSON_HEDLEY_ALWAYS_INLINE std::size_t accumulate(const char* data) {\n  return 1;\n}\n');
  assert.match(t, /You get back: detail::color_type/);
  assert.doesNotMatch(t, /FMT_CONSTEXPR|JSON_HEDLEY/);
  assert.match(t, /Accumulate\n  You give it: data\n  You get back: a number/);
});

test('fmt#4: a brace-less if / else keeps each statement on its own side (they do not both run)', () => {
  const t = thunderText('a.cpp', "void on_full_month() {\n  if (is_classic_)\n    out_ = write(out_, tm_mon_full_name(tm_mon()));\n  else\n    format_localized('B');\n}\n");
  assert.equal(sideOf(t, /Ask: Is is classic set\?/, /Works out out from write/), 'yes');
  assert.equal(sideOf(t, /Ask: Is is classic set\?/, /Calls format localized/), 'no');
});

test('fmt#7/#11/#18: `using` declarations are not calls', () => {
  const t = thunderText('a.cpp', 'auto f(int n) -> int {\n  using traits = detail::fixed_buffer_traits;\n  using namespace detail;\n  using std::get;\n  return n;\n}\n');
  assert.doesNotMatch(t, /Calls using/);
});

test('fmt#7/#20: {fmt} calls are not "Writes a log or message" unless they print', () => {
  const t = thunderText('a.cpp', 'void f(int x) {\n  fmt::format_to(appender(buf), "{}", x);\n  auto utf8_message = fmt::detail::to_utf8<wchar_t>();\n  fmt::print("{}/{:>8}\\n", a, b);\n}\n');
  assert.doesNotMatch(t, /Writes a log or message, keeping|Writes a log or message  \(line 2\)/);
  assert.match(t, /Writes a log or message: "«a»\/«b as \{:>8\}»\\n"/);
});

test('fmt#10/#13: a check is its own condition, and its one statement stays under it', () => {
  const t = thunderText('a.cpp', 'int fpow(int base_exp, int n) {\n  while (n != 0) {\n    if ((n & 1) != 0) rexp += base_exp + fmul(r, base, r);\n    n >>= 1;\n  }\n  if (half < rem || ((uint64_t(q) & 1) && !(rem < half))) ++q;\n  if (!traits::is_normal(bin_exp)) [[FMT_ZMIJ_UNLIKELY]] {\n    if (bin_exp != 0) return write_inf_nan(buffer, bin_sig != 0);\n  }\n  return rexp;\n}\n');
  assert.doesNotMatch(t, /Ask: Fmul|Ask: Write inf nan|\[\[FMT_ZMIJ_UNLIKELY\]\]/);
  assert.equal(sideOf(t, /Ask: Is \(n & 1\) 0\?/, /rexp \+= base_exp/), 'no');
  assert.equal(sideOf(t, /Ask: Half is less than rem or/, /Adds one to q/), 'yes');
  assert.equal(sideOf(t, /Ask: Is bin exp 0\?/, /Gives back the result of write inf nan/), 'no');
});

test('fmt#13: a value written where a pointer points, `+=` of a call, and shifts are said as what they do (or shown)', () => {
  const t = thunderText('a.cpp', "char* w(char* buffer, int bits) {\n  *buffer = '-';\n  buffer += traits::is_negative(bits);\n  bin_sig = bin_sig << 4;\n  flags |= 4;\n  return buffer;\n}\n");
  assert.match(t, /Writes "-" where buffer points/);
  assert.match(t, /Adds the result of is negative to buffer/);
  assert.doesNotMatch(t, /whether bin_sig|Sets buffer to "-"|Works out buffer from is negative/);
  assert.match(t, /`bin_sig = bin_sig << 4;` \(code, not explained\)/);
  assert.match(t, /`flags \|= 4;` \(code, not explained\)/);
});

test('fmt#17: a statement that is a ternary is shown as code (both calls kept)', () => {
  const t = thunderText('a.cpp', 'void print(int x) {\n  detail::is_locking<T...>() ? fmt::vprint_buffered(file_, fmt, vargs) : fmt::vprint(file_, fmt, vargs);\n}\n');
  assert.doesNotMatch(t, /Calls is locking/);
  assert.match(t, /\(code, not explained\)/);
});

test('fmt#1: a call with nested template arguments keeps its name', () => {
  const t = thunderText('a.cpp', 'auto push(const Arg& arg) -> const T& {\n  auto new_node = std::unique_ptr<typed_node<T>>(new typed_node<T>(arg));\n  return new_node;\n}\n');
  assert.doesNotMatch(t, /ptr>/);
});

test('json#1: #if / #elif alternatives say which build they belong to; printf text keeps its literal and shows the value', () => {
  const t = thunderText('a.cpp', 'int main()\n{\n#if defined(_LIBCPP_VERSION)\n    std::printf("libc++, _LIBCPP_VERSION=%d", _LIBCPP_VERSION);\n#elif defined(__GLIBCXX__)\n    std::printf("libstdc++ %5.2f", __GLIBCXX__);\n#else\n    std::printf("unknown");\n#endif\n}\n');
  assert.match(t, /Writes a log or message: "libc\+\+, _LIBCPP_VERSION=«_LIBCPP_VERSION»" \(only in builds where `#if defined\(_LIBCPP_VERSION\)`\)/);
  assert.match(t, /"libstdc\+\+ «__GLIBCXX__ as %5\.2f»" \(only in builds where `#elif defined\(__GLIBCXX__\)`\)/);
  assert.match(t, /"unknown" \(only in builds where `#else of #if defined\(_LIBCPP_VERSION\)`\)/);
});

test('json#2/#4: cout shows its text with the values as placeholders; printf that cannot be paired is shown as code', () => {
  const t = thunderText('a.cpp', 'int main()\n{\n    std::cout << "serialization: " << j << \'\\n\';\n    printf("%s and %s", only_one);\n}\n');
  assert.match(t, /Writes a log or message: "serialization: «j»\\n"/);
  assert.match(t, /`printf\("%s and %s", only_one\);` \(code, not explained\)/);
});

test('json#5: `object += value` adds to it', () => {
  const t = thunderText('a.cpp', 'int main()\n{\n    object += json::object_t::value_type("four", 4);\n}\n');
  assert.match(t, /Adds the result of value type to object/);
  assert.doesNotMatch(t, /Works out object/);
});

test('json#10: `p != nullptr` reads "is set" (the gate knows nullptr is the empty pointer)', () => {
  const t = thunderText('a.cpp', 'void save() {\n  if (token_segment != nullptr) { token_segment = nullptr; }\n}\n');
  assert.match(t, /Ask: Is token segment set\?/);
});

test('json#12/#14: a break inside a check is a step, so the loop does not just "continue"', () => {
  const t = thunderText('a.cpp', 'std::size_t acc(const char* data, std::size_t i, std::size_t avail) {\n  while (avail - i >= 8) {\n    if (!is_eight_digits(v)) {\n      break;\n    }\n    i += 8;\n  }\n  return i;\n}\n');
  assert.equal(sideOf(t, /Ask: Is not eight digits\?/, /Leaves the loop/), 'yes');
  assert.doesNotMatch(t, /Yes: continue\n\s+No: continue/);
});
