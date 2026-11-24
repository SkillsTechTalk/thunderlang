# The Thunder Programming Language: specification V1

> **Status:** V1, 2026-11-23. Replaces the [mission specification draft v0.2](/docs/spec-v0-2).
> The machine-readable form of this specification is `thunder-visual-v1`, exported by the Thunder compiler
> (`THUNDER_VISUAL`, `visualFor`, `thunderText` from `@skillstech/thunderlang/core`). Where this page and that data
> disagree, the data is right and this page has a bug. Each element below is marked **works today**, **some
> languages**, or **planned**, and nothing marked planned is claimed to work.

## 0. Human-native programming

> We are no longer writing code for the computer. We are writing code for humans.

**Thunder is a human-native programming language.** People work with the meaning of software (what it does,
what it decides, how it can fail), and machines handle most of the implementation. Thunder shows that meaning as
pictures, and the same meaning as plain, precise words, whatever language the software is written in.

| Level | What it is | Read by |
| --- | --- | --- |
| **Thunder** | Pictures of what software does: cards, steps, maps | Anyone who needs to understand the software |
| **Thunder Text** | The same meaning in plain, precise words | Anyone who wants the detail |
| The meaning | The one reading both views are made from: actions, rules, steps, failures, evidence | Tools (the Thunder compiler, OpenThunder) |
| High-level languages | Java, Python, TypeScript, C#, SQL | Developers |
| Machine code | Instructions for one kind of processor | Compilers and specialists |
| Bits | 0 and 1 | Hardware |

The top two levels are human-native, and both are views of the meaning beneath them. Everything below them still exists and still runs, and AI now writes much of
it. Thunder does not replace the code; it lets people read it, question it, and change it.

| Paradigm | The question it answers |
| --- | --- |
| Object-oriented programming | How are objects and their behavior organized? |
| Functional programming | How is a computation built from functions? |
| Intent-oriented programming | What should the software do, and how do we check that it does? |
| **Human-native programming** | How can a person understand, direct, and change software, whatever language it is written in? |

Intent-oriented programming, ThunderLang's earlier focus, stays the method underneath: state what software should
do, and check that it does. Human-native programming is the larger aim it serves.

**What it is not.** It is not natural-language programming: Thunder does not turn ambiguous English into code; it
reads real code exactly, with no AI, and the same code always gives the same Thunder. It is not no-code: the
software stays real code in a real language, and that code stays the source of truth.

### Names

| Name | Means |
| --- | --- |
| **Thunder** | The language. Also called **ThunderLang** (website, package, repository), the way Go is also called Golang. |
| **Thunder Text** | Thunder in words. |
| **Thunder compiler** | The open-source compiler (`thunder`) that reads code into Thunder, checks rules, and generates code. Runs in the browser, the terminal, and VS Code. |
| **OpenThunder** | **The IDE for Thunder.** Where you use Thunder on a whole application: read it, find your way in the Atlas, change it, and check every change. |
| **Thundered Python** (C#, Java, …) | Existing code shown in Thunder. |
| **Read in Thunder** | The action that shows code in Thunder, and OpenThunder's front door (App > File > Action > Rule > Original). |

### The bar

A 12-year-old can explain what a simple program does using Thunder. An architect can use the same Thunder to check
whether that program is right. Both, without hiding complexity and without presenting a guess as a fact.

This is a design goal. It has not been measured with a study yet; it is the test every addition to the language
must pass on paper first.

## 1. Principles

1. **Meaning before syntax.** Show what the software does, not brackets, types, and keywords.
2. **Read before write.** Thunder works on the code people already have. Nobody rewrites anything to start.
3. **One meaning, two views.** The picture and Thunder Text are two views of the same reading, produced from the
   same data. Switching between them loses nothing.
4. **Truth before simplicity.** What Thunder cannot read is shown as *Not read yet*, dashed, with the original code.
   Thunder never draws a guess to make a picture look complete.
5. **People stay in charge.** AI can write most of the code. People read what it does and decide what it should do,
   and every change is checked before it ships.

## 2. One meaning, two views

```
                 original code  (Python, TypeScript, Go, … SQL)
                        │  read exactly by the Thunder compiler, no AI
                        ▼
                 the meaning  (read-v1 items: actions, decisions, functions, steps, failures, tests)
              ┌─────────┴──────────┐
     visualFor(item)          thunderText(item)
              ▼                    ▼
        Thunder (picture)     Thunder Text (words)
```

| Form | Role | What a person does with it |
| --- | --- | --- |
| **Thunder** | Main | Reads, explores, asks a rule questions, proposes a change |
| **Thunder Text** | Detail | Reads closely, reviews, stores, diffs |
| **Original code** | Evidence | Checks exactly which lines Thunder read (View original, always one click away) |

The picture and the text are not translated from each other. Both are rendered from the same meaning, so they
cannot disagree. An AI coding agent can change the original code, and both views update from the new reading.

## 3. Reading levels and places

Reading software in Thunder has two separate questions: **how deep** you are reading (the level) and **where** you
are (the place). Every Thunder view offers the same five levels, in this order, with these names.

```
   Big Picture  →  Flow  →  Details  →  Text  →  Original
   what it is      how it    exactly     the same   the code
   and can do      goes      what, and   in words   that proves it
                             how sure
   └──────── pictures ────────┘          words      evidence
```

| Level | The question it answers | What it shows |
| --- | --- | --- |
| **Big Picture** | What is it, and what can it do? | The Things, what each knows and can do, its doors (actions), its rules, and its data. For one action or rule: what you give it, what you get back, and what it uses. |
| **Flow** | How does it go? | One action or rule as a path: questions with Yes and No, repeats, the Stops, what happens if something goes wrong, and what always happens at the end. |
| **Details** | Exactly what happens, and how sure is Thunder? | A fact sheet: every way it can end (each Stop with the message people see, and what it gives back) with the answers that lead there, what it changes, what goes in and where it is used, what it relies on, a rule's answers in words and its exact limits (found by running it), and what the code cannot tell you. Every fact links to its line. |
| **Text** | What does it say, in words? | Thunder Text: the same meaning in structured words, for reading closely, reviewing a change, and keeping a copy. |
| **Original** | Which code says so? | The exact lines in the original language that Thunder read. The evidence, one click away. |

The compiler defines what each level shows: `LEVELS` (the names and questions) and `readLevel(model, level, focus)`
(the content for the whole app, one Thing, or one action or rule), both in `/core`. A product decides where to put
the levels and how to move between them; it does not decide what a level contains. Flow and Details are about one
action or rule; asked for them without one, `readLevel` gives the list to choose from.

### Places

**Places** are where you are: the App, an Area, a File, a Thing, an Action, or a Rule. **Read in Thunder** walks
them from the whole app down to one rule (OpenThunder ADR 0035); the Thunder Atlas (ADR 0033) adds **Area** between
App and File for large apps. At every place, all five levels apply.

| Level | What you see | Example | Atlas |
| --- | --- | --- | --- |
| App | The app's folders or areas, with counts of actions and rules | `billing-service` | Z0 |
| Area | A feature area, service, package, or folder (Atlas; optional in Read in Thunder) | `Refunds` | Z1 |
| File | What you can do here: the file's actions and functions | `refunds.py` | Z2 |
| **Action** | A door into the app (an endpoint or a screen) and what its handler does | `POST /refunds` | Z3 |
| **Rule** | One decision as a Thunder card, or a function's steps | "When do we approve a refund?" | Z3 |
| Original | The exact lines in the original language | lines 12 to 16 | Z4 |

## 4. Elements

Every element shows where it came from (section 8). Levels are the zoom levels in section 3.

| Element | Zoom | Picture | Thunder Text | Status |
| --- | --- | --- | --- | --- |
| **App** | 0 | A map of its folders or areas, with counts of actions, decisions, functions, and what could not be read yet | `App <name>` | works today (`thunder repo`) |
| **Area** | 1 | A region of the map: a folder, package, or service | `Area <name>` | works today |
| **File** | 2 | What you can do here: its actions and functions, in order | `File <path>` | works today |
| **Data shape** | 2 | A table card: fields, their kinds, allowed values | `A <Name> has` then one field per line | planned |
| **Action** | 3 | A steps card with a route badge (`POST /refunds`): a door into the app and what its handler does | `When someone calls POST /refunds` | works today for endpoints; screens planned |
| **Thunder card** | 4 | One decision: its question, the facts it reads, each rule, the outcome otherwise, examples you can ask | Thunder Text contract (section 6) | works today |
| **Steps card** | 4 | What a function does, as steps with one level of nesting | `What <name> does` then `- <step>` lines | works today |
| **Not-read-yet card** | 4 | Dashed card with the original code | `` - `code` (code, not explained) `` | works today |
| **Failure** | 4 | A chip marked ✕ | `Can fail with <Name>` | works today |
| **Test** | 4 | A chip marked ⚑; green or red only once it has run | `Test: <name>` | works today |
| **Trigger** | 3 | A steps card with a "when" badge: a database trigger, message handler, or schedule | `When <event>, it` then steps | planned |
| **Original code** | 5 | The exact lines, highlighted | (the code itself) | works today |

**Author's note.** When code has a docstring or doc comment, Thunder shows its first paragraph, verbatim, as an
**Author's note**, kept apart from what the code does. The author describes what they meant, while Thunder's reading
shows what the code actually does, and a reader should see both. In a Thunder Text contract it becomes the `Why:` line.

## 5. Steps

A function that is not a decision is read as **steps**: what it works out, checks, calls, and returns. Shape comes
first and color second. Every step has a mark, so color is never the only signal.

| Kind | Mark | Label | Color role | Example in Thunder Text |
| --- | --- | --- | --- | --- |
| check | ✓ | Check | comparison | `Checks that the amount is at least 0` |
| branch | ◇ | If | question | `If the order is refunded` |
| loop | ↻ | For each | structure | `For each item in the cart` |
| set | = | Works out | fact | `Works out actives: the items in rules where active` |
| call | → | Calls | outcome | `Calls Stripe` · `Writes to the database (commit)` |
| return | ⇥ | Gives back | outcome | `Returns whether any item in actives matches` |
| fail | ✕ | Fails | failure | `Fails with AlreadyRefunded: "This order was already refunded"` |
| try | ⛉ | Tries | structure | `Tries the next steps and handles any error` |
| *restates* | · | Code | unread, dashed | the original code, quoted |
| *other* | · | Not read yet | unread, dashed | the original code, quoted |

**A step that would only restate the code shows the code instead.** "Works out actives" or "Returns the result of
any" tells a reader nothing the code did not, so Thunder marks such steps `restates`, shows the original code dashed,
and does not count them as read. A function is drawn as a steps card when at least half its steps explain something.
Otherwise it is a not-read-yet card.

## 6. Thunder cards and the Thunder Text contract

A **decision** is a function that chooses between fixed answers. It is drawn as a **Thunder card** and written in
Thunder Text as a contract (`.thunder-plain`, schema `thunder-plain-v1`):

```text
Refund approval
Why: Let support resolve small refunds without waiting for a manager.

We need
  the amount, in dollars
  whether it is on time or late

When do we approve a refund?
  Approve when all of these are true:
    it is on time
    the amount is at most $100
  Otherwise, Review.

Examples
  $100, on time   gives Approve   (exactly at the limit)
  $101, on time   gives Review    (above the limit)
  $50, late       gives Review    (outside the refund window)
```

| Part | Meaning |
| --- | --- |
| Title, then `Why:` | What the rule is and why it exists (from the docstring when read from code) |
| `We need` | The facts the rule reads: a number (`in dollars` for money), or a yes/no (`whether it is A or B`) |
| The question | What the rule decides |
| `<Outcome> when …` | One rule. `all of these are true:` or `any of these is true:` joins conditions; the first matching rule wins |
| Comparisons | `at least`, `at most`, `under`, `over`, `exactly` |
| `Otherwise, <Outcome>.` | The answer when no rule matches |
| `Examples` | Inputs and the answer the rule must give. Code has none, so a person adds them. The card answers each one, and the compiler checks them. |

## 7. Colors and lines

Each kind of word keeps one hue everywhere it appears: in the picture, in Thunder Text, and in the legend.

| Role | Color | Used for |
| --- | --- | --- |
| structure | violet | `when`, `otherwise`, `all of these`, `for each` |
| question | blue | A decision's question, branches |
| fact | yellow | Facts a rule reads, values a step works out, routes |
| comparison | pink | `at least`, `at most`, checks |
| amount | orange | Amounts and numbers |
| outcome | cyan | Outcomes, what a function gives back |
| name | lime | Example names |
| failure | orange, always with ✕ and "Fails" | Ways a function fails |
| **pass** | **green** | **Only** a check that ran and passed |
| **fail** | **red** | **Only** a check that ran and failed |
| unread | grey, dashed | Not established |

**Solid lines** mean established: read exactly, or confirmed by a person. **Dashed lines** mean not established: not
read, partly read, an AI summary, or not yet run.

## 8. Where each piece came from

Every element carries one provenance chip. The words are shared with OpenThunder (ADR 0035). Chips are neutral grey
with a solid or dashed outline, and never borrow a word role's color, so yellow always means a fact.

| Chip | Line | Meaning |
| --- | --- | --- |
| **From code** | solid | Read exactly by the Thunder compiler, with no AI |
| **Confirmed** | solid | A person confirmed this is what the software should do |
| **Author's note** | solid | The author's own words (docstring or doc comment), verbatim. A statement, not a reading |
| **AI summary** | dashed | Written by AI to explain. Never evidence; always shown above the exact reading it summarizes |
| **Not read yet** | dashed | Thunder could not read this yet; the original code is shown instead |

The AI summary layer belongs to OpenThunder. This specification defines only how a summary looks and where it sits.

## 9. Languages

| Language | Reading | Actions (endpoints) | Decisions | Author's note | Data shapes (planned) |
| --- | --- | --- | --- | --- | --- |
| Python | works today | FastAPI `@router.post`, Flask `@app.route` | a `def` that returns fixed answers | docstring | `@dataclass`, pydantic, `Enum` |
| TypeScript | works today | NestJS `@Get`/`@Post`, Express `router.post(…)` | a function that returns fixed answers | JSDoc | `interface`, `type`, `enum` |
| JavaScript | works today | Express `app.get(…)`, `router.post(…)` | a function that returns fixed answers | JSDoc | classes |
| Go | works today | not yet (net/http, Gin planned) | a `func` that returns fixed answers | `//` comment above | `struct` |
| Rust | works today | not yet (Actix, Axum planned) | a `fn` with `match`/`if` | `///` | `struct`, `enum` |
| C# | works today | `[HttpGet]`/`[HttpPost]` | a method that returns fixed answers | `/// <summary>` | `class`, `record`, `enum` |
| Java | works today | Spring `@GetMapping` | a method that returns fixed answers | Javadoc | `class`, `record`, `enum` |
| Kotlin | works today | Spring annotations | a `fun` with `when`/`if` | KDoc | `data class`, `enum class` |
| PHP | works today | Symfony `#[Route]` | a function that returns fixed answers | PHPDoc | `class`, `enum` |
| Ruby | works today | Sinatra `get`/`post` blocks (Rails routes planned) | a `def` that returns fixed answers | `#` comment above | `class`, `Struct` |
| **SQL** | **planned** | (reached through the app) | `CHECK` constraints, `CASE`, `IF` in procedures | `--` comment, `COMMENT ON` | `CREATE TABLE`, `CREATE VIEW` |
| Dockerfile | works today (section 12) | (none: it packages the app) | (none) | `#` comment above `FROM` | the image it makes is a **Resource** |
| GitHub Actions | works today (section 12) | each job, with a "When" badge | `if:` as a question | the workflow's `name:` | **Permissions** and **Settings** |
| Terraform | works today (section 12) | (none: it describes what exists) | `count = cond ? 1 : 0` as a question | `#` comment above a block | each `resource`, `data`, and `module` is a **Resource**; role assignments and IAM policies are **Permissions** |
| Bicep | works today (section 12) | (none: it describes what exists) | `if (…)` as a question | `//` comment or `@description` above | each `resource` (`existing` is looked up) and `module` is a **Resource**; role assignments are **Permissions** |
| Kubernetes | works today (section 12) | (none: it describes what runs) | (none) | `#` comment above a resource | each resource (`Deployment/api`) is a **Resource**; RBAC roles and bindings are **Permissions** |
| Docker Compose | works today (section 12) | (none: it describes what runs) | `profiles:` as a question | the file's `name:` | each service, named volume, network, secret, and config is a **Resource** |

### SQL

Thunder reads `.sql` files (PostgreSQL first; MySQL, SQLite, and SQL Server where their syntax agrees).

- **Tables** are Data, or Things when they enforce rules: each column with its kind in words ("a number, given
  automatically, the id"; "words, always set"), its default ("0 at first", "the moment it is saved"), and what it
  points to ("a customer (by its id)").
- **`CREATE TYPE … AS ENUM`** is a set of Choices.
- **`CHECK` and `UNIQUE`** are rules the table enforces: "Is total at least 0?" with the Stop on No, "Refused by the
  database: The order needs total is at least 0".
- **Views** are steps: finds, adds the matching rows, keeps only, groups, sorts, takes the first N, gives back the
  named columns. Table aliases read as their tables ("the order's status").
- **Functions and procedures** are steps: their inputs, `IF`/`ELSIF`/`ELSE` as questions, `RAISE` as Stops with
  their message, `INSERT`/`UPDATE`/`DELETE` as what they record, `SELECT … INTO` as what they find, `RETURN`.
- **Triggers** say when the database runs them: "After an order is added or changed, runs log order change".
- Planned: **SQL inside app code** (`db.execute("SELECT …")`) read in place, as a step; `CASE` expressions as cards.

## 10. Rules every Thunder view follows

A view that breaks one of these is wrong, however good it looks.

1. Show the picture first, Thunder Text second, and the original code one click away.
2. Never draw a guess. What Thunder cannot read is shown as *Not read yet*, dashed, with the original code.
3. Green and red mean only a check that ran and passed or failed.
4. Every element shows where it came from: From code, Confirmed, Author's note, AI summary, or Not read yet.
5. An AI summary is labeled, dashed, and always sits above the exact reading it summarizes, never instead of it.
6. An Author's note is shown verbatim as the author's statement, separate from what the code does.
7. Say the action that is really possible: **Propose rule change** until a change is written back and checked; never
   **Update code**.
8. Use the reader's words: plain names, no syntax. A step that would only restate the code shows the code instead.

## 11. Using the grammar in a tool

Every Thunder view renders from the same data instead of deciding shapes, colors, and wording for itself.

```js
import { readCode, visualFor, visualForStep, thunderText, THUNDER_VISUAL } from '@skillstech/thunderlang/core';

const { items } = readCode(source, { language: 'python' });
for (const item of items) {
  const v = visualFor(item);     // { element: 'action', shape: 'steps-card', line: 'solid', title, badge, provenance, doc }
  const text = thunderText(item); // the same meaning as Thunder Text
  for (const step of item.steps ?? []) visualForStep(step); // { mark: '◇', label: 'If', color: 'question', show: 'words' }
}
THUNDER_VISUAL.colors.pass.hex;   // '#34D399', for checks that passed and nothing else
```

## 12. The whole application: where it runs and how it ships (design)

An application is more than its source code. It is also where it runs (containers, servers, databases, networks,
permissions, settings) and how it is built, tested, and released (pipelines, build scripts). Thunder explains all
of it, in the same shapes and the same five reading levels, so a person who inherits a system can understand the
whole of it without learning each format first.

| Category | The question | Formats, in the order Thunder reads them |
| --- | --- | --- |
| **Application** | What does the software do? | the programming languages in section 9 |
| **Infrastructure and configuration** | Where and how does it run? | Dockerfile; Terraform/HCL and Bicep; Kubernetes and Docker Compose YAML; Helm; ARM JSON and CloudFormation; Ansible; JSON/YAML/TOML settings |
| **Automation and delivery** | How is it built, tested, and released? | GitHub Actions; Azure Pipelines; Makefiles and build scripts (shell and PowerShell are read as languages) |

### New elements

**Status:** Dockerfile, GitHub Actions, Terraform (`.tf`), Bicep, Kubernetes YAML, and Docker Compose are read today
(Image build, Pipeline, Resource, Connection, Permission, Setting). Connections use all four kinds (`uses`,
`runs-in`, `reads-from`, `sends-to`). Helm (its templates are listed as not read, with the reason), Azure Pipelines,
ARM JSON, CloudFormation, Ansible, and `.tf.json` are planned.

Terraform and Bicep read the same way:

- Each `resource` is a Resource with its type as written (`azurerm_storage_account`, `Microsoft.Storage/storageAccounts`)
  and its address (`azurerm_storage_account.main`; in Bicep, the symbolic name). It **knows** its arguments in words,
  a value only when the file writes it ("Account tier: Standard"); a reference reads as what it names ("the location
  of the resource group rg (worked out when it is applied)"); nested blocks are summed up in a line.
- A Terraform `data` source or a Bicep `existing` resource is looked up, not made ("Looks up an existing subscription,
  made elsewhere"). A `module` is a Resource of its own ("Uses the module ./network").
- `count`, `for_each`, and Bicep `for` read "One for each item in the setting names"; `count = x ? 1 : 0` and Bicep
  `if (…)` read "Only when the setting enabled is on". `lifecycle { prevent_destroy = true }` reads "Protected:
  Terraform refuses to destroy it".
- `variable` and `param` are Settings given when it is applied (`sensitive = true` and `@secure()` are only named);
  `locals` and `var` are written in the file or worked out; `output` is a Setting the infrastructure gives back.
- References and `depends_on`/`dependsOn` are Connections with their lines: `resource_group_name`, `service_plan_id`,
  `parent`, and similar keys are **runs in**; a data source or `existing` resource is **reads from**; workspace and
  endpoint keys are **sends to**; the rest is **uses**. A reference to a resource in another `.tf` file of the same
  folder is drawn when the folder is read together.
- **Flow** is the order things are created, from those connections: "Works in Azure", "Creates the resource group
  rg", "Creates the storage account main in the resource group rg", with a question for each conditional resource and
  "For each …" for each repeated one.
- **Permissions**: `azurerm_role_assignment`, Key Vault access policies, AWS IAM policies (inline JSON,
  `jsonencode`, `aws_iam_policy_document`, trust policies, and policy attachments), `google_*_iam_member`/`_binding`,
  and Bicep `Microsoft.Authorization/roleAssignments` (well-known role ids are named: Owner, Contributor, Reader,
  Storage Blob Data Reader, Key Vault Secrets User, AcrPull, …). A permission is **wide** when it gives Owner,
  Contributor, or User Access Administrator on a whole subscription or management group, `roles/owner` or
  `roles/editor` on a project, or IAM `"*"` actions (or changes on `Resource: "*"`).
- **Facts** (in addition to the Dockerfile and workflow ones): `public-ingress` (a security group, NSG rule, or
  firewall that lets `0.0.0.0/0`, `*`, or `Internet` reach a port other than 80 or 443), `storage-public` (public blob
  or bucket access), `secret-in-plain-config` (a secret-looking argument or default written in the file),
  `encryption-off` (encryption or HTTPS turned off, or TLS 1.0/1.1 accepted, where the file says so), and
  `wide-permission`.

Kubernetes YAML (a `.yaml` or `.yml` file whose first lines have `apiVersion:` and `kind:`; several documents per
file, and `kind: List`) reads this way:

- Each resource is a Resource with its `kind` as written (`Deployment`, `Service`, a custom kind too) and the address
  `Kind/name`, or `Kind/namespace/name` outside the default namespace. A comment right above it is its note.
- A **workload** (Deployment, StatefulSet, DaemonSet, Job, CronJob, Pod) knows how many copies run, the image ("no
  tag, so whatever latest is when it starts"), how it starts, its ports, each setting (a literal value unless the name
  looks secret; `secretKeyRef` reads "the secret value password in the Secret db-creds (only its name is shown)"),
  CPU and memory ("Asks for 0.1 CPU and 128 MiB of memory"), its health checks in words ("Ready for traffic when a
  web request to /healthz on port 8080 succeeds"), the user it runs as, and where each volume is mounted. A CronJob
  says when it runs ("every day at 02:00 (the cluster's time zone)").
- A **Service** says who can reach it (inside the cluster only; a NodePort or LoadBalancer from outside, unless an
  internal load balancer or source ranges say otherwise) and **sends to** the workloads its selector picks. An
  **Ingress** sends each host and path to its Service and names the TLS Secret it uses. A setting whose value names a
  Service exactly (`redis:6379`, `http://api:8080`, `db.shop.svc.cluster.local`) **sends to** it.
- **ConfigMap** keys are Settings with their values (a secret-looking key is not shown); **Secret** keys are only
  named. A PersistentVolumeClaim says how much storage it asks for and how it can be used; an autoscaler, which
  workload it scales and between how many copies; a NetworkPolicy, which pods it applies to and what it lets in and
  out, in words.
- **Links**: a workload **uses** its service account and storage claims and **reads from** the ConfigMaps and Secrets
  it takes settings or files from; a namespaced resource **runs in** its Namespace; a binding **uses** its role.
  Links to resources in other files are drawn when the files are read together (in the same folder first; in another
  folder only when exactly one folder has it).
- **Permissions**: each Role and ClusterRole rule ("Whoever is given the role config-reader can read (get, list, and
  watch) configmaps in the namespace shop"), and each RoleBinding and ClusterRoleBinding ("The service account
  ci/deployer can do anything (cluster-admin) in the whole cluster"). **Wide**: `*` verbs or resources, cluster-admin
  anywhere, admin or edit across the whole cluster, or a role given to everyone (signed in or not).
- **Flow**: one Steps card per file, the order things are made, from those links ("Creates the namespace shop",
  "Creates the deployment api (3 copies of ghcr.io/acme/api:1.4.2)", "Creates the service api, which sends to the
  deployment api").
- **Facts**: `runs-as-root` (`runAsUser: 0`, or nothing that stops it: no `runAsNonRoot: true` and no `runAsUser`),
  `image-not-pinned`, `public-ingress` (NodePort, LoadBalancer, Ingress), `secret-in-plain-env`,
  `secret-in-plain-config` (a Secret's values, or a secret-looking ConfigMap key, written in the file),
  `wide-permission`, and two new kinds: `privileged-container` (`privileged: true`, the SYS_ADMIN or ALL capability,
  `hostNetwork`/`hostPID`/`hostIPC`, or the node's root folder or Docker socket mounted) and `no-resource-limits`.
- Helm templates (and other `{{ … }}` templates) are not Kubernetes until they are filled in: they are listed as
  skipped with that reason. A kustomization says which files it combines and what it changes.

Docker Compose (`docker-compose.yml`, `compose.yaml`, `docker-compose.<name>.yml`, `<name>.compose.yml`) reads this
way:

- Each **service** is a Resource (`compose-service`, address `services.web`) that knows what it runs: an image, or
  "Built from the folder ./api, the runtime stage", **linked to that folder's Dockerfile image** when the Dockerfile
  is read together (an exact path, never a guess). It knows the ports it publishes and to whom ("port 80 as port
  8080, on every network the computer is on"; "on this computer only" for `127.0.0.1:…`), its settings (`${VAR}` is
  worked out when it starts; a name with no value is taken from the computer; a secret-looking literal is never
  shown), its env files, secrets, configs, volumes and folders, what it starts after, its networks, health check,
  restarts, user, limits, and profiles.
- Named **volumes**, **networks**, **secrets**, and **configs** are Resources too (`external` ones are made elsewhere).
- **Links**: `depends_on` **uses**, networks **runs in**, secrets and configs **reads from**, named volumes **uses**,
  and a setting that names another service (`http://api:8080`, `REDIS_HOST=cache`) **sends to** it.
- **Flow**: "Starting compose.yaml": networks and volumes first, then each service after the ones it waits for
  ("Builds and starts api (from ./api), once db is healthy and cache has started"), with "Is the profile monitoring
  turned on?" for a service that only starts with a profile.
- **Facts**: `public-ingress` (a port published on every address), `image-not-pinned`, `secret-in-plain-env`,
  `secret-in-plain-config`, `runs-as-root` (`user: root`), and `privileged-container` (`privileged: true`, the Docker
  socket, SYS_ADMIN, `pid: host`).

At app scope these Resources join the Dockerfile, Terraform, and Bicep ones and the pipelines on one map. A Kubernetes
workload whose image has exactly the name of the folder a Dockerfile is in (`image: gcr.io/shop/cart:1.2` and
`cart/Dockerfile`) **uses** that image, when exactly one folder has that name.

| Element | Shape | What it is | Where it comes from | Thunder Text |
| --- | --- | --- | --- | --- |
| **Resource** | a block (new symbol) | Something that exists when the app runs: a container image, an app service or server, a database, a storage account, a queue, a key vault, a network. Like a Thing, it **knows** its settings (name, size, region, version). | Terraform and Bicep `resource`; Kubernetes Deployment, Service, ConfigMap; Compose services; the image a Dockerfile builds; ARM and CloudFormation resources | `Resource <name> (<kind>)` then `It knows` |
| **Connection** | a line between resources | Uses, runs inside, reads from, sends to. | `depends_on`, references (`azurerm_app_service.app.id`), environment values that name another service, Kubernetes selectors | `<A> uses <B>` |
| **Permission** | a key (new symbol) | Who can do what to which resource. It reads as a Rule: "The app can read secrets in the key vault." Wide permissions ("Owner of the whole subscription") are called wide. | role assignments (Bicep, Terraform), IAM policies, Kubernetes RBAC, a workflow's `permissions:` | `<who> can <what> on <resource>` |
| **Setting** | Data | A value the app or the infrastructure is given: name, default, and where it comes from (a parameter, a variable, a secret, written in the file). A secret is only ever named, never shown. | parameters, variables, environment variables, outputs | `Setting <name>: <where it comes from>` |
| **Pipeline** | an Action with a "when" badge | Automation: **when** it runs (a trigger), then its jobs as Steps cards, in order. | GitHub Actions `on:`/`jobs:`, Azure Pipelines `trigger:`/`stages:`, Makefile targets | `When someone pushes to main` then steps |
| **Image build** | Steps | How an app is packaged and started: "Starts from node:22-slim", "Copies the package files", "Installs what it needs", "Opens port 3000", "Starts with npm start". The image it makes is a Resource. | Dockerfile (each stage of a multi-stage build is its own Steps card) | `What the image build does` then steps |

Steps inside a pipeline read the way the language they are written in reads: a `run:` block is read as shell or
PowerShell, and well-known actions read in words (`actions/checkout`: "Gets the code"; `actions/setup-node` with
`node-version: 22`: "Sets up Node 22"; `npm publish`: "Publishes the package to npm"). A job's `needs:` is its order,
its `if:` is a question, a failing step is a Stop, and an environment that needs approval is a Stop until someone
approves it.

### In the model (thunder-model-v1, additive)

So every product draws the same thing without guessing, the compiler gives:

| Field | Shape |
| --- | --- |
| A Resource | a Thing with `kind: 'resource'`, `resourceType` exactly as written (`azurerm_storage_account`, `docker-image`), and a stable `address` (`azurerm_storage_account.main`, `Deployment/api`). Changes are matched across versions by `address`. |
| Connections | `links[]` with `kind: 'uses' \| 'runs-in' \| 'reads-from' \| 'sends-to'`, each with `file` and `line`, only where the file says so |
| Permissions | `permissions[]`: `{ id, who, can, on, wide, why?, file, line }`. Whether a permission is `wide`, and the short reason, is the compiler's call. |
| Settings | `settings[]`: `{ name, source: 'parameter' \| 'variable' \| 'secret' \| 'literal' \| 'computed', secret, file, line }`, never a secret's value |
| Pipelines and image builds | members with `kind: 'pipeline'` (with `when`, the trigger in words) or `kind: 'image-build'` |
| Category | `files[].category: 'application' \| 'infrastructure' \| 'delivery'` |
| Worked out later | `computed: true` on any value worked out when the file runs or is applied |
| Facts | `facts[]`: `{ id, kind, says, file, line }`, what the file says, not advice: permissions that can change everything, triggers that run untrusted code with secrets, actions pinned by a tag instead of a commit, images without a pinned digest, containers that run as root, secrets written into plain settings. A tool decides how serious each one is. |
| Which files | `readableFile(path, head?)` says which language or format a file is, from its name and, when needed, its first lines (Kubernetes YAML by `apiVersion` and `kind`) |
| Files not read | a per-file `skipped` reason (too large, a construct Thunder does not read yet), never silently dropped |

The original lines are always one click away, so a secret committed to a file is still visible there; finding
committed secrets is a security check's job, not Thunder's.

### The five reading levels, for infrastructure and delivery

| Level | What it shows |
| --- | --- |
| **Big Picture** | The resources and how they connect, as a map; the permissions as keys on it; the settings each one is given. For a pipeline: when it runs and its jobs. |
| **Flow** | A pipeline's or an image build's path, with its questions and Stops. For declarative infrastructure: the order things are created, from their connections. |
| **Details** | One resource's settings, what it can do and who can do what to it, which secrets it uses (by name), and what it relies on. For a pipeline job: every step, what it publishes or deploys, and every way it can stop. |
| **Text** | Thunder Text, as for code. |
| **Original** | The exact lines of the file. |

### Honest by design, again

- Thunder reads **files**, not the live cloud. What is actually running may differ; Thunder says so instead of
  guessing.
- **Secret values are never shown**, only their names and where they come from.
- A value that is worked out when the infrastructure is applied (a reference, a function, a loop) is shown as
  "worked out when it is applied", with the original one click away.
- Unknown resource kinds are still drawn as Resources, with their type written as it is (`azurerm_foo_bar`), never
  dropped.

## 13. The running system

When something runs or breaks, people should not have to read stack traces or logs in the original language. Thunder
places what happened on the pictures it already draws. **Works today** for Python and JavaScript runs recorded by
`thunder verify --run`; for stack traces from Python (and pytest), JavaScript/TypeScript (Node, V8), Java, C#, and Go;
for structured logs (JSON lines); and for OpenTelemetry spans (OTLP/JSON). In the compiler: `runtimeOverlay`,
`explainError`, and the adapters `fromTrace`, `fromStack`, `fromLogs`, `fromOtlp` (`@skillstech/thunderlang/core`);
on the command line, `thunder runtime <folder> --traces … --stack … --logs … --otlp …`.

**What is shown**

| Where | What the run adds |
| --- | --- |
| A question | How many times it was asked, and how many times each side was taken: "ran 201×: Yes 84, No 117" |
| A Stop | How many times it happened, with the error and message as they were seen, and its share of the calls |
| An ending, an answer, "Done" | How many times it was reached |
| A step | How many times it failed, and with what (from a stack trace); how many times it logged (from logs) |
| An action or rule (Details) | One sentence: "Ran 201 times; stopped with NotAvailable 117 times (58%), when Is the book's status on shelf? was No; …", its time (average and slowest) when the evidence has it, and the most-taken way through it |
| An error | Explained in Thunder: "Failed in Borrow, at “Adds book to student's books” (line 42): AttributeError: …; it got there because Is the book's status on shelf? was Yes and Can borrow? was Yes. Called from …" |

**Honesty rules**

1. Counts come only from evidence. A step no evidence speaks for has no count, which is not the same as zero; a
   crash at a step says it failed there, not how often the step ran.
2. Nothing is inferred about a path that was not observed. The one thing worked out rather than seen is how an error
   got to its step: the answers that lead there in the flow as drawn (the step is on a question's Yes side, or comes
   after a question whose other side always stops). When the flow does not show it, only the step and its line are
   given.
3. Evidence that cannot be placed on a step is listed as **not matched**, with the reason ("no file Thunder read is
   charge.go", "Thunder draws 2 answers at line 32 and the record does not say how many times each"). It is never
   dropped or guessed onto the nearest step.
4. A sample or recorded run is labeled as such, with what was run; each source counts as its own runs, so the same
   run should not be given twice (as a record and as its stack trace).
5. Colors follow section 7: a Stop's count is a fact about a Stop, not a failed check.

## 14. Review in Thunder

A change is approved by what it does, not by how its text moved. `thunderReview(oldFiles, newFiles)` reads both
versions into the Thunder model, pairs each action, rule, and function with its other version, and says what changed
in meaning, in short sentences, most important first. `thunder review <base-ref> [head-ref]` does the same for two git
commits (the working tree when `head-ref` is left out) and prints Markdown for a pull request comment, or `--json`.
It runs only git and the compiler: nothing is fetched or executed, and no AI is used.

**Pairing.** By file and name first (in any naming convention), then by a name used once on each side (a moved file),
then a route handler by its file, method, and code (a new address), then by meaning (a renamed function whose code is
the same apart from its name, or a rule with the same answers). What has no partner is new or removed.

**What is compared, and how it is said.**

| Change | Said as | Severity |
| --- | --- | --- |
| A new Stop | "Now stops with 403 Forbidden ("forbidden") when the x-admin-secret header is not the ADMIN_SECRET setting." | meaning |
| A Stop removed | "No longer stops with 403 … Check that this is no longer needed." | risk |
| A Stop on a different path, or a new message | "Stops with 404 Not Found under different conditions: now when … (was when …)." | risk / meaning |
| A rule's limit | "Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late", with a case run on both: 8 days late gave Big fee, now Small fee | meaning |
| A rule's answers | "Can now answer Medium fee." / "No longer answers …" / "when books out is 3 …, it now gives Yes (was No)." | meaning |
| Inputs | "Now also takes coupon (in the address)." / "No longer takes …" | meaning |
| What it gives back | "Now also gives back …" / "No longer gives back …" | meaning |
| What it changes or reaches | "Now also creates a Stripe charge." (another service, a payment, an email, stored data) | risk |
| What it relies on | "Now also relies on Can borrow?" | meaning |
| An address | "The address changed: GET /price is now GET /prices." | risk |
| Records and choices | "Book now also knows times borrowed (0 at first)." / "Status can now also be lost." | meaning |
| New, removed, renamed, moved | "New action: …", "Removed function: …", "Renamed from Late fee to Overdue fee.", "Moved from app/fees.py to billing/fees.py." | meaning / form |
| Code outside every action and rule | "Changed in code Thunder did not read as an action or rule (in or near …): check the before and after." | meaning |
| Code Thunder cannot read, infrastructure, pipelines | "Thunder cannot read this yet, and its code changed: check the code itself." | risk |

Each item is `{ kind, severity, subject, where: { file, line }, says, evidence }`; the evidence is the case that was
run on both versions, or the before and after Thunder lines (code lines, for code Thunder does not explain).

**Honest by design.** "Only the form changed" is said only when it is shown:

- the code is the same apart from spacing, line breaks, and comments (Python indentation counts as code);
- or only names the function declares itself (its inputs and the values it works out) were renamed, consistently,
  and nothing else changed (a field, a key, a named argument, or a setting from outside never counts as a rename);
- or a rule gives the same answer on every edge case, run on both versions.

Thunder's words leave some details out (a call's arguments, some values), so when the words read the same but the code
differs, the review says "Changed, check: Thunder reads the same, but the code differs in details Thunder's words
leave out", with the code before and after. It never says "safe", and never "same" without one of the proofs above.

**In a pull request.** The GitHub Action in `.github/actions/thunder-review` runs `thunder review` on the pull
request's base and head and keeps one comment up to date (found by `<!-- thunder-review -->`). It posts with the
adopting repository's own `GITHUB_TOKEN`. See [Review in Thunder](/docs/review-in-thunder).

**Not yet.** Infrastructure (Terraform, Bicep, Kubernetes, Compose) and pipelines are flagged for a person to check,
not read; reordered steps are shown as changed steps, not proven independent; a function changed beyond its address
or name is shown as removed and new rather than paired.

## 15. What comes next

In the order OpenThunder needs them for Read in Thunder (the whole-application formats in section 12 follow
their own order there):

1. **Actions everywhere:** routes on every handler, including routes registered in another file
   (`r.Post("/orders", h.CreateOrder)`), Go and Rust frameworks, Rails routes, and screens.
2. **Data shapes:** records, classes, enums, ORM models (Pydantic, dataclasses, SQLAlchemy, TypeORM, Entity Framework,
   Go structs, Java records), and SQL tables, using the same table and column names as OpenThunder's architecture map
   so a step's query links to its table.
3. **State machines:** states and transitions drawn as one element.
4. **Other human languages in code:** keep identifiers such as French names as they are, instead of splitting them as
   English words, with a slot for a gloss.
5. **Events and services:** publish/subscribe, queues, and named external calls (Stripe, HTTP, database, email) as
   step kinds.
6. **A file's purpose:** the module docstring as the file's Author's note.
7. **SQL:** reading as described in section 9, starting with PostgreSQL and migrations.
8. **Thunder write beyond decisions:** today a change to a number, comparison, text value, or answer in a decision is
   written back and checked; other changes are proposals.

Thunder versions its grammar (`thunder-visual-v1`), its reading (`read-v1`, `thunder-steps-v1`), and its contracts
(`thunder-plain-v1`) separately. A new version adds; it does not silently change what an existing element means.
