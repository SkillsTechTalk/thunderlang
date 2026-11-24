// Faithfulness for shell: every case is a minimal copy of a function graded false (D) or misleading (C) in a hand
// review of nvm and neofetch samples; the sample is in the test name. Quoted text is kept exactly as written, each
// inserted value is a «placeholder» (docs/spec.md, "Text with values inside"), and anything Thunder cannot say
// exactly is shown as code rather than guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

const sh = (src) => thunderText('a.sh', src);

test('text with values inside: literal parts exactly as written, values as «placeholders»', () => {
  const t = sh('f() {\n  nvm_echo "${NVM_DIR}/alias"\n  nvm_err "Unexpected value \\"$NVM_METHOD\\" for \\$NVM_METHOD"\n  nvm_err "got ${1-} and $*"\n}\nnvm_echo() { :; }\nnvm_err() { :; }\n');
  assert.match(t, /"«NVM_DIR»\/alias"/);
  assert.match(t, /"Unexpected value \\"«NVM_METHOD»\\" for \\\$NVM_METHOD"/);
  assert.match(t, /"got «\$\{1-\}» and «\$\*»"/);
  assert.doesNotMatch(t, /\{nvm dir\}|\{all the inputs\}|\$\{1 \}/);
});

test('nvm #3 / #21 / neofetch #18: a path keeps its underscores and dots', () => {
  const t = sh('f() {\n  if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ]; then return 0; fi\n  if ! [ -e "/usr/lib/liblzma.so" ]; then return 1; fi\n  [[ -f "${XDG_CONFIG_HOME}/neofetch/config.conf" ]] && echo hi\n}\n');
  assert.match(t, /"\/proc\/sys\/fs\/binfmt_misc\/WSLInterop" exists/);
  assert.match(t, /"\/usr\/lib\/liblzma\.so" exists/);
  assert.match(t, /"«XDG_CONFIG_HOME»\/neofetch\/config\.conf"/);
  assert.doesNotMatch(t, /binfmt misc|the liblzma's so|the config's conf/);
});

test('nvm #5: " is " inside quoted text is not the question; awk\'s $4 is not an input', () => {
  const t = sh('f() {\n  local COMMAND\n  COMMAND="${1}"\n  if type "${COMMAND}" | nvm_grep -q "^${COMMAND} is an alias for"; then\n    INFO="$(type "${COMMAND}" | command awk \'{print $4}\')"\n  fi\n}\nnvm_grep() { :; }\n');
  assert.match(t, /"\^«COMMAND» is an alias for"/);
  assert.doesNotMatch(t, /Ask: Is running/);
  assert.doesNotMatch(t, /input 4/);
});

test('nvm #14 / neofetch #5 / #8 / #21: $1…$9 inside single quotes belong to awk, not to the function', () => {
  const t = sh('g() {\n  name="$(ps -p "${1:-$PPID}" | awk \'{printf $8}\')"\n  printf "%s" "$name"\n}\n');
  assert.match(t, /You give it: input 1\n/);
  assert.doesNotMatch(t, /input [2-8]/);
});

test('nvm #6: `wget --version` shows the version; it downloads nothing', () => {
  const t = sh('f() {\n  command wget --version 2>/dev/null | grep -q \'^GNU Wget \'\n}\n');
  assert.match(t, /Shows the version of wget/);
  assert.doesNotMatch(t, /Downloads/);
});

test('nvm #10 / #18 / neofetch #1 / #7: ${x#p}, ${x%%p}, ${x/a/b} say what they remove or replace', () => {
  const t = sh('f() {\n  VERSION="${VERSION#iojs-}"\n  CORE="${CORE%%-*}"\n  s=${s/.*}\n  term="${term/\\.app}"\n  u=${u// minutes/ mins}\n  n="${#pkgs[@]}"\n  x="${list[0]}"\n}\n');
  assert.match(t, /Sets version to version without "iojs-" at the start/);
  assert.match(t, /Sets core to core without the longest match of "-\*" at the end/);
  assert.match(t, /Sets s to s with the first match of "\.\*" removed/);
  assert.match(t, /Sets term to term with the first "\\\.app" removed/);
  assert.match(t, /Sets u to u with every " minutes" replaced by " mins"/);
  assert.match(t, /Sets n to how many items pkgs has/);
  assert.match(t, /Sets x to item 0 of list/);
  assert.doesNotMatch(t, /Sets (version|core|s|term|u) to \1 {2}\(line/);
});

test('defaults: ${x:-d} is "empty or not set", ${x-d} only "not set"; nested defaults keep their grouping', () => {
  const t = sh('f() {\n  A="${NVM_REPO:-nvm-sh/nvm}"\n  B="${B_SET-x}"\n  C="${S:-${O:-lts}}"\n}\n');
  assert.match(t, /Sets a to nvm repo, or "nvm-sh\/nvm" when it is empty or not set/);
  assert.match(t, /Sets b to b set, or "x" when it is not set/);
  assert.match(t, /Sets c to s, or \(o, or "lts" when it is empty or not set\) when it is empty or not set/);
});

test('nvm #16: flags keep their letters (-qE is not "-q e")', () => {
  const t = sh('f() {\n  if ! nvm_echo "${1-}" | nvm_grep -qE \'^v?[0-9]+$\'; then\n    return 55\n  fi\n}\nnvm_echo() { :; }\nnvm_grep() { :; }\n');
  assert.match(t, /"-qE"/);
  assert.doesNotMatch(t, /-q e/);
});

test('nvm #18: `a && b || c` runs c when a or b failed (the shell groups from the left)', () => {
  const t = sh('f() {\n  command rm -rf "${S}" && command mkdir -p "${S}" || return 1\n  echo done\n}\n');
  assert.equal(sideOf(t, /Ask: Deleting s .* fails or making the folder s .* fails\?/, /Gives back failure \(code 1\)/), 'yes');
  // `test && a || b` is if/else only when a cannot fail.
  const u = sh('g() {\n  [ -n "$x" ] && echo yes || echo no\n  [ -n "$x" ] && do_thing || echo failed\n}\ndo_thing() { :; }\n');
  assert.match(u, /Ask: Is x set\?/);
  assert.match(u, /X is empty or running do thing fails\?/);
});

test('nvm #18: find keeps its tests (`! -name .` is not "named .")', () => {
  const t = sh('f() {\n  TOP="$(command find "${S}/." ! -name . -prune)"\n}\n');
  assert.match(t, /finding the files in "«S»\/\." that match `! -name \. -prune`/);
  assert.doesNotMatch(t, /named "\."/);
});

test('neofetch #1 / #10 / #20: arithmetic Thunder cannot say exactly is shown as code', () => {
  const t = sh('f() {\n  s=$((${d:-0}*86400 + ${t#*:}))\n  ((++lines,${#line}>ascii_len)) && ascii_len="${#line}"\n  ((lines=lines>h?lines-h+1:1))\n  ((width=width/2,height=height/2))\n  ((packages+="${#pkgs[@]}"))\n  ((term_run == 1)) && return\n}\n');
  assert.match(t, /Works out s: `\$\(\(\$\{d:-0\}\*86400/);
  assert.match(t, /Ask: `\(\(\+\+lines,\$\{#line\}>ascii_len\)\)`\?/);
  assert.match(t, /`\(\(lines=lines>h\?lines-h\+1:1\)\)` \(code, not explained\)/);
  assert.match(t, /Sets width to width divided by 2; then sets height to height divided by 2/);
  assert.match(t, /Adds how many items pkgs has to packages/);
  assert.match(t, /Ask: Is term run 1\?/);
  assert.doesNotMatch(t, /plus plus|minus 0 times|divided by times/);
});

test('neofetch #1 / #9 / #21: $(< file) is the file\'s contents, not a script run', () => {
  const t = sh('f() {\n  s=$(< /proc/uptime)\n}\n');
  assert.match(t, /Sets s to the contents of "\/proc\/uptime"/);
  assert.doesNotMatch(t, /running the script/);
});

test('neofetch #7: case patterns are shown as written, each one its own', () => {
  const t = sh('f() {\n  case ${name} in\n    "${SHELL/*\\/}"|*"sh"|"screen"|"su"*) ;;\n    iPhone1,[1-2]|"iPod1,1") echo old ;;\n    \'\' | .*) return 1 ;;\n  esac\n}\n');
  assert.match(t, /When it matches `"\$\{SHELL\/\*\\\/\}"` or `\*"sh"` or `"screen"` or `"su"\*`/);
  assert.match(t, /When it matches `iPhone1,\[1-2\]` or `"iPod1,1"`/, 'a [..] pattern is a pattern, not a value');
  assert.match(t, /When it matches `''` or `\.\*`/);
});

test('neofetch #8: curl sends to the address, not to the value after --max-time', () => {
  const t = sh('f() {\n  public_ip="$(curl -L --max-time "$public_ip_timeout" -w \'\\n\' "$public_ip_host")"\n  x="$(wget -T "$t" -qO- "$public_ip_host")"\n}\n');
  assert.match(t, /sending a GET request to public ip host/);
  assert.match(t, /downloading public ip host/);
  assert.doesNotMatch(t, /request to public ip timeout|downloading t\b/);
});

test('neofetch #14 / #15: ${2:+: $2} and ${*//[[:space:]]/} keep what they add and remove', () => {
  const t = sh('f() {\n  string="${1}${2:+: $2}"\n  printf \'%s\\n\' "${*//[[:space:]]/}"\n  one="${2:+x}"\n}\n');
  assert.match(t, /Sets string to "«\$\{1\}»«\$\{2:\+: \$2\}»"/);
  assert.match(t, /Writes a message: "«\$\{\*\/\/\[\[:space:\]\]\/\}»\\n"/);
  assert.match(t, /Sets one to "x" when the second input is set and not empty, otherwise nothing/);
});

test('neofetch #20: printf -v sets a variable; printf pairs each conversion with its argument', () => {
  const t = sh('f() {\n  printf -v nlines "%${lines}s"\n  printf -v pad \'%5d\' "$n"\n  printf \'%s/alias %d\\n\' "$dir" "$n"\n  printf \'%s %s\\n\' "$@"\n}\n');
  assert.match(t, /`printf -v nlines "%\$\{lines\}s"` \(code, not explained\)/);
  assert.match(t, /Sets pad to the text "«n as %5d»"/);
  assert.match(t, /Writes a message: "«dir»\/alias «n»\\n"/);
  assert.match(t, /`printf '%s %s\\n' "\$@"` \(code, not explained\)/, '"$@" is many values: they cannot be paired');
  assert.doesNotMatch(t, /Writes a message: "nlines"/);
});

test('neofetch #3: read from <<< reads from that text; -a reads into a list', () => {
  const t = sh('f() {\n  IFS=$\'\\n\' read -d "" -ra pkgs <<< "$(ls)"\n}\n');
  assert.match(t, /Reads the list pkgs from the output of listing the files in "\." \(with ifs set to "\\n"\)/);
  assert.doesNotMatch(t, /what is typed in/);
});

test('a bare return or exit ends with the last command\'s code: success only right after one that worked', () => {
  const t = sh('f() {\n  cmd || return\n  [ -z "$x" ] && return\n  other\n  return\n}\ng() {\n  cmd || exit\n}\ncmd() { :; }\nother() { :; }\n');
  assert.match(t, /Gives back the failed command's exit code/);
  assert.match(t, /Gives back success/);
  assert.match(t, /Gives back the last command's exit code/);
  assert.match(t, /Stops the script here, with the failed command's exit code/);
  assert.doesNotMatch(t, /finished without errors/);
  assert.match(sh('h() {\n  false\n  return $?\n}\n'), /Gives back the last command's exit code/);
});

test('nvm #2 / head and tail keep their count (tail -1 is not "the last 10 lines")', () => {
  const t = sh('f() {\n  a="$(ls | tail -1)"\n  b="$(ls | head -n 3)"\n  c="$(ls | tail)"\n}\n');
  assert.match(t, /takes the last 1 lines/);
  assert.match(t, /takes the first 3 lines/);
  assert.match(t, /takes the last 10 lines/);
});

test('an input is named only after a plain $N (string="${2:-$1}" is not the second input\'s name)', () => {
  const t = sh('f() {\n  string="${2:-$1}"\n  echo "$string"\n}\n');
  assert.match(t, /You give it: input 1, input 2/);
  assert.match(t, /Takes string from the second input \(the first input when it is empty or not given\)/);
});
