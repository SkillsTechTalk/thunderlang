using System.Collections.Generic;

public enum Status { OnShelf, Borrowed, Lost }

/// <summary>A book in the school library.</summary>
public record Book(string Title, Status Status);

/// <summary>Lends books to students and takes them back.</summary>
public class Library
{
    public int MaxBooks { get; set; } = 3;
    private readonly List<Book> _overflow = new List<Book>();

    public Library(int maxBooks = 3)
    {
        MaxBooks = maxBooks;
    }

    public string LateFee(int daysLate)
    {
        if (daysLate <= 7) return "SmallFee";
        return "BigFee";
    }
}
