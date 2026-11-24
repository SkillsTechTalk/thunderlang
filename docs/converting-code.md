# Converting code between languages, with proof

Thunder describes what software **means**, whatever language it is written in. That makes it a bridge between
languages: read the old code into Thunder, write the new code, then check that the new code reads to the same
Thunder.

```
  Python app ──read──▶  THUNDER (meaning)  ──write──▶  Java app
                             ▲                            │
                             └──────── read back ◀────────┘
                        same Thunder?  same answers?  → proven conversion
```

## 1. The whole app in Thunder Text

```sh
thunder thunderize ./billing-service --out ./billing-thunder
thunder thunderize psf/requests --out ./requests-thunder
```

Every readable file becomes `<file>.thunder-text` in a mirror of the app's folders, and `APP.thunder-text` reads
the whole app from the top: its areas, its files, the actions (the doors into the app), and the rules. Anything
Thunder cannot read yet is listed under **Not read**, never dropped.

## 2. Check that the new code means the same

```sh
thunder same ./billing-python ./billing-java
```

```
Different meaning. 1 same, 1 different, 0 only in the old code, 0 only in the new code, 0 not checked.
  different   delivery_fee  (delivery.py:1 → Delivery.java:3)  Different answer for the total 20, the distance km 0: Free before, Standard after.
  same        order_total  (delivery.py:10 → Delivery.java:9)  Same 6 steps.
```

- **Functions are paired** by file name and function name, in any naming convention: `delivery_fee` in
  `delivery.py` pairs with `deliveryFee` in `delivery.ts`. When a file was renamed, a name that is unique on both
  sides still pairs.
- **Rules are compared by running them.** Both versions answer every edge case either rule mentions (each limit,
  one either side, and zero). Conditions written in a different order still count as the same. A changed limit is
  caught, with the exact inputs where the answers differ.
- **Steps are compared in order**, by what they do.
- **Unread code is never counted as the same.** If Thunder cannot read a function on either side, it is reported
  as *not checked*, and the verdict is *partly checked*, not *same*.
- The command exits with `0` only when the meaning is the same, so a conversion can be gated in CI.

## What this does and does not prove

`thunder same` proves that the parts Thunder can read have the same meaning: the same rules give the same
answers, and the same steps happen in the same order. It does not run the programs, check performance, or compare
how they use libraries. Steps are a summary, so two functions can read the same while differing in details Thunder
does not show yet, such as the exact arguments of a call. Treat *same* as strong evidence for the readable parts,
and keep your tests for the rest.

In OpenThunder, the Convert flow uses this check on every file an AI translates, and only accepts files whose
meaning is the same.
