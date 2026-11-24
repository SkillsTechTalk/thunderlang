// Reading gaps: functions inside functions (React hooks, callbacks, closures, inner defs), `if` / `match` / `when`
// used as a value, `do … while`, Go `select` and `fallthrough`. Each reads as plain steps instead of code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { classifyStatement } from '../src/steps.mjs';
import { flowOf } from '../src/model.mjs';

const byName = (r, name) => r.items.find((i) => i.name === name);
const said = (steps) => (steps || []).map((s) => s.says);
const all = (steps) => (steps || []).flatMap((s) => [s, ...all(s.children), ...all(s.otherwise)]);

const REACT = `export function Profile({ userId, onSave }) {
  const [user, setUser] = useState(null);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!userId) return;
    fetch(\`/api/users/\${userId}\`).then((r) => r.json()).then(setUser);
  }, [userId]);
  React.useEffect(() => {
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  useEffect(() => {
    console.log('render');
  });
  const fullName = useMemo(() => {
    if (!user) return '';
    return user.first + ' ' + user.last;
  }, [user]);
  const total = useMemo(() => price * count, [price, count]);
  const handleSave = useCallback(async () => {
    if (!draft) {
      setError('Name is required');
      return;
    }
    await onSave(draft);
  }, [draft, onSave]);
  function handleChange(event) {
    if (event.target.value.length > 40) return;
    setDraft(event.target.value);
  }
  items.forEach(({ id, done }) => {
    if (done) count++;
  });
  return <form onSubmit={handleSave}>{fullName}</form>;
}
`;

test('React effects say when they run, and their steps are read', () => {
  const p = byName(readCode(REACT, { language: 'typescript' }), 'Profile');
  const [first, second, third] = p.steps.slice(2, 5);
  assert.equal(first.says, 'When this first shows on screen, and whenever user id changes');
  assert.deepEqual(said(first.children), ['If user id is not set', 'Calls another service over HTTP']);
  assert.equal(first.nested, true);
  assert.equal(second.says, 'When this first shows on screen');
  assert.equal(second.children.at(-1).says, 'When this is taken off the screen, cleans up');
  assert.equal(second.children.at(-1).children.length, 1);
  assert.equal(third.says, 'Every time this is drawn on screen');
  assert.deepEqual(said(third.children), ['Writes a log or message: render']);
});

test('useMemo remembers a value; useCallback and inner functions define how something works', () => {
  const p = byName(readCode(REACT, { language: 'typescript' }), 'Profile');
  const memo = p.steps.find((s) => /full name/.test(s.says));
  assert.equal(memo.says, 'Works out full name and remembers it until user changes');
  assert.ok(!memo.restates);
  assert.deepEqual(said(memo.children), ['If user is not set', 'Returns text built from its parts']);
  const total = p.steps.find((s) => /^Works out total/.test(s.says));
  assert.equal(total.says, 'Works out total and remembers it until price or count changes');
  assert.equal(total.children[0].kind, 'return');
  const save = p.steps.find((s) => /handle save/.test(s.says));
  assert.equal(save.says, 'Defines how handle save works');
  assert.deepEqual(said(save.children), ['If draft is not set', 'Calls on save']);
  const change = p.steps.find((s) => /handle change/.test(s.says));
  assert.equal(change.says, 'Defines a helper, handle change');
  assert.equal(change.children.length, 2);
  // A callback with destructured parameters reads its body, not its parameters.
  const loop = p.steps.find((s) => s.kind === 'loop');
  assert.deepEqual(said(loop.children), ['If done is set']);
  assert.equal(loop.children[0].children[0].says, 'Adds one to count');
});

test('item ids stay the same; every step points inside the function and the whole body is covered', () => {
  const r = readCode(REACT, { language: 'typescript' });
  assert.deepEqual(r.items.filter((i) => i.kind === 'function').map((i) => i.id), ['Profile:1', 'handleChange:29']);
  const p = byName(r, 'Profile');
  assert.equal(p.anchor.coverage, 1);
  for (const s of all(p.steps)) assert.ok(s.span.startLine >= 1 && s.span.endLine <= 37 && s.span.startLine <= s.span.endLine, s.says);
  const lines = REACT.split('\n');
  const effectIf = p.steps[2].children[0];
  assert.match(lines[effectIf.span.startLine - 1], /if \(!userId\) return;/);
  assert.equal(REACT.slice(effectIf.span.start, effectIf.span.end), 'if (!userId) return');
});

test('a picture can still be drawn from nested steps', () => {
  const p = byName(readCode(REACT, { language: 'typescript' }), 'Profile');
  const flow = flowOf(p.steps);
  assert.ok(flow.nodes.some((n) => n.text === 'When this first shows on screen, and whenever user id changes'));
  assert.ok(flow.nodes.some((n) => /user id/.test(n.text) && n.kind === 'decision'));
});

test('callbacks: timers, events and promises say when their steps run; other calls keep their steps', () => {
  const src = `function wire(button, api) {
  setTimeout(() => {
    close();
  }, 300);
  button.addEventListener('click', (e) => {
    if (e.shiftKey) select();
  });
  api.load(id).then((data) => {
    render(data);
  });
  describeThing('x', function () {
    run();
  });
  return new Promise((resolve, reject) => {
    if (!api) reject(new Error('no api'));
    resolve(api);
  });
}
`;
  const w = byName(readCode(src, { language: 'javascript' }), 'wire');
  assert.deepEqual(said(w.steps), ['After 300 milliseconds', 'Whenever "click" happens', 'When load is done', 'Calls describe thing with these steps', 'Makes a new Promise with these steps', 'Returns a new Promise']);
  assert.deepEqual(said(w.steps[1].children), ["If the e's shift key is set"]);
  assert.equal(w.steps[4].children.length, 2);
});

test('Go: goroutines, deferred functions and function values are read', () => {
  const src = `package main

func worker(ch chan string) {
	defer func() {
		if r := recover(); r != nil {
			log.Println("recovered")
		}
	}()
	go func() {
		for v := range ch {
			process(v)
		}
	}()
	keep := func(s string) bool {
		return s != ""
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Age < items[j].Age
	})
}
`;
  const w = byName(readCode(src, { language: 'go' }), 'worker');
  assert.deepEqual(said(w.steps), ['At the end, runs these steps', 'Starts these steps running alongside, without waiting for them', 'Defines how keep works', 'Calls slice with these steps']);
  assert.ok(w.steps.every((s) => s.children?.length), 'each one shows its own steps');
  assert.ok(!all(w.steps).some((s) => s.kind === 'other'), 'the () that runs the function is not a step of its own');
});

test('Python: an inner def and a with block show their steps; a comprehension filter is not an if', () => {
  const src = `def outer(items, path):
    def keep(item):
        if item.hidden:
            return False
        return True

    with open(path) as fh:
        if fh.closed:
            raise ValueError("closed")
    return [i for i in items if keep(i)]
`;
  const o = byName(readCode(src, { language: 'python' }), 'outer');
  assert.equal(o.steps[0].says, 'Defines a helper, keep');
  assert.equal(o.steps[0].children.length, 2);
  assert.equal(o.steps[1].says, 'Opens a file as fh');
  assert.equal(o.steps[1].children[0].children[0].says, 'Fails with ValueError: "closed"');
  assert.equal(o.steps[2].kind, 'return');
  assert.equal(o.steps[2].says, 'Returns the items in items where keep(i)');
});

test('Kotlin: lambdas and safe calls', () => {
  const src = `fun send(order: Order, user: User?) {
    user?.let {
        notify(it)
    }
    order.items.forEach { item ->
        if (item.free) count++
    }
    scope.launch {
        if (order.paid) post(order)
    }
    repeat(3) {
        ping()
    }
}
`;
  const s = byName(readCode(src, { language: 'kotlin' }), 'send');
  assert.deepEqual(said(s.steps), ['If user is set', 'For each item in items', 'Calls launch with these steps', 'Repeats 3 times']);
  assert.deepEqual(said(s.steps[1].children), ['If the item\'s free is set'], 'the lambda parameter is not a step');
});

test('if as a value reads like a ternary (Kotlin, Rust, Ruby, Scala-style)', () => {
  assert.equal(classifyStatement('val discount = if (order.total > 100) 10 else 0').says, 'Sets discount to 10 if order.total is more than 100, otherwise 0');
  assert.equal(classifyStatement('let bonus = if score > 90 { 5 } else { 0 };').says, 'Sets bonus to 5 if score is more than 90, otherwise 0');
  assert.equal(classifyStatement('rate = if order.express then 10 else 2 end').says, "Sets rate to 10 if the order's express is set, otherwise 2");
  assert.equal(classifyStatement('return if (discount > 0) order.total - discount else order.total').says, "Returns the order's total minus discount if discount is more than 0, otherwise total");
  // The ternary forms are unchanged.
  assert.equal(classifyStatement('const n = retry ? 3 : 0;').says, 'Sets n to 3 if retry is set, otherwise 0');
});

test('an if, match or when over several lines that gives a value reads as the question, each side setting the value', () => {
  const kt = `fun label(user: User?, n: Int): String {
    val name = if (user == null) {
        log("guest")
        "Guest"
    } else {
        user.name
    }
    val size = when (n) {
        0 -> "empty"
        1, 2 -> "few"
        in 3..9 -> "some"
        else -> "many"
    }
    return name + size
}
`;
  const k = byName(readCode(kt, { language: 'kotlin' }), 'label');
  assert.equal(k.steps[0].kind, 'branch');
  assert.deepEqual(said(k.steps[0].children), ['Writes a log or message: guest', 'Sets name to "Guest"']);
  assert.deepEqual(said(k.steps[0].otherwise), ['Sets name to name']);
  assert.equal(k.steps[1].says, 'Chooses by n');
  assert.deepEqual(said(k.steps[1].children), ['When it is 0', 'When it is 1 or 2', 'When it is from 3 to 9', 'Otherwise']);
  assert.deepEqual(k.steps[1].children.map((a) => a.children[0].says), ['Sets size to "empty"', 'Sets size to "few"', 'Sets size to "some"', 'Sets size to "many"']);

  const rs = `pub fn grade(score: u32, cmd: Cmd) -> &'static str {
    let label = match score {
        0..=49 => "fail",
        50..=79 => "pass",
        _ => "great",
    };
    match cmd {
        Cmd::Start => start(),
        Cmd::Stop | Cmd::Halt => {
            log("stop");
            stop();
        }
        _ => {}
    }
    label
}
`;
  const g = byName(readCode(rs, { language: 'rust' }), 'grade');
  assert.equal(g.steps[0].says, 'Chooses by score');
  assert.deepEqual(said(g.steps[0].children), ['When it is from 0 to 49', 'When it is from 50 to 79', 'Otherwise']);
  assert.deepEqual(g.steps[0].children.map((a) => a.children[0].says), ['Sets label to "fail"', 'Sets label to "pass"', 'Sets label to "great"']);
  assert.deepEqual(said(g.steps[1].children), ['When it is start', 'When it is stop or halt', 'Otherwise']);
  assert.deepEqual(said(g.steps[1].children[1].children), ['Writes a log or message: stop', 'Calls stop']);

  const rb = `class Shop
  def fee(order)
    label = if order.paid?
      log("paid")
      "Paid"
    else
      "Due"
    end
    kind = case order.size
           when 0 then "none"
           else "some"
           end
    label
  end
end
`;
  const f = byName(readCode(rb, { language: 'ruby' }), 'fee');
  assert.equal(f.steps[0].says, 'If order is paid');
  assert.deepEqual(said(f.steps[0].children), ['Writes a log or message: paid', 'Sets label to "Paid"']);
  assert.deepEqual(said(f.steps[0].otherwise), ['Sets label to "Due"']);
  assert.deepEqual(said(f.steps[1].children), ['When it is 0']);
  assert.equal(f.steps[1].children[0].children[0].says, 'Sets kind to "none"');
  assert.deepEqual(said(f.steps[1].otherwise), ['Sets kind to "some"']);
});

test('do … while runs once, then repeats while its condition holds (JS, Java, C#, Kotlin, PHP)', () => {
  const cases = [
    ['javascript', 'function f() {\n  let n = 0;\n  do {\n    n++;\n  } while (n < 3);\n  return n;\n}\n'],
    ['java', 'class A {\n  int f() {\n    int n = 0;\n    do {\n      n++;\n    } while (n < 3);\n    return n;\n  }\n}\n'],
    ['csharp', 'class A {\n  public int f() {\n    var n = 0;\n    do {\n      n++;\n    } while (n < 3);\n    return n;\n  }\n}\n'],
    ['kotlin', 'fun f(): Int {\n    var n = 0\n    do {\n        n++\n    } while (n < 3)\n    return n\n}\n'],
    ['php', '<?php\nfunction f() {\n  $n = 0;\n  do {\n    $n++;\n  } while ($n < 3);\n  return $n;\n}\n'],
  ];
  for (const [language, src] of cases) {
    const f = byName(readCode(src, { language }), 'f');
    const loop = f.steps.find((s) => s.kind === 'loop');
    assert.equal(loop?.says, 'Runs once, then repeats while n is less than 3', language);
    assert.deepEqual(said(loop.children), ['Adds one to n'], language);
    assert.equal(f.steps.filter((s) => s.kind === 'loop').length, 1, `${language}: the while is part of the do`);
    assert.equal(f.anchor.coverage, 1, language);
  }
});

test('Go select waits for whichever channel is ready first; fallthrough and condition cases read plainly', () => {
  const src = `package main

func pick(ch chan string, ctx context.Context, out chan int) error {
	select {
	case msg := <-ch:
		handle(msg)
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(5 * time.Second):
		return errTimeout
	case out <- 1:
		log.Println("sent")
	}
	select {
	case msg, ok := <-ch:
		handle(msg)
	default:
		log.Println("nothing ready")
	}
	switch level {
	case 1:
		log.Println("one")
		fallthrough
	case 2:
		log.Println("one or two")
	}
	switch {
	case age > 65:
		return errOld
	}
	return nil
}
`;
  const p = byName(readCode(src, { language: 'go' }), 'pick');
  assert.equal(p.steps[0].says, 'Waits for whichever of these is ready first');
  assert.deepEqual(said(p.steps[0].children.filter((c) => c.caseLabel)), ['When msg arrives from ch', 'When ctx is cancelled or times out', 'When 5 seconds have passed', 'When 1 can be sent to out']);
  // What a case does is its own step, no longer folded into the case line.
  assert.deepEqual(said(p.steps[0].children.filter((c) => !c.caseLabel)), ['Calls handle', 'Returns the result of err', 'Returns err timeout', 'Writes a log or message: sent']);
  assert.equal(p.steps[1].says, 'Checks which of these is ready, without waiting');
  assert.deepEqual(said(p.steps[1].children.filter((c) => c.caseLabel)), ['When msg arrives from ch (or ch is closed)', 'If none is ready yet']);
  assert.deepEqual(said(p.steps[2].children), ['When it is 1', 'Writes a log or message: one', 'Carries on into the next case too', 'When it is 2', 'Writes a log or message: one or two']);
  assert.equal(p.steps[3].says, 'Checks these cases in order');
  assert.equal(p.steps[3].children[0].says, 'When age is more than 65');
});

test('a case label is its own statement in C-like switches, so the case\'s first step is shown', () => {
  const src = `function kind(x) {
  switch (typeof x) {
    case 'string':
      log('text');
      break;
    case 'number':
    case 'bigint':
      {
        log('number');
      }
      break;
    default:
      log('other');
  }
}
`;
  const k = byName(readCode(src, { language: 'javascript' }), 'kind');
  assert.deepEqual(said(k.steps[0].children), ["When it is 'string'", 'Writes a log or message: text', "When it is 'number'", "When it is 'bigint'", 'Writes a log or message: number', 'Otherwise', 'Writes a log or message: other']);
});
