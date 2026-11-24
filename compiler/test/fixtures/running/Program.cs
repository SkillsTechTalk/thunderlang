namespace School;

public class Book
{
    public string Title = "";
    public string Status = "on shelf";
}

public class Library
{
    private readonly Dictionary<string, Book> books = new();

    /// Finds a book by its title.
    public Book Find(string title)
    {
        if (string.IsNullOrEmpty(title))
            throw new ArgumentException("A title is needed");
        return books[title];
    }
}

public static class Program
{
    public static void Main()
    {
        var lib = new Library();
        Console.WriteLine(lib.Find("Matilda").Title);
    }
}
