class NotAvailable extends Error {}

/** Lends books to students and takes them back. */
class Library {
  constructor(maxBooks = 3) {
    this.maxBooks = maxBooks;
  }

  /** A student takes a book home. */
  borrow(student, book) {
    if (book.status !== 'on shelf') throw new NotAvailable('Someone else has this book');
    if (student.hasLateBook) throw new Error('Return a book first');
    book.status = 'borrowed';
    book.timesBorrowed += 1;
    student.books.push(book);
  }
}

function checkout(lib, student, title) {
  const book = { title, status: 'on shelf', timesBorrowed: 0 };
  lib.borrow(student, book);
  return book;
}

module.exports = { Library, checkout };
