package com.school;

import java.util.List;

/** Lends books to students and takes them back. */
public class Library {
    private final int maxBooks;

    public Library(int maxBooks) {
        this.maxBooks = maxBooks;
    }

    /** A student takes a book home. */
    public void borrow(Student student, Book book) {
        if (!book.getStatus().equals("on shelf")) {
            throw new NotAvailableException("Someone else has this book");
        }
        if (student.getBooks().size() >= maxBooks) {
            throw new IllegalStateException("Return a book first");
        }
        book.setStatus("borrowed");
        student.getBooks().add(book);
    }
}
