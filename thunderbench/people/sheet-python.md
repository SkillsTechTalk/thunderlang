# ThunderBench reading sheet (Python)

Read each program, then answer its questions without running anything. Note the time you start and finish each program.

## 1. refund

```python
# When does a refund go through on its own, and when does a person look at it?

def decide_refund(amount, days_since_purchase, already_refunded):
    if already_refunded:
        return "review"
    if amount <= 100 and days_since_purchase <= 30:
        return "approve"
    return "review"
```

Started: ____  Finished: ____

1. A $100 refund, 12 days after purchase, never refunded before. What happens?

   Answer: ______________________

2. A $100.01 refund, 12 days after purchase, never refunded before. What happens?

   Answer: ______________________

3. A $20 refund, 31 days after purchase, never refunded before. What happens?

   Answer: ______________________

4. A $5 refund, 1 day after purchase, but the order was already refunded. What happens?

   Answer: ______________________

5. The company now approves refunds up to $150 on their own. Which line changes?

   Answer: ______________________

## 2. shipping

```python
# What does shipping cost?

def calculate_shipping(weight, express):
    cost = 5
    if weight > 10:
        cost = 15
    elif weight > 5:
        cost = 10
    if express:
        cost = cost * 2
    return cost
```

Started: ____  Finished: ____

1. A 4 kg parcel, standard delivery. What does shipping cost?

   Answer: ______________________

2. A 10 kg parcel, express delivery. What does shipping cost?

   Answer: ______________________

3. An 11 kg parcel, express delivery. What does shipping cost?

   Answer: ______________________

4. Express delivery should cost three times as much, not twice. Which line changes?

   Answer: ______________________

## 3. loyalty

```python
# How many loyalty points does an order earn?

def count_points(dollars_spent, member_years):
    points = dollars_spent
    if member_years >= 5:
        points = points * 2
    elif member_years >= 2:
        points = points + 10
    return points
```

Started: ____  Finished: ____

1. A customer of 1 year spends $40. How many points?

   Answer: ______________________

2. A customer of 2 years spends $40. How many points?

   Answer: ______________________

3. A customer of 5 years spends $40. How many points?

   Answer: ______________________

4. Long-time members should start at 3 years, not 5. Which line changes?

   Answer: ______________________

## 4. password

```python
# Is a password strong enough?

def check_password(password):
    if len(password) < 8:
        return "too short"
    if " " in password:
        return "no spaces allowed"
    if password == password.lower():
        return "add a capital letter"
    return "strong"
```

Started: ____  Finished: ____

1. What does it say about "sunshine12"?

   Answer: ______________________

2. What does it say about "Sun shine"?

   Answer: ______________________

3. What does it say about "Short1"?

   Answer: ______________________

4. What does it say about "Sunshine1"?

   Answer: ______________________

5. Passwords must now be at least 12 characters. Which line changes?

   Answer: ______________________

## 5. grades

```python
# The average of the scores that count, and the letter it earns.

def grade(scores):
    counted = [s for s in scores if s >= 0]
    if not counted:
        return "no scores"
    average = sum(counted) / len(counted)
    if average >= 90:
        return "A"
    if average >= 80:
        return "B"
    if average >= 70:
        return "C"
    return "F"
```

Started: ____  Finished: ____

1. Scores 95, 85, and -1 (a missed test). What grade?

   Answer: ______________________

2. Scores 79 and 80. What grade?

   Answer: ______________________

3. Only a missed test (-1). What grade?

   Answer: ______________________

4. A "B" should need 85, not 80. Which line changes?

   Answer: ______________________

## 6. invoice

```python
# What a customer pays: the items, a discount for big orders, then tax.
from decimal import Decimal, ROUND_HALF_UP

def total_invoice(prices, tax_rate):
    subtotal = sum(prices, Decimal("0"))
    if subtotal >= 200:
        subtotal = subtotal - subtotal * Decimal("0.10")
    tax = (subtotal * tax_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return subtotal + tax
```

Started: ____  Finished: ____

1. Items of $120.50 and $99.50, tax 7%. What does the customer pay?

   Answer: ______________________

2. One item of $19.99, tax 7%. What does the customer pay?

   Answer: ______________________

3. Items of $100 and $99.99, tax 10%. What does the customer pay?

   Answer: ______________________

4. The big-order discount should start at $250. Which line changes?

   Answer: ______________________

