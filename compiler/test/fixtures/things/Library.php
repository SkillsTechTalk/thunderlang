<?php
enum Status: string {
    case OnShelf = 'on shelf';
    case Borrowed = 'borrowed';
}

/** Lends books to students and takes them back. */
class Library {
    private array $overflow = [];

    public function __construct(private int $maxBooks = 3) {}

    public function lateFee(int $daysLate): string {
        if ($daysLate <= 7) {
            return 'SmallFee';
        }
        return 'BigFee';
    }
}
