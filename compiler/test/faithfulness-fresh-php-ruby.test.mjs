// Faithfulness for PHP and Ruby: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3
// (Slim, PHPMailer, jekyll, httparty). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('PHPMailer#1: `return md5($a . $b)` gives back what md5 makes, not "text built from its parts"', () => {
  const t = thunderText('a.php', '<?php\nclass S {\n    protected function hmac($data, $key)\n    {\n        $k = $key ^ $data;\n        return md5($k . pack(\'H*\', md5($k . $data)));\n    }\n}\n');
  assert.match(t, /Gives back the result of md5/);
  assert.doesNotMatch(t, /text built from its parts/);
});

test('Slim#7: a static `Factory::create()` with no values saves nothing', () => {
  const t = thunderText('a.php', '<?php\nclass App {\n    public function run($request = null): void\n    {\n        $creator = ServerRequestCreatorFactory::create();\n        $creator->go();\n    }\n}\n');
  assert.doesNotMatch(t, /Saves a new/);
});

test('jekyll#1: `(@cache[:k] ||= {})` gives back what is stored there, not a yes/no', () => {
  const t = thunderText('a.rb', 'class F\n  def relative_url(input)\n    return if input.nil?\n    cache = if input.is_a?(String)\n              (@context.registers[:site].filter_cache[:relative_url] ||= {})\n            else\n              (@context.registers[:cached_relative_url] ||= {})\n            end\n    cache[input] ||= compute(input)\n    cache[input].dup\n  end\nend\n');
  assert.doesNotMatch(t, /whether/);
  assert.doesNotMatch(t, /the context's registers/);
  assert.match(t, /Ask: Is input a String\?/);
  assert.match(t, /Gives back a copy of `cache\[input\]`/);
});

test('httparty#5: `reject` keeps the items that do not match (never "that match")', () => {
  const t = thunderText('a.rb', 'class R\n  def setup\n    h = h.reject { |name, _| name.to_s.casecmp?(\'authorization\') }\n    use(h)\n  end\nend\n');
  assert.match(t, /that do not match/);
});

test('httparty#5: a call written over several lines is one step', () => {
  const t = thunderText('a.rb', 'class R\n  def setup\n    body = Body.new(\n      options[:body],\n      force_multipart: options[:multipart]\n    )\n    use(body)\n  end\nend\n');
  assert.doesNotMatch(t, /`force_multipart/);
});
