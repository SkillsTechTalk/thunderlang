Book <- setClass("Book", representation(title = "character", status = "character"))

#' Lends books to students and takes them back.
Library <- R6::R6Class("Library",
  public = list(
    max_books = 3,
    overflow = list(),
    initialize = function(max_books = 3) {
      self$max_books <- max_books
    },
    late_fee = function(days_late) {
      if (days_late <= 7) return("SmallFee")
      "BigFee"
    }
  )
)
