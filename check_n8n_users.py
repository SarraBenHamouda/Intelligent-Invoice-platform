import sqlite3

db = r"C:\intelligent-invoice-platform\database.sqlite"

conn = sqlite3.connect(db)
cur = conn.cursor()

print("=== TABLES ===")
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
for row in cur.fetchall():
    print(row[0])

print("\n=== USERS ===")

try:
    cur.execute('SELECT * FROM "user"')
    cols = [d[0] for d in cur.description]
    print(cols)

    for row in cur.fetchall():
        print(row)

except Exception as e:
    print(e)

conn.close()