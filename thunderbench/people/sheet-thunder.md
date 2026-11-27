# ThunderBench reading sheet (Thunder)

Read each program, then answer its questions without running anything. Note the time you start and finish each program.

## 1. refund

```thunder
# When does a refund go through on its own, and when does a person look at it?

To decide refund:
  Receive amount, days since purchase and already refunded
  When already refunded is true:
    Give "review"
  When amount is at most 100 and days since purchase is at most 30:
    Give "approve"
  Give "review"
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

```thunder
# What does shipping cost?

To calculate shipping:
  Receive weight and express
  Set cost to 5
  When weight is more than 10:
    Set cost to 15
  Otherwise when weight is more than 5:
    Set cost to 10
  When express is true:
    Set cost to cost * 2
  Give cost
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

```thunder
# How many loyalty points does an order earn?

To count points:
  Receive dollars spent and member years
  Set points to dollars spent
  When member years is at least 5:
    Set points to points * 2
  Otherwise when member years is at least 2:
    Set points to points + 10
  Give points
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

```thunder
# Is a password strong enough?

To check password:
  Receive password
  When the length of password is less than 8:
    Give "too short"
  When password contains " ":
    Give "no spaces allowed"
  When password is the lowercase of password:
    Give "add a capital letter"
  Give "strong"
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

```thunder
# The average of the scores that count, and the letter it earns.

To grade:
  Receive scores
  Set counted to an empty list
  For each score in scores:
    When score is at least 0:
      Add score to counted
  When counted is empty:
    Give "no scores"
  Set average to the average of counted
  When average is at least 90:
    Give "A"
  When average is at least 80:
    Give "B"
  When average is at least 70:
    Give "C"
  Give "F"
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

```thunder
# What a customer pays: the items, a discount for big orders, then tax.

To total invoice:
  Receive prices and tax rate
  Set subtotal to the sum of prices
  When subtotal is at least 200:
    Set subtotal to subtotal - 10% of subtotal
  Set tax to round (subtotal * tax rate) to 2 places
  Give subtotal + tax
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

