# DESIGN.md: Everyday-Things Rules

Rules every user-facing feature in this project must follow, including web, mobile, desktop, extensions, and user-facing command-line tools where applicable. They are adapted for software from Don Norman's *The Design of Everyday Things* (revised edition, 2013). The ideas are his; the wording and the software translations are ours.

**How to use this file**

- Read it before designing or building any user-facing feature.
- Run the checklist in section 7 and the review record in section 10 before a user-facing feature is called done. Attach the answers to the PR or implementation notes.
- Link this file from the project's contributor and AI-agent instructions so generated UI follows it too.
- Apply these interaction rules alongside existing product-specific visual guidance. Preserve product boundaries, platform conventions, and security, privacy, and authorization requirements. This document does not authorize an unrelated redesign or deployment.

---

## 0. The philosophy in one line

When a person cannot figure out how to use it, improve the design.

"User error" is a bug report. When users get confused, lost, or click the wrong thing, the fix is in the product, never in the user. Every rule below exists to close the gap between what the user *thinks* the product does and what it *actually* does.

---

## 1. The seven fundamental principles

A feature is not done until it satisfies all seven.

### 1.1 Discoverability
Users must be able to work out **what actions are possible** and **where and how to perform them** just by looking.

- Primary actions are visible on screen, not hidden behind hover, long-press, swipe, right-click, or a kebab menu.
- Keep the primary action visible. Secondary actions may live in clearly labeled menus or disclosure. If an expected action is unavailable, explain why near the control; do not reveal restricted actions or data just to explain them.
- Never rely on a tutorial, tooltip tour, or documentation to make a core action findable. If it needs a tutorial, it isn't discoverable.

Smell test: show the screen to a stranger and ask what they'd click to accomplish the main goal. If they hesitate for more than a few seconds, discoverability failed.

### 1.2 Feedback
Every action produces an **immediate, visible, informative** response.

- On click/tap: the control acknowledges it (pressed state) at once.
- Within about a second: something visibly changes, or a progress indicator appears.
- The feedback says *what happened*, not just *that something happened*. "Saved to Drafts" beats a green checkmark; a green checkmark beats nothing.
- Feedback is proportionate. Trivial actions get quiet feedback; destructive or irreversible ones get loud feedback. Too much feedback trains users to ignore all of it.
- Silence is never acceptable: no silent failures, no silent successes, no "did that submit?" moments.

### 1.3 Conceptual model
The product must project a **simple, coherent story of how it works** that matches how it actually works.

- Decide, in writing, what model the user should hold (e.g. "a Project is a folder; Members are the people with the key"). Every screen, label, and behavior reinforces that one model.
- Use one metaphor per concept. Don't call the same thing a workspace, a team, and an org in different screens.
- The *system image* (everything the user can see, touch, and read) is how the model is communicated. The designer's intentions don't count; only what's on screen does.
- If the real implementation is complicated, the interface still tells a simple, *true* story. Simplified is fine. Misleading is not.

### 1.4 Affordances
An affordance is **what the object lets the user do**. In software, what matters is the *perceived* affordance: does the user believe this thing can be clicked, dragged, typed into, expanded?

- Interactive things must look interactive. Non-interactive things must not.
- Don't make text look like a link unless it is one. Don't make a card look clickable unless the whole card is.
- Anti-affordances count: if a field is read-only, make it look read-only.

### 1.5 Signifiers
A signifier is the **visible cue that tells the user where to act and how**. Affordances are what's possible; signifiers are how the user finds out. Designers control signifiers.

- Every affordance that matters has a signifier: a button looks like a button, a drop zone has a dashed border and a label, a draggable row has a grip handle, a scrollable area shows a partial item at the edge.
- Labels are signifiers. Use verbs that name the outcome: "Send invoice", not "OK"; "Delete 3 photos", not "Confirm".
- Hidden gestures (swipe-to-delete, pinch, shake, keyboard-only shortcuts) are allowed only as *accelerators* for an action that also has a visible signifier.
- A signifier that lies (a button that doesn't do what its label says) is worse than no signifier.

### 1.6 Mappings
The relationship between a **control and its effect** must be natural: spatial, cultural, or logical.

- Controls sit next to, or on, the thing they affect. The "Edit" for a section lives in that section, not in a global toolbar.
- Order on screen matches the task and the user's locale. Follow platform and reading-direction conventions for steps, Back, and Next; keep the relationship between a control and its effect predictable.
- Groupings map to the model: settings that belong to the same concept live together.
- Use conventions the user already knows (red = danger, trash can = delete, Ctrl/⌘+Z = undo). Inventing a new convention costs the user learning time; make sure it's worth it.

### 1.7 Constraints
Constraints **limit the possible actions** so the right action becomes obvious and the wrong one becomes hard.

| Type | Meaning | Software example |
|---|---|---|
| Physical | The control limits invalid actions | A calendar with valid date bounds, plus validated typed entry |
| Cultural | Shared conventions | Dialog actions follow the platform's familiar ordering |
| Semantic | The meaning of the situation limits options | Can't "Ship" an order with no items; the button says why |
| Logical | Only one sensible option remains | Three fields, three errors, one left → it must be that one |

- Prefer preventing an invalid state where practical. Use sensible bounds and choices, while preserving valid typed or custom input. Validation remains necessary, and must explain how to recover.
- When you constrain, say why: "Add at least one item to ship" on the disabled button, not a mute grey button.

---

## 2. The seven stages of action (and the two gulfs)

Every interaction, from the user's side, runs through seven stages. Design each one.

```text
                      1. GOAL: "I want to ..."
                                 |
          EXECUTION              |             EVALUATION
  2. Plan: what are my options?   |   7. Compare: did it work?
  3. Specify: which action?       |   6. Interpret: what does it mean?
  4. Perform: do it               |   5. Perceive: what changed?
                    |            |            ^
                    +------ THE PRODUCT ------+
```

- **Gulf of execution**: the gap between what the user wants to do and what the product lets them figure out how to do. Closed by discoverability, signifiers, mappings, constraints, and a good conceptual model.
- **Gulf of evaluation**: the gap between what the product did and the user's ability to tell. Closed by feedback and a good conceptual model.

For each feature, answer these seven questions from the user's seat and write the answers down:

1. What do I want to accomplish?
2. What are my options?
3. What can I do right now?
4. How do I do it?
5. What just happened?
6. What does that mean?
7. Did I get what I wanted?

Any question that takes the user more than a glance to answer marks a gap to fix.

---

## 3. Knowledge in the world beats knowledge in the head

People operate with vague, imprecise knowledge, and that should be enough.

- **Recognition over recall.** Show the options; don't ask users to remember them. Menus over command lines, recent items over empty search boxes, previews over IDs.
- **Nothing to memorize.** No secret codes, no undocumented gestures, no "the second icon from the left is export."
- **Natural mappings and constraints remove the need to remember.** If the only sensible place to click is obvious, no instruction is needed.
- **Reminders live in the world.** Status, due dates, and next steps are shown where the user will look, not held in their memory.
- **Precision isn't required.** A user who half-remembers should still succeed: forgiving search, fuzzy matching, sensible defaults, autocomplete.

---

## 4. Design for error

People will slip, forget, and misunderstand. That is a given, not a defect. The product's job is to make errors hard to commit, easy to see, and easy to undo.

### 4.1 Know which kind of error you're designing against

| | Slip | Mistake |
|---|---|---|
| What went wrong | Right goal, wrong execution | Wrong goal or wrong plan |
| Typical user | Expert on autopilot | Novice with a wrong model |
| Example | Clicked "Archive" meaning "Delete" because they sit side by side | Thought "Archive" meant "back up," archived everything |
| Fix | Spacing, distinct looks, confirmation that names the object, undo | Better conceptual model, clearer labels, better feedback |

### 4.2 Rules
1. **Undo everything you can.** A visible, easy undo is better than any confirmation dialog. Soft-delete with a restore path by default.
2. **Confirmations must name the object.** "Delete *Q3-report.xlsx*?" with the item visible. A generic "Are you sure?" gets reflexively clicked and prevents nothing.
3. **Make dangerous actions physically distinct from safe ones.** Different color, different position, different shape. Never put "Delete" next to "Save" with the same styling.
4. **Sanity-check input.** Flag implausible values (a $1,000,000 coffee, a meeting in 1970) before accepting them.
5. **Minimize modes; make the ones you keep visible.** If the same click does different things depending on state, the state must be impossible to miss.
6. **Make similar things look different.** Two screens that look alike invite the user to act on the wrong one.
7. **Use forcing functions for irreversible actions:**
   - *Interlock*: required steps happen in order (review → confirm → execute).
   - *Lock-in*: prevent leaving mid-action without saving or discarding on purpose.
   - *Lock-out*: keep the user out of a dangerous area unless they explicitly opt in.
8. **Layer the defenses.** Assume any single safeguard will be bypassed; have several (constraint + distinct styling + named confirmation + undo).
9. **Treat the error as an approximation, not a failure.** "Did you mean …?", keep the user's partial input, correct gently.
10. **Make errors visible and interpretable.** Say what's wrong, where, and what to do next, in the user's language.

### 4.3 Error-message rules
- Say what happened and what to do next. Include the cause or consequence when it helps the user act; keep routine messages concise.
- Place the message next to the problem, not in a global banner.
- Never blame the user. "That email address isn't in the right format": not "Invalid input" or "You entered it wrong."
- No codes or jargon in the user-facing text. Put the code in a details expander for support.
- Keep the user's work. Never clear a form on error.

---

## 5. Human-centered design process

Don't design the solution before you've found the right problem.

```
   Find the right PROBLEM            Find the right SOLUTION
      ◇──────────◇                      ◇──────────◇
   diverge    converge               diverge    converge
   (explore)  (define)               (ideate)   (test)
```

Loop, for every feature, as many times as needed:

1. **Observe**: watch real users do the real task. Don't ask what they want; watch what they struggle with.
2. **Ideate**: generate many options before picking one. Ask "why" until you reach the root need, not the stated request.
3. **Prototype**: cheap and fast. Paper, clickable mock, feature flag. Build the minimum that tests the assumption.
4. **Test**: start with a small round of representative users doing the task unaided, then iterate. Observe where they hesitate, misclick, or ask a question. A fixed participant count is not proof that every usability issue is found.

Rules:
- Design around the **activity** (what the user is trying to accomplish end-to-end), not the task list or the data model.
- Fit the product to the person. Never ship something that requires users to adapt to the product.
- Log every confusing moment as a usability defect. Prioritize by impact, frequency, and recoverability; confusion that blocks the primary task or misrepresents an outcome needs attention before release.

---

## 6. Anti-patterns (the software "Norman doors")

A Norman door is a door whose design tells you to push when you must pull. These are ours. Reject them in review.

| Anti-pattern | Why it fails | Principle violated |
|---|---|---|
| Action only reachable by hover, long-press, or hidden swipe | No signifier; undiscoverable | Discoverability, Signifiers |
| Generic "OK" / "Submit" / "Continue" when the next outcome is unclear | Label does not explain the action | Signifiers, Conceptual model |
| "Are you sure?" dialog | No object named; reflexively confirmed | Design for error |
| Click, nothing happens, then a page appears 3 s later | Gulf of evaluation | Feedback |
| Saved silently; user clicks Save four times | Gulf of evaluation | Feedback |
| Delete and Save styled identically, side by side | Invites slips | Constraints, Design for error |
| Same concept called three names across screens | Breaks the conceptual model | Conceptual model |
| Toolbar action that edits something off-screen | Control far from effect | Mappings |
| Disabled button with no explanation | Constraint without a signifier | Constraints, Feedback |
| Error banner at the top for a field at the bottom | Message far from problem | Mappings, Design for error |
| Mode that changes what clicks do, with no visible indicator | Mode error | Design for error |
| Requiring the user to remember an ID, code, or sequence | Knowledge in the head | Knowledge in the world |
| Form that clears itself on validation error | Punishes the error | Design for error |
| Jargon or internal names in the UI ("entity", "tenant", "SKU-ref") | Our language, not the user's | Conceptual model |

---

## 7. Definition of Done: every user-facing feature

Answer each with evidence, a not-applicable reason, or an unresolved issue with an owner and next step. Attach to the PR or implementation notes. An issue reference records a gap; it does not make the check pass.

**Discoverability**
- [ ] A new user can find the primary action without a tutorial.
- [ ] The primary action is visible, secondary actions are discoverable, and expected unavailable actions explain why.

**Feedback**
- [ ] Every click/tap has an immediate pressed state.
- [ ] Every action shows what happened within about a second, or shows progress.
- [ ] Success and failure are both visibly reported, next to where the action occurred.

**Conceptual model**
- [ ] The user-facing model for this feature is written down in one or two sentences.
- [ ] Every label, icon, and behavior in the feature agrees with that model and with the rest of the product.
- [ ] No concept has more than one name.

**Signifiers and affordances**
- [ ] Everything interactive looks interactive; nothing else does.
- [ ] Action labels make the outcome clear; standard navigation and platform controls use familiar wording.
- [ ] Every hidden gesture or shortcut has a visible equivalent.

**Mappings**
- [ ] Controls sit on or next to the thing they affect.
- [ ] Order and position on screen match order and position in the user's mental model.

**Constraints**
- [ ] Invalid states are prevented where practical, and remaining validation preserves input and explains recovery.
- [ ] Every constraint explains itself.

**Design for error**
- [ ] Every action is undoable, or is irreversible *and* gated by a confirmation that names the object.
- [ ] Destructive actions look and sit differently from safe ones.
- [ ] Error messages say what happened, why, and what to do next, in plain language, next to the problem.
- [ ] The user's input is never discarded on error.
- [ ] Modes, if any, are visibly indicated.

**Knowledge in the world**
- [ ] Nothing in the flow requires the user to remember something from another screen.

**Process**
- [ ] The seven stages of action were walked through for the primary goal.
- [ ] At least one person who didn't build it completed the task unaided, and every hesitation was logged.

---

## 8. The 60-second review

Before any UI ships, a reviewer who did not build it opens the feature cold and answers, aloud:

1. What is this for?
2. What can I do here?
3. How do I do the main thing?
4. (Do it.) What just happened?
5. How do I undo that?

Record any pause, guess, or mistaken expectation. Identify its cause and impact, then improve and retest. Do not count a coached walkthrough as independent usability evidence.

---

## 9. Apply the principles to our products

These are our implementation rules and examples, not quotations from the books.

### 9.1 Start with the user's goal and mental model

Before drawing a screen or naming a feature, complete this short contract:

```text
Who is here, and what are they trying to accomplish?
What familiar idea should help them understand this feature?
What do they provide, what does the product do, and what do they receive?
What is the main action, and what will visibly happen after it?
How will they know whether it worked, and recover if it did not?
```

- Name features by the user's task or outcome. Internal architecture, clever branding, and unfamiliar labels do not explain a feature.
- If an established feature name must remain, pair it with one short, concrete explanation at the point of use. Do not solve a naming problem with a paragraph or a compulsory tour.
- For example, "Judgment Check" alone is ambiguous. A candidate label is "Practice technical decisions", with "Choose a response to a workplace situation, then see why it works or falls short." Validate the wording before renaming routes or existing features.
- In an engineering tool, "Review this change" and "What still blocks release" explain the task more directly than an unexplained module name. Keep proposed, checked, verified, and approved states distinct.
- Navigation follows goals and activities. Implementation modules and database entities are not automatically navigation items.
- Use the five-second question as a diagnostic: can a first-time visitor explain who this is for, what it helps them do, and where to start? This is a review prompt, not a claimed research benchmark.

### 9.2 Feedback must teach, not leave the user guessing

For quizzes, practice, assessments, and scored decisions:

- Before answering, state whether there is one best answer, multiple correct answers, or an open-ended rubric. Define partial credit only where the rubric supports it.
- After submission, show an explicit verdict beside the selected answer: "Correct", "Incorrect", or "Partly correct". For judgment scenarios, use equally explicit labels such as "Best-supported choice", "Partly supported", or "Not supported by these facts".
- Identify the best answer when the selected one is not best. Distinguish selection from correctness; a blue selected border alone is not feedback.
- Explain the decisive fact or rule, connect it to the learner's choice, and show why the alternative is stronger. Correct answers need a reason too. Avoid generic praise or a lesson summary that never addresses the answer.
- When relevant, show which changed fact would change the recommendation. Do not invent facts to justify grading.
- Keep the result and the short explanation visible before the next action. Do not auto-advance past them or put the only explanation behind an accordion. Optional depth can expand below.
- Use green for supported/correct, amber for a genuine partial result or caveat, and red for incorrect/unsupported. Do not force every question into one green, one amber, and one red choice. Color always accompanies words and an icon or other non-color cue.
- Increase challenge based on demonstrated understanding and explain the change. Never manufacture a wrong answer, hide the rubric, or penalize a correct response to create an upsell. Use fresh applications and later retrieval to test transfer.

Example: when a scenario explicitly says there is no tested mitigation, selecting a rollout "with a verified mitigation" assumes a fact that does not exist. Feedback should name that assumption and explain why pausing the affected release is supported. If a mitigation is later verified, a bounded rollout may become defensible.

### 9.3 Calm, polished presentation

- Use neutral surfaces, readable typography, clear spacing, and a deliberate hierarchy. Use product, goal, or focus colors as small accents on labels, icons, and fine borders.
- Avoid full-card saturated red/green fills, decorative gradients across whole workflows, and large blocks of explanatory copy. A premium appearance must still make the action and result obvious.
- Give each task a clear primary action. Put advanced options and supporting explanations behind clearly labeled disclosure, without hiding the primary result or a necessary warning.
- Headings are headings. Buttons are buttons. A heading such as "Goal details" must not look pressable unless it actually opens or edits those details.
- Show the useful output first. A customized plan should lead with the next useful practice and the plan itself, with setup rationale available on demand.
- Keep brand styling specific to each product. These rules do not require a shared palette, dark mode, or an identical layout across products.

### 9.4 Forgiving forms and consistent surfaces

- Ask only for information needed now. Mark optional fields and preserve valid input through errors, back navigation, and interrupted sessions where appropriate.
- Offer both a calendar and typed date entry when people may already know the date. Make the expected format clear, handle locale ambiguity, and explain invalid or unavailable dates.
- Offer role/title suggestions without forcing a catalog choice when a custom value is valid. Keep a clear path to use the user's own wording.
- Web, mobile web, native mobile, desktop, and extensions must communicate the same meaning and outcome when they offer the same feature. Use platform-appropriate controls; do not assume that fixing one surface fixes another.
- Check keyboard access, visible focus, accessible names, reading order, sufficient contrast, touch target spacing, larger text, and screen-reader announcements for results and errors. Color and hover alone must never carry essential information.
- Test empty, loading, success, partial, error, retry, and offline states where applicable. Feedback should preserve context and prevent accidental duplicate submission.

### 9.5 Evidence before declaring the experience clear

- Walk the actual flow on each affected surface, including a narrow viewport and a keyboard or touch path as appropriate. Record what was checked and what remains untested.
- Ask someone who did not build it to explain the purpose, complete the task, and interpret the result without coaching. Log hesitation, mistaken expectations, and recovery failures.
- A screenshot or an automated test can verify layout or behavior; neither proves that a person understood it. Never claim user testing that did not happen.
- Prioritize confusion that blocks the main task or misrepresents an outcome. Track remaining issues with an owner and a next step.

## 10. Short review record

Use this in the PR or implementation notes alongside the checklist in section 7. Keep answers concrete. For documentation-only or backend-only changes with no user-visible effect, mark the UI checks not applicable and explain why. An unresolved check is recorded work, not a passing result.

```text
User goal and mental model:
Primary action and expected result:
Names or controls that might be misunderstood:
Success, failure, and recovery behavior:
Why the feedback helps the user understand:
Surfaces and accessibility paths checked:
Unaided user observation (or explicitly not yet tested):
Remaining issues, owners, and follow-up:
```

## 11. Further reading and attribution

This standard adapts the supplied Everyday-Things rules and adds our product examples. It is not a substitute for the books, a reproduction of their text, or a claim of author endorsement. The following are complementary lenses; the concrete project rules above are our application of them.

- Don Norman, [The Design of Everyday Things, revised and expanded edition](https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded-edition/): conceptual models, discoverability, signifiers, feedback, and designing for error.
- Steve Krug, [Don't Make Me Think, Revisited](https://sensible.com/dont-make-me-think/): apply a usability lens to both web and mobile; reduce unnecessary interpretation and validate the experience with people.
- Alan Cooper, Robert Reimann, David Cronin, and Christopher Noessel, [About Face, fourth edition](https://www.wiley.com/en-us/About+Face%3A+The+Essentials+of+Interaction+Design%2C+4th+Edition-p-9781118766576): use Goal-Directed Design to organize an experience around what people are trying to accomplish.
- W3C WAI, [Designing for Web Accessibility](https://www.w3.org/WAI/tips/designing/): practical support for contrast, non-color cues, focus, labels, and understandable feedback.
