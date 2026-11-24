// Common libraries read as what they do, with their arguments, across languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement } from '../src/steps.mjs';
import { sayLibraryCall } from '../src/libraries.mjs';

const says = (c) => classifyStatement(c).says;

test('ORMs: find, save, change, remove, in words with what they look for', () => {
  for (const [code, want] of [
    ['const user = await prisma.user.findUnique({ where: { id } });', 'Finds the user whose id is id'],
    ['await prisma.order.create({ data: { total, userId } });', 'Saves a new order'],
    ['return prisma.post.findMany({ where: { published: true } });', 'Finds the posts marked published, and gives them back'],
    ['user = User.objects.get(email=email)', 'Finds the user whose email is email'],
    ['orders = session.query(Order).filter(Order.user_id == user_id).all()', 'Finds the orders whose user id is user id'],
    ['session.commit()', 'Saves the changes to the database'],
    ['var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);', 'Finds the first user whose email is email, if there is one'],
    ['Optional<User> user = userRepository.findByEmailAndActive(email, true);', 'Finds the user whose email is email and marked active'],
    ['$user = User::where("email", $email)->first();', 'Finds the first user whose email is email'],
    ['@user = User.find_by(email: params[:email])', 'Finds the user whose email is the email it was sent'],
  ]) assert.equal(says(code), want, code);
});

test('HTTP clients name the method and the address', () => {
  assert.equal(says('const res = await fetch(`${API}/orders`, { method: "POST", body });'), 'Sends a POST request to …/orders');
  assert.equal(says('const { data } = await axios.get("/api/users");'), 'Sends a GET request to /api/users (as data)');
  assert.equal(sayLibraryCall('requests.post(url, json=payload)').says, 'Sends a POST request to the URL');
});

test('Go: an error check after a library call says what could not be done', () => {
  assert.equal(says('if err := db.First(&user, id).Error; err != nil {'), 'If it cannot find the first user whose id is id');
  assert.equal(says('if err := json.Unmarshal(body, &req); err != nil {'), 'If it cannot read the JSON into req');
});

test('tokens, passwords, caches, payments, background work', () => {
  assert.equal(says('const token = jwt.sign({ sub: user.id }, SECRET);'), 'Makes a sign-in token');
  assert.equal(says('const ok = await bcrypt.compare(password, user.passwordHash);'), 'Checks the password against its scrambled copy (as ok)');
  assert.equal(says('const charge = await stripe.paymentIntents.create({ amount, currency });'), 'Creates a Stripe payment intent (as charge)');
  assert.equal(says('send_welcome_email.delay(user.id)'), 'Starts send welcome email in the background');
  assert.equal(says('const now = Date.now();'), 'Sets now to the current time');
});

test('calls the catalog does not know are left to the general reader', () => {
  assert.equal(sayLibraryCall('doSomethingCustom(x)'), null);
});
