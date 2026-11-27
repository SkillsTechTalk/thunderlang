# Is a password strong enough?

def check_password(password):
    if len(password) < 8:
        return "too short"
    if " " in password:
        return "no spaces allowed"
    if password == password.lower():
        return "add a capital letter"
    return "strong"
