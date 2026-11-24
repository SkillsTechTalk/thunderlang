Book = Struct.new(:title, :status)

# Lends books to students and takes them back.
class Library
  attr_reader :max_books

  def initialize(max_books = 3)
    @max_books = max_books
    @overflow = []
  end

  def late_fee(days_late)
    return "SmallFee" if days_late <= 7
    "BigFee"
  end
end
