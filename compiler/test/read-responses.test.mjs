// What a web handler sends back is what the person gets: "Returns user (201 Created)", never "Calls json".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement } from '../src/steps.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';

const says = (c) => classifyStatement(c).says;

test('successful responses in each framework say what is sent back, and the status when it is not a plain OK', () => {
  const cases = [
    ['res.json(user);', 'Returns user'],
    ['return res.json({ ok: true, user });', 'Returns ok and user'],
    ['res.status(201).json(order);', 'Returns order (201 Created)'],
    ['reply.send({ items });', 'Returns items'],
    ['res.sendStatus(204);', 'Returns nothing (204 No Content)'],
    ['res.render("profile", { user });', 'Shows the profile page'],
    ['ctx.body = user;', 'Returns user'],
    ['c.JSON(http.StatusOK, user)', 'Returns user'],
    ['return Ok(order);', 'Returns order'],
    ['return CreatedAtAction(nameof(Get), new { id = order.Id }, order);', 'Returns order (201 Created)'],
    ['return NoContent();', 'Returns nothing (204 No Content)'],
    ['return ResponseEntity.status(HttpStatus.CREATED).body(order);', 'Returns order (201 Created)'],
    ['return jsonify(user), 201', 'Returns user (201 Created)'],
    ['return JSONResponse(content=data, status_code=202)', 'Returns data (202 Accepted)'],
  ];
  for (const [code, want] of cases) assert.equal(says(code), want, code);
});

test('error responses in each framework are Stops with their status', () => {
  for (const [code, want] of [
    ['res.sendStatus(404);', 'Fails with 404 Not Found'],
    ['c.JSON(http.StatusNotFound, gin.H{"error": "missing"})', 'Fails with 404 Not Found'],
    ['return NotFound("No such order");', 'Fails with 404 Not Found: "No such order"'],
    ['return ResponseEntity.notFound().build();', 'Fails with 404 Not Found'],
  ]) { assert.equal(classifyStatement(code).kind, 'fail', code); assert.equal(says(code), want, code); }
});

test('Details: an Express handler that ends with res.json gives back what it sends', () => {
  const src = "app.get('/users/:id', async (req, res) => {\n  const { id } = req.params;\n  const user = await db.find(id);\n  if (!user) {\n    return res.status(404).json({ message: 'No such user' });\n  }\n  res.json(user);\n});";
  const m = thunderModel([{ path: 'users.ts', source: src }]);
  const d = readLevel(m, 'details', m.members[0].id);
  assert.deepEqual(d.givesBack.map((g) => [g.text, g.when.map((w) => `${w.question} ${w.answer}`)]), [['Gives back user', ['Is user set? Yes']]]);
  assert.deepEqual(d.stops.map((s) => s.error), ['404 Not Found']);
});
