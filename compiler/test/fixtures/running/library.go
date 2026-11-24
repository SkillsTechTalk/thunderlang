package main

import "fmt"

type Book struct {
	Title  string
	Status string
}

type Student struct {
	Books []*Book
}

// Borrow lends a book to a student.
func Borrow(s *Student, b *Book) error {
	if b.Status != "on shelf" {
		return fmt.Errorf("someone else has this book")
	}
	b.Status = "borrowed"
	s.Books = append(s.Books, b)
	return nil
}

// FirstBook gives back the student's first book.
func FirstBook(s *Student) *Book {
	return s.Books[0]
}

func main() {
	s := &Student{}
	fmt.Println(FirstBook(s).Title)
}
