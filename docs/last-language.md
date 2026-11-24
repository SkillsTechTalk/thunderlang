# The last language people read: what Thunder still needs

The goal: a person who knows Thunder can read, check, change, and run any application without learning the
programming languages underneath, which become to them what assembly language is to a Python programmer: real,
running, and rarely read.

Today Thunder reads software in seventeen languages plus pipelines and images, and its readings are checked so they
never state something false (the faithfulness gate). Reading is close. Being the *last* language needs seven more
things, built in this order because each rests on the one before.

| # | What | Why it matters | Done when |
| --- | --- | --- | --- |
| 1 | **Proof by running** | Checking is sampled today. Running the code and comparing what actually happened with Thunder's picture turns "carefully read" into "shown to be right". | Functions are run with inputs (their own tests where they have them); every question's answer and the path taken are recorded and compared with the flow Thunder drew; a reading that matches is marked **executed**; a release cannot ship if any reading is contradicted by a run. |
| 3 | **No loss** | Thunder's words are short on purpose (about 58% of names kept), and about 14% of values are shown as code. A language people depend on cannot lose information. | A complete meaning model keeps every expression; the words stay short and every detail is one level down (Details, Text). Code → Thunder → code gives back the same meaning, proven by running both. |
| 2 | **Writing in Thunder** | While changes must be made in the original language, people still have to learn it. | Any step, question, Stop, input, or action can be changed in Thunder; the compiler (with AI where needed, always labeled) writes the code; `thunder same` and the tests prove the change does what the Thunder says and nothing else. |
| 4 | **The running system** | When something breaks, people read logs and stack traces in the original language. | Traces, logs, and errors are shown on Thunder's pictures: which path ran, how often, where it failed, with what input; errors are explained in Thunder. |
| 5 | **The whole system** | Software is many files, services, and machines. | Calls across files and services, where each value comes from, state over time, events and queues, who can do what, and infrastructure (Terraform, Bicep, Kubernetes, Compose, pipelines) on one map. |
| 6 | **Review in Thunder** | Changes are approved by reading code diffs. | A pull request shows what changed in meaning ("Now stops when the card is expired"), in GitHub and in OpenThunder, so it can be reviewed without reading the code diff. |
| 7 | **Real people** | The bar (a 12-year-old can read it; an architect can trust it) is a promise until people show it. | Unaided sessions with people who did not build Thunder, recorded with what they understood and where they got lost, repeated after each change. |

Honest by design throughout: what Thunder cannot yet explain is shown as code; AI-written parts are labeled and are
never the evidence; nothing is claimed that a run or a reading does not show.
