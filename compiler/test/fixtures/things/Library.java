import java.util.ArrayList;
import java.util.List;

/** A book's place in the library. */
enum Status { ON_SHELF, BORROWED, LOST }

/** A book in the school library. */
record Book(String title, Status status, int timesBorrowed) {}

/** Lends books to students and takes them back. */
public class Library {
    private static final int LIMIT = 10;
    private final int maxBooks;
    private final List<Book> overflow = new ArrayList<>();

    public Library(int maxBooks) {
        this.maxBooks = maxBooks;
    }

    public String lateFee(int daysLate) {
        if (daysLate <= 7) {
            return "SmallFee";
        }
        return "BigFee";
    }

    public void returnBook(Student student, Book book) {
        if (!student.books.contains(book)) {
            throw new NotBorrowedException("This student does not have this book");
        }
        student.books.remove(book);
    }
}
