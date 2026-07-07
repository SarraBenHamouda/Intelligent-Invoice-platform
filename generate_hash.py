import bcrypt

password = "MonNouveauMotDePasse123!".encode()

hashed = bcrypt.hashpw(password, bcrypt.gensalt(rounds=10))
print(hashed.decode())