# How many loyalty points does an order earn?

def count_points(dollars_spent, member_years):
    points = dollars_spent
    if member_years >= 5:
        points = points * 2
    elif member_years >= 2:
        points = points + 10
    return points
