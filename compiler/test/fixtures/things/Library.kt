enum class Status { ON_SHELF, BORROWED, LOST }

/** A book in the school library. */
data class Book(val title: String, val status: Status = Status.ON_SHELF)

/** Lends books to students and takes them back. */
class Library(private val maxBooks: Int = 3) {
    val overflow = mutableListOf<Book>()

    fun lateFee(daysLate: Int): String {
        if (daysLate <= 7) return "SmallFee"
        return "BigFee"
    }
}
