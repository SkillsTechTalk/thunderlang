enum Status { OnShelf; Borrowed }

class Book {
    [string]$Title
    [Status]$Status = [Status]::OnShelf
}

<#
.SYNOPSIS
Lends books to students and takes them back.
#>
class Library {
    [int]$MaxBooks = 3
    [Book[]]$Overflow = @()

    Library([int]$maxBooks) {
        $this.MaxBooks = $maxBooks
    }

    [string] LateFee([int]$daysLate) {
        if ($daysLate -le 7) { return 'SmallFee' }
        return 'BigFee'
    }
}
