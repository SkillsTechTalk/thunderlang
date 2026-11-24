// Run with: npm run site:test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLang, tokenizeSource, sourceLines } from "./source-tokens.mjs";

/** "cls:text" for every colored token, so a test can say what a reader should see colored. */
const colored = (src, lang) => tokenizeSource(src, lang).filter((t) => t.cls && t.cls !== "syn-punc" && t.cls !== "syn-op").map((t) => `${t.cls.slice(4)}:${t.text}`);

const SAMPLES = {
  python: '@router.post("/refunds")\ndef refund(order, amount: int) -> str:\n    """Docs."""\n    if amount > 30:  # late\n        raise HTTPException(409, f"Late {order.id} {{x}}")\n    return None',
  typescript: "export function fee(days: number): string {\n  /* a\n  b */ return `late ${days * 2}`; // c\n}",
  javascript: "const fee = (d) => d > 30 ? 'late' : null;",
  java: "@Override\npublic int fee(int days) { char c = 'a'; return 0; }",
  csharp: "[HttpPost]\npublic decimal Fee(int days) => $\"{days} days\" + @\"C:\\x\";",
  go: "func (s *Store) Borrow(id int) error {\n\treturn fmt.Errorf(`raw\n%d`, id)\n}",
  rust: "#[derive(Debug)]\npub fn fee<'a>(d: &'a str) -> Result<u32, String> { println!(\"{}\", 'x'); Ok(1_000) }",
  kotlin: "fun fee(days: Int): String = \"late $days ${days * 2}\"",
  php: "#[Route('/x')]\nfunction fee($days) { return \"late $days\"; } # c",
  ruby: "def borrow!(book)\n  raise Error, \"no #{book.title}\" unless @shelf.include?(book)\n  :ok\nend",
  sql: "SELECT COUNT(*) AS n FROM loans WHERE note = 'it''s' AND \"user id\" > 0 -- late",
  r: "late_fee <- function(days) {\n  if (days > 7) return(\"BigFee\") # late\n  NULL\n}",
  shell: "deploy() {\n  cd $HOME && echo $# ${#ARGS[@]}\n  if [[ -z \"$1\" ]]; then echo \"no ${ENV}\" >&2; exit 1; fi # check\n}",
  powershell: "<# .SYNOPSIS\nFee #>\nfunction Get-Fee([int]$Days) {\n  if ($Days -gt 7) { return 'Big' } # late\n}",
};

test("tokens always join back to the exact source, for every language", () => {
  for (const [lang, src] of Object.entries(SAMPLES)) {
    assert.equal(tokenizeSource(src, lang).map((t) => t.text).join(""), src, lang);
    assert.equal(sourceLines(src, lang).map((l) => l.map((t) => t.text).join("")).join("\n"), src, lang);
  }
});

test("language comes from a name, a file name, or a label", () => {
  assert.equal(sourceLang("Python"), "python");
  assert.equal(sourceLang("library.py"), "python");
  assert.equal(sourceLang("Python, orders.py"), "python");
  assert.equal(sourceLang("src/App.tsx"), "typescript");
  assert.equal(sourceLang("C#"), "csharp");
  assert.equal(sourceLang("Loans.kt"), "kotlin");
  assert.equal(sourceLang("schema.sql"), "sql");
  assert.equal(sourceLang("orders.R"), "r");
  assert.equal(sourceLang("deploy.sh"), "shell");
  assert.equal(sourceLang("Shell (Bash)"), "shell");
  assert.equal(sourceLang("Release.ps1"), "powershell");
  assert.equal(sourceLang("notes.txt"), null);
  assert.deepEqual(tokenizeSource("x = 1", "notes.txt"), [{ text: "x = 1" }]);
});

test("Python: decorators, def names, docstrings, f-string parts, comments, classes", () => {
  const c = colored(SAMPLES.python, "python");
  for (const want of ["dec:@router.post", "kw:def", "fn:refund", 'str:"""Docs."""', "ctl:if", "com:# late", "type:HTTPException", 'str:f"Late ', "const:None", "type:int"]) assert.ok(c.includes(want), want);
  assert.ok(!c.includes("str:order"), "the {order.id} part of an f-string is code, not text");
});

test("block comments and template strings keep their color across lines", () => {
  const lines = sourceLines(SAMPLES.typescript, "typescript");
  assert.deepEqual(lines[1].find((t) => t.text.startsWith("/*")), { text: "/* a", cls: "syn-com" });
  assert.deepEqual(lines[2][0], { text: "  b */", cls: "syn-com" });
  const go = sourceLines(SAMPLES.go, "go");
  assert.equal(go[2][0].cls, "syn-str");
});

test("each language's own forms", () => {
  assert.ok(colored(SAMPLES.java, "java").includes("dec:@Override"));
  assert.ok(colored(SAMPLES.csharp, "csharp").includes("dec:HttpPost"));
  assert.ok(colored(SAMPLES.csharp, "csharp").includes("fn:Fee"));
  assert.ok(colored(SAMPLES.go, "go").includes("fn:Errorf"));
  const rs = colored(SAMPLES.rust, "rust");
  for (const want of ["dec:#[derive(Debug)]", "type:'a", "fn:println!", "str:'x'", "num:1_000"]) assert.ok(rs.includes(want), want);
  assert.ok(colored(SAMPLES.kotlin, "kotlin").includes("var:$days"));
  assert.ok(colored(SAMPLES.php, "php").includes("var:$days"));
  assert.ok(colored(SAMPLES.php, "php").includes("com:# c"));
  const rb = colored(SAMPLES.ruby, "ruby");
  for (const want of ["fn:borrow!", "var:@shelf", "const::ok", "ctl:unless", "ctl:end"]) assert.ok(rb.includes(want), want);
  const sql = colored(SAMPLES.sql, "sql");
  for (const want of ["kw:SELECT", "fn:COUNT", "str:'it''s'", "ctl:AND", "com:-- late"]) assert.ok(sql.includes(want), want);
  assert.ok(!sql.some((t) => t.includes("user id")), "a quoted SQL name is not a string");
  const r = colored(SAMPLES.r, "orders.R");
  for (const want of ["kw:function", "ctl:if", "ctl:return", 'str:"BigFee"', "com:# late", "const:NULL"]) assert.ok(r.includes(want), want);
  const sh = colored(SAMPLES.shell, "deploy.sh");
  for (const want of ["ctl:if", "ctl:then", "ctl:fi", "var:$HOME", "var:$#", "var:${#ARGS[@]}", "com:# check", "ctl:exit"]) assert.ok(sh.includes(want), want);
  assert.ok(!sh.some((t) => t.startsWith("com:#\"")), "$# is not a comment");
  const ps = colored(SAMPLES.powershell, "Release.ps1");
  for (const want of ["com:<# .SYNOPSIS\nFee #>", "kw:function", "var:$Days", "ctl:if", "ctl:return", "str:'Big'", "com:# late"]) assert.ok(ps.includes(want), want);
});

test("deterministic: the same input always gives the same tokens", () => {
  for (const [lang, src] of Object.entries(SAMPLES)) assert.deepEqual(tokenizeSource(src, lang), tokenizeSource(src, lang));
});
