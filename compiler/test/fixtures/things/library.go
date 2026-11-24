package library

// Status is where a book is.
type Status int

const (
	OnShelf Status = iota
	Borrowed
	Lost
)

// Book is a book in the school library.
type Book struct {
	Title  string
	Status Status
}

// Library lends books to students and takes them back.
type Library struct {
	MaxBooks int
	Overflow []Book
}

// NewLibrary makes a library.
func NewLibrary() *Library {
	return &Library{MaxBooks: 3, Overflow: []Book{}}
}

// LateFee picks the fine.
func (l *Library) LateFee(daysLate int) string {
	if daysLate <= 7 {
		return "SmallFee"
	}
	return "BigFee"
}
