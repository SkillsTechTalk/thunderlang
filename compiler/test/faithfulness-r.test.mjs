// Faithfulness for R: each case is a minimal copy of an httr or dplyr function graded C or D (misleading or false) in
// a hand review of 44 R samples. The sample is in the test name ("httr #16", "dplyr #22").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

const fn = (body, params = 'x') => `f <- function(${params}) {\n${body}\n}\n`;
const read = (body, params) => thunderText('a.R', fn(body, params));

test('text with values inside: literal parts exactly as written, values as «placeholders»', () => {
  // glue / cli: {x} is a value, {{ }} are literal braces; the names are not turned into words inside the quotes.
  const t = read('  msg <- glue("Results {bad} must be data frames, not {first_bad_class}. {{literal}}")\n  abort(msg)', 'bad');
  assert.match(t, /Sets msg to "Results «bad» must be data frames, not «first_bad_class»\. \{\{literal\}\}"/);
  // sprintf: each conversion paired with its argument; a width or precision is kept.
  const s = read('  message <- sprintf("%s (HTTP %d).%s %05.1f%%", reason, status, task, pct)');
  assert.match(s, /Sets message to "«reason» \(HTTP «status»\)\.«task» «pct as %05\.1f»%%"/);
  // sprintf with more conversions than arguments cannot be paired: not paraphrased.
  assert.doesNotMatch(read('  m <- sprintf("%s and %s", a)'), /Sets m to "/);
  // stop() and rlang::abort() do not fill in {…}; cli_abort() does.
  assert.match(read('  stop("No orders file at ", path)'), /Stop: an error: "No orders file at «path»"/);
  assert.match(read('  abort("`.locale` must be a string or `NULL`.")'), /Stop: an error: "`\.locale` must be a string or `NULL`\."/);
  assert.match(read('  cli::cli_abort("Can\'t find {.arg {arg}} in {x$name}.")'), /Stop: an error: "Can't find «\.arg \{arg\}» in «x\$name»\."/);
});

test('httr #15: cat keeps "\\r" and every space; sep = "" joins with nothing', () => {
  const t = read('  cat("\\rDownloading: ", bytes(now, digits = 2), "     ", sep = "", file = con)\n  TRUE');
  assert.ok(t.includes('Shows "\\rDownloading: «bytes(now, digits = 2)»     " (to con)'), t);
  // Without sep, cat puts a space between the parts.
  assert.ok(read('  cat("a", x)\n  TRUE').includes('Shows "a «x»"'));
});

test('httr #19 / dplyr #21: paste0 keeps how the pieces are joined, and nested text is shown as code', () => {
  assert.match(read('  paste0(names, "=", values, collapse = "&")'), /Gives back "«names»=«values»" \(each, joined with "&"\)/);
  // Say less: quoted text with quotes inside a value cannot be matched to the code exactly, so the step is code.
  assert.ok(read('  by <- paste0("c(", paste0(old, collapse = ", "), ")")').includes('`by <- paste0("c(", paste0(old, collapse = ", "), ")")` (code, not explained)'));
  assert.doesNotMatch(read('  by <- paste0("c(", paste0(old, collapse = ", "), ")")'), /\{\{/);
});

test('dplyr #4 / httr #12: a call with no arguments is not "with a value"; one value alone is said in words', () => {
  const t = read('  if (is.null(name) && missing(n)) {\n    abort(error_name_length_required())\n  }\n  use <- listener_endpoint()', 'name, n');
  assert.doesNotMatch(t, /with a value/);
  assert.match(t, /Stop: the error made by (running )?error name length required/);
});

test('httr #4: is.null is "NULL" (not "empty", which "" also is); exists() keeps where it looks', () => {
  const t = read('  if (is.null(type) || type == "") return("raw")\n  if (exists(mt$complete, parsers)) {\n    "parsed"\n  } else {\n    "raw"\n  }', 'type');
  assert.match(t, /Type is NULL or type is ""\?/);
  assert.equal(sideOf(t, /Type is NULL or type is ""\?/, /Gives back "raw"/), 'yes');
  assert.match(t, /The mt's complete exists in parsers\?/);
});

test('httr #6: rm(list = name, envir = pool) removes the variable named in name from pool', () => {
  const t = read('  if (exists(name, envir = handle_pool)) {\n    rm(list = name, envir = handle_pool)\n  }', 'name');
  assert.match(t, /removing the variables named in name from handle pool/);
  assert.doesNotMatch(t, /forget/i);
});

test('httr #7 / dplyr #7 / dplyr #17: names(x) <- v sets the names of x, not "the result of names"', () => {
  const t = read('  names(status) <- c("version", "status")[seq_along(status)]\n  rownames(labels) <- NULL\n  levels(.x) <- out\n  attr(x, "class") <- "a"\n  tokens[[token$hash()]] <- NULL');
  assert.match(t, /Sets the names of status to/);
  assert.match(t, /Sets the rownames of labels to nothing/);
  assert.match(t, /Sets the levels of \.?x to out/);
  assert.match(t, /Sets the "class" attribute of x to "a"/);
  assert.match(t, /Removes an item of tokens/);
  assert.doesNotMatch(t, /the result of (names|rownames|levels)/);
});

test('httr #16: a value kept inside a condition is named; a compound value keeps every clause', () => {
  const t = read('  if (!is.null(res <- perform_callback("request", req = req))) return(res)\n  needs <- refresh && resp$status_code == 401L &&\n    !is.null(req$auth_token) && req$auth_token$can_refresh()', 'req, refresh');
  assert.match(t, /Is the result of perform callback \(kept as res\) set\?/);
  assert.doesNotMatch(t, /null set/i);
  assert.match(t, /Sets needs to whether refresh and the resp's status code is 401 and the req's auth token is set and the result of can refresh on the req's auth token/);
});

test('the faithfulness gate: words that cannot account for a negation show the code instead', () => {
  // !(a && b) would read "not a or not b": two negations for the code's one. Shown as code, not paraphrased.
  const t = read('  if (!(is_ok(a) && b > 1)) stop("bad")', 'a, b');
  assert.match(t, /`!\(is_ok\(a\) && b > 1\)`\?/);
  // !length(x) is "how many x is 0", with the Stop on the right side.
  const l = read('  if (!length(funs)) {\n    funs <- other()\n  }', 'funs');
  assert.equal(sideOf(l, /Is how many funs 0\?/, /Works out funs from other/), 'yes');
});

test('dplyr #1: every argument is kept: is_string(locale, string = "C") is not is_string(locale)', () => {
  const t = read('  if (is.null(locale) || is_string(locale, string = "C")) {\n    return(NULL)\n  }', 'locale');
  assert.match(t, /is string \(locale, string = "C"\)/);
});

test('dplyr #9: deprecate_warn says what is deprecated, since when, and what to use', () => {
  const t = read('  lifecycle::deprecate_warn("1.0.0", I("`group_indices()` with no arguments"), "cur_group_id()", always = TRUE)\n  TRUE');
  assert.match(t, /Warns that "`group_indices\(\)` with no arguments" is out of date \(deprecated in "1\.0\.0"\); use "cur_group_id\(\)" instead/);
  assert.doesNotMatch(t, /"1\.0\.0" is out of date/);
});

test('dplyr #10: another name for a function is not "Sets x to x"', () => {
  const t = thunderText('a.R', 'is.grouped_df <- function(x) inherits(x, "grouped_df")\nis_grouped_df <- is.grouped_df\n');
  assert.match(t, /Makes is_grouped_df another name for is\.grouped_df/);
});

test('dplyr #13: x <- switch(…) sets x in each case, not "Calls c"', () => {
  const t = read('  condition <- switch(\n    bounds,\n    "[]" = c(">=", "<="),\n    "()" = c(">", "<")\n  )\n  condition', 'bounds');
  assert.match(t, /When it is "\[\]":\n\s+- Sets condition to the list ">=" and "<="/);
  assert.doesNotMatch(t, /Calls c/);
});

test('dplyr #22: x <- if (a) FALSE else NA sets x on each side', () => {
  const t = read('  missing <- if (na_rm) FALSE else NA\n  missing', 'na_rm');
  assert.equal(sideOf(t, /Na rm\?/, /Sets missing to no/), 'yes');
  assert.equal(sideOf(t, /Na rm\?/, /Sets missing to missing \(NA\)/), 'no');
  assert.doesNotMatch(t, /Works out no/);
});

test('dplyr #15 / #14: a named argument keeps its value: shift(n = -n) is not shift(n)', () => {
  const t = thunderText('a.R', 'shift <- function(x, n) x\nlead <- function(x, n = 1L) {\n  shift(x, n = -n)\n}\n');
  assert.match(t, /running shift with x and n = minus n/);
});

test('dplyr #20: index && is_slice_call(…) keeps both clauses', () => {
  const t = read('  if (index && is_slice_call(error_call)) {\n    a()\n  } else {\n    b()\n  }', 'index, error_call');
  assert.match(t, /index and is slice call \(error call\)\?/i);
});

// httr #13 / #16: `app` and `req` are inputs of ordinary R functions (oauth_signature, request_perform). They are
// framework plumbing only in a web handler (a plumber route). This needs read.mjs to mark plumbing only for routes.
{
  const t = read('  app$key', 'url, app, req');
  const shown = /You give it: url, app, req/.test(t);
  test('httr #13 / #16: app and req are inputs of a plain function', { todo: shown ? false : 'read.mjs marks req/app as plumbing in every R function' }, () => {
    assert.match(t, /You give it: url, app, req/);
  });
}

// dplyr #20 in the picture: when the file defines is_slice_call, the question must still ask both clauses, not
// replace the whole compound with the rule's name. This needs model.mjs to use a rule's name only when the condition
// is that one call (askedByRule, from fix/faithfulness).
{
  const t = thunderText('a.R', 'is_slice_call <- function(x) TRUE\ng <- function(index, error_call) {\n  if (index && is_slice_call(error_call)) {\n    a()\n  }\n  1\n}\n');
  const kept = /index and is slice call/i.test(t);
  test('dplyr #20: a compound question is not replaced by the name of a rule it calls', { todo: kept ? false : 'model.mjs asks a compound condition by the rule name it calls (port askedByRule)' }, () => {
    assert.match(t, /index and is slice call \(error call\)\?/i);
  });
}
