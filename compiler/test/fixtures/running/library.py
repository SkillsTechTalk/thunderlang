from dataclasses import dataclass
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
