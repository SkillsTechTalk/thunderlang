// A sample run of the School library (Python) example, for "What happened when it ran" on Semantic Zoom.
// Recorded, not drawn by hand: Thunder's Python recorder (compiler/src/runners/thunder_trace.py, the one
// `thunder verify --run` uses) ran a made-up school day against this exact code: 30 students trying to borrow 200
// times from 40 books, and 12 late-fee lookups. The crash is the real traceback from one more made-up call (a student
// record whose books are a tuple). The same record is compiler/test/fixtures/running/library-trace.json.
export type SampleRun = { sampleKey: string; label: string; trace: { files: Record<string, unknown> }; crash: string };

export const SAMPLE_RUN: SampleRun = {
  sampleKey: "library-py",
  label: "201 tries to borrow (a made-up school day: 30 students, 40 books, 200 tries; plus one student record whose books were a tuple, which crashed) and 12 late-fee lookups, recorded with Thunder's Python recorder",
  trace: {"files":{"library.py":{"functions":{"22":{"runs":2,"returns":{},"raises":{},"fellOff":2,"unwound":0,"fellOffAt":{"24":2}},"26":{"runs":40,"returns":{},"raises":{},"fellOff":40,"unwound":0,"fellOffAt":{"28":40}},"30":{"runs":84,"returns":{"32":{"count":84,"values":["True","False"]}},"raises":{},"fellOff":0,"unwound":0},"34":{"runs":201,"returns":{},"raises":{"37":{"count":117,"types":{"NotAvailable":["NotAvailable","Exception","BaseException","object"]}},"39":{"count":13,"types":{"CannotBorrow":["CannotBorrow","Exception","BaseException","object"]}}},"fellOff":70,"unwound":131,"fellOffAt":{"42":70}},"44":{"runs":12,"returns":{"47":{"count":4,"values":["\"NoFee\""]},"49":{"count":5,"values":["\"SmallFee\""]},"50":{"count":3,"values":["\"BigFee\""]}},"raises":{},"fellOff":0,"unwound":0}},"decisions":{"36":{"kind":"if","obs":{"after|38":84,"body|37":117}},"38":{"kind":"if","obs":{"after|40":71,"body|39":13}},"46":{"kind":"if","obs":{"body|47":4,"after|48":8}},"48":{"kind":"if","obs":{"body|49":5,"after|50":3}}},"returns":{"32":null,"47":46,"49":48,"50":null}}}},
  crash: "Traceback (most recent call last):\n  File \"/home/ci/school/tests/test_day.py\", line 45, in test_tuple_of_books\n    lib.borrow(s, library.Book(\"Charlotte's Web\"))\n    ~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n  File \"/home/ci/school/library.py\", line 42, in borrow\n    student.books.append(book)\n    ^^^^^^^^^^^^^^^^^^^^\nAttributeError: 'tuple' object has no attribute 'append'\n",
};
