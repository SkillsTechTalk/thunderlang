// Samples for Semantic Zoom. Plain code a reader can recognize; nothing here is drawn by hand.
export type ZoomSample = { key: string; label: string; language: "python" | "typescript"; file: string; code: string };

export const ZOOM_SAMPLES: ZoomSample[] = [
  {
    key: "library-py",
    label: "School library (Python)",
    language: "python",
    file: "library.py",
    code: `from dataclasses import dataclass
from enum import Enum


class Status(Enum):
    ON_SHELF = "on shelf"
    BORROWED = "borrowed"
    LOST = "lost"


@dataclass
class Book:
    """A book in the school library."""
    title: str
    status: Status = Status.ON_SHELF
    times_borrowed: int = 0


class Library:
    """Lends books to students and takes them back."""

    def __init__(self, max_books: int = 3):
        self.books = []
        self.max_books = max_books

    def add_book(self, book):
        """Put a new book on the shelf."""
        self.books.append(book)

    def can_borrow(self, books_out: int, has_late_book: bool) -> bool:
        """A student may borrow when they have room and nothing late."""
        return books_out < self.max_books and not has_late_book

    def borrow(self, student, book):
        """A student takes a book home."""
        if book.status != Status.ON_SHELF:
            raise NotAvailable("Someone else has this book")
        if not self.can_borrow(len(student.books), student.has_late_book):
            raise CannotBorrow("Return a book first")
        book.status = Status.BORROWED
        book.times_borrowed += 1
        student.books.append(book)

    def late_fee(self, days_late: int) -> str:
        """Small fines for late books."""
        if days_late <= 0:
            return "NoFee"
        if days_late <= 7:
            return "SmallFee"
        return "BigFee"
`,
  },
  {
    key: "library-ts",
    label: "School library (TypeScript)",
    language: "typescript",
    file: "library.ts",
    code: `enum Status { OnShelf = "on shelf", Borrowed = "borrowed", Lost = "lost" }

/** A book in the school library. */
interface Book { title: string; status: Status; timesBorrowed: number }

/** Lends books to students and takes them back. */
export class Library {
  private books: Book[] = [];

  constructor(private maxBooks: number = 3) {}

  /** Small fines for late books. */
  lateFee(daysLate: number): string {
    if (daysLate <= 0) return "NoFee";
    if (daysLate <= 7) return "SmallFee";
    return "BigFee";
  }

  /** A student takes a book home. */
  borrow(student: Student, book: Book): void {
    if (book.status !== Status.OnShelf) throw new NotAvailable("Someone else has this book");
    if (student.hasLateBook) throw new CannotBorrow("Return a book first");
    book.status = Status.Borrowed;
    book.timesBorrowed += 1;
    student.books.push(book);
  }
}
`,
  },
  {
    key: "pizza-py",
    label: "Pizza delivery (Python)",
    language: "python",
    file: "orders.py",
    code: `"""Customers order pizza and get it delivered."""


def delivery_fee(total: float, distance_km: float) -> str:
    """Nearby orders of $20 or more are delivered free."""
    if total >= 20 and distance_km <= 5:
        return "Free"
    if distance_km > 15:
        return "TooFar"
    return "Standard"


@router.post("/orders")
def place_order(order, card):
    """A customer orders pizza and pays for it."""
    if not order.items:
        raise EmptyOrder("Add at least one pizza")
    total = 0
    for item in order.items:
        total += item.price
    fee = delivery_fee(total, order.distance_km)
    if fee == "TooFar":
        raise TooFar("We do not deliver that far")
    payment = stripe.charge(card, total)
    send_email(order.customer, "Your pizza is on its way")
    return payment
`,
  },
];
