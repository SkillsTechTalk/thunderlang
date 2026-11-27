# The average of the scores that count, and the letter it earns.

def grade(scores):
    counted = [s for s in scores if s >= 0]
    if not counted:
        return "no scores"
    average = sum(counted) / len(counted)
    if average >= 90:
        return "A"
    if average >= 80:
        return "B"
    if average >= 70:
        return "C"
    return "F"
