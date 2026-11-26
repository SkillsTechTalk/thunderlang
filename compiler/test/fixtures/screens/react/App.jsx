import { useState } from 'react';
import { Cart } from './Cart';

export default function App() {
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);

  function checkout() {
    setItems([]);
  }

  return (
    <main>
      <h1>Shop</h1>
      {user ? <p>Hello, {user.name}</p> : <button onClick={() => setUser({ name: 'Ada' })}>Sign in</button>}
      <Cart items={items} onCheckout={checkout} />
      <SignupForm />
    </main>
  );
}

const SignupForm = () => {
  const [email, setEmail] = useState('');
  const submit = (e) => {
    e.preventDefault();
    register(email);
  };
  return (
    <form onSubmit={submit}>
      <label>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Sign up</button>
      {renderFooter({ email })}
    </form>
  );
};
