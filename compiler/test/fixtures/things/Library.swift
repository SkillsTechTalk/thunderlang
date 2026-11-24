import Foundation

/// Where a book is.
enum Status {
    case onShelf, borrowed, lost
}

/// A book in the school library.
struct Book {
    let title: String
    var status: Status = .onShelf
}

/// Lends books to students and takes them back.
final class Library {
    let maxBooks: Int
    private(set) var overflow: [Book] = []

    init(maxBooks: Int = 3) {
        self.maxBooks = maxBooks
    }
}

extension Library {
    func lateFee(daysLate: Int) -> String {
        if daysLate <= 7 {
            return "SmallFee"
        }
        return "BigFee"
    }
}
