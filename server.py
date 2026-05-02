from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json, os, sqlite3, hashlib, secrets
from urllib.parse import urlparse

DB = 'hearthledger.db'


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    c = conn(); cur = c.cursor()
    cur.executescript('''
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, password_hash TEXT);
    CREATE TABLE IF NOT EXISTS families(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS family_members(family_id INTEGER, user_id INTEGER, role TEXT, UNIQUE(family_id,user_id));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY, user_id INTEGER, family_id INTEGER, amount REAL, date TEXT, category TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY, user_id INTEGER, family_id INTEGER, name TEXT, amount REAL, category TEXT, frequency TEXT, start_date TEXT, active INTEGER DEFAULT 1);
    ''')
    c.commit(); c.close()


def h(p): return hashlib.sha256(p.encode()).hexdigest()

class H(BaseHTTPRequestHandler):
    def sendj(self, code, data):
        b = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.end_headers(); self.wfile.write(b)

    def do_OPTIONS(self): self.sendj(200,{"ok":True})

    def body(self):
        l=int(self.headers.get('Content-Length','0') or 0)
        return json.loads(self.rfile.read(l) or b'{}')

    def auth(self):
        t=(self.headers.get('Authorization','').replace('Bearer ','')).strip()
        if not t: return None
        c=conn(); r=c.execute('SELECT user_id FROM sessions WHERE token=?',(t,)).fetchone(); c.close()
        return r['user_id'] if r else None

    def serve_static(self, path):
        if path=='/': path='/index.html'
        fp='.'+path
        if not os.path.isfile(fp):
            self.send_response(404); self.end_headers(); return
        ct='text/plain'
        if fp.endswith('.html'): ct='text/html'
        if fp.endswith('.css'): ct='text/css'
        if fp.endswith('.js'): ct='application/javascript'
        with open(fp,'rb') as f: b=f.read()
        self.send_response(200); self.send_header('Content-Type',ct); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        p=urlparse(self.path).path
        if not p.startswith('/api/'):
            return self.serve_static(p)
        uid=self.auth()
        if p=='/api/me':
            if not uid: return self.sendj(401,{"error":"unauthorized"})
            c=conn();
            u=c.execute('SELECT id,email,name FROM users WHERE id=?',(uid,)).fetchone()
            fams=c.execute('SELECT f.id,f.name FROM families f JOIN family_members m ON f.id=m.family_id WHERE m.user_id=?',(uid,)).fetchall()
            fam_ids=[f['id'] for f in fams]
            tx=c.execute(f"SELECT * FROM transactions WHERE user_id=? OR family_id IN ({','.join(['?']*len(fam_ids)) if fam_ids else 'NULL'}) ORDER BY date DESC",([uid]+fam_ids)).fetchall()
            rc=c.execute(f"SELECT * FROM recurring WHERE user_id=? OR family_id IN ({','.join(['?']*len(fam_ids)) if fam_ids else 'NULL'}) ORDER BY id DESC",([uid]+fam_ids)).fetchall()
            members=c.execute('SELECT u.id,u.name,u.email,fm.family_id FROM users u JOIN family_members fm ON u.id=fm.user_id WHERE fm.family_id IN (SELECT family_id FROM family_members WHERE user_id=?)',(uid,)).fetchall()
            c.close()
            return self.sendj(200,{"user":dict(u),"families":[dict(x) for x in fams],"transactions":[dict(x) for x in tx],"recurring":[dict(x) for x in rc],"members":[dict(x) for x in members]})
        self.sendj(404,{"error":"not found"})

    def do_POST(self):
        p=urlparse(self.path).path
        d=self.body(); c=conn(); cur=c.cursor()
        if p=='/api/register':
            try:
                cur.execute('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)',(d['email'],d['name'],h(d['password'])))
                uid=cur.lastrowid
                cur.execute('INSERT INTO families(name) VALUES(?)',(f"{d['name']}'s Family",)); fid=cur.lastrowid
                cur.execute('INSERT INTO family_members(family_id,user_id,role) VALUES(?,?,?)',(fid,uid,'owner'))
                token=secrets.token_hex(24); cur.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(token,uid)); c.commit(); c.close()
                return self.sendj(200,{"token":token})
            except Exception as e:
                c.close(); return self.sendj(400,{"error":str(e)})
        if p=='/api/login':
            r=cur.execute('SELECT id,password_hash FROM users WHERE email=?',(d['email'],)).fetchone()
            if not r or r['password_hash']!=h(d['password']): c.close(); return self.sendj(401,{"error":"invalid credentials"})
            token=secrets.token_hex(24); cur.execute('INSERT INTO sessions(token,user_id) VALUES(?,?)',(token,r['id'])); c.commit(); c.close(); return self.sendj(200,{"token":token})
        uid=self.auth()
        if not uid: c.close(); return self.sendj(401,{"error":"unauthorized"})
        if p=='/api/transactions':
            cur.execute('INSERT INTO transactions(user_id,family_id,amount,date,category,note) VALUES(?,?,?,?,?,?)',(uid,d.get('family_id'),d['amount'],d['date'],d['category'],d.get('note',''))); c.commit(); c.close(); return self.sendj(200,{"ok":True})
        if p=='/api/recurring':
            cur.execute('INSERT INTO recurring(user_id,family_id,name,amount,category,frequency,start_date,active) VALUES(?,?,?,?,?,?,?,1)',(uid,d.get('family_id'),d['name'],d['amount'],d['category'],d['frequency'],d['start_date'])); c.commit(); c.close(); return self.sendj(200,{"ok":True})
        if p=='/api/family/invite':
            user=cur.execute('SELECT id FROM users WHERE email=?',(d['email'],)).fetchone()
            fam=cur.execute('SELECT family_id FROM family_members WHERE user_id=? LIMIT 1',(uid,)).fetchone()
            if not user or not fam: c.close(); return self.sendj(400,{"error":"user/family not found"})
            cur.execute('INSERT OR IGNORE INTO family_members(family_id,user_id,role) VALUES(?,?,?)',(fam['family_id'],user['id'],'member')); c.commit(); c.close(); return self.sendj(200,{"ok":True})
        c.close(); self.sendj(404,{"error":"not found"})

if __name__=='__main__':
    init_db()
    ThreadingHTTPServer(('0.0.0.0',8000),H).serve_forever()
