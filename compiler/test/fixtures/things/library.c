#include <stddef.h>

/* Where a book is. */
typedef enum { STATUS_ON_SHELF, STATUS_BORROWED, STATUS_LOST } Status;

/* A book in the school library. */
typedef struct {
    const char *title;
    Status status;
} Book;

/* Lends books to students and takes them back. */
typedef struct {
    int max_books;
    Book overflow[16];
    size_t overflow_count;
} Library;

/* A new library lends 3 books to each student and has no books waiting yet. */
Library library_new(void) {
    Library lib = { .max_books = 3, .overflow = {0}, .overflow_count = 0 };
    return lib;
}

const char *library_late_fee(const Library *lib, int days_late) {
    if (days_late <= 7) {
        return "SmallFee";
    }
    return "BigFee";
}
