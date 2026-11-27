# What does shipping cost?

def calculate_shipping(weight, express):
    cost = 5
    if weight > 10:
        cost = 15
    elif weight > 5:
        cost = 10
    if express:
        cost = cost * 2
    return cost
