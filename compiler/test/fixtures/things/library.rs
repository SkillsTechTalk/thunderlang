/// Where a book is.
pub enum Status { OnShelf, Borrowed, Lost }

/// A book in the school library.
pub struct Book { pub title: String, pub status: Status }

/// Lends books to students and takes them back.
pub struct Library { max_books: u32, overflow: Vec<Book> }

impl Library {
    pub fn new() -> Self {
        Library { max_books: 3, overflow: Vec::new() }
    }

    pub fn late_fee(&self, days_late: u32) -> &'static str {
        if days_late <= 7 {
            return "SmallFee";
        }
        "BigFee"
    }
}
