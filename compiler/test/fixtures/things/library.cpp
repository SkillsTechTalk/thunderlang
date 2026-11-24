#include <string>
#include <vector>

// Where a book is.
enum class Status { OnShelf, Borrowed, Lost };

// A book in the school library.
struct Book {
    std::string title;
    Status status = Status::OnShelf;
};

// Lends books to students and takes them back.
class Library {
public:
    explicit Library(int maxBooks = 3) : maxBooks_(maxBooks) {}
    std::string lateFee(int daysLate) const;

private:
    int maxBooks_;
    std::vector<Book> overflow_{};
};

std::string Library::lateFee(int daysLate) const {
    if (daysLate <= 7) {
        return "SmallFee";
    }
    return "BigFee";
}
