import sqlite3

db = r"C:\intelligent-invoice-platform\database.sqlite"

new_hash = "$2b$10$.UPcrUqzgl0Pm63uFK9ltues/CEd9VxNBJARx7sQyfcJp.HFeMsAC"

conn = sqlite3.connect(db)
cur = conn.cursor()

cur.execute(
    'UPDATE "user" SET password=? WHERE email=?',
    (new_hash, "sarra.benhamouda@esprit.tn")
)

conn.commit()
print("Mot de passe mis à jour :", cur.rowcount)
conn.close()