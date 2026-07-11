import json
import sqlite3
from typing import Dict, Any
from backend.app.config import BACKEND_DIR, DB_FILE

SQLITE_DB_FILE = BACKEND_DIR / "azozo.db"

def get_connection():
    return sqlite3.connect(SQLITE_DB_FILE)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create tables for document-style storing
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        data TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        exam_id TEXT,
        data TEXT
    )
    """)
    conn.commit()
    
    # Check if legacy migration is needed
    cursor.execute("SELECT COUNT(*) FROM exams")
    exam_count = cursor.fetchone()[0]
    
    if exam_count == 0 and DB_FILE.exists():
        try:
            print("Migrating legacy db.json file contents into SQLite database...")
            with open(DB_FILE, "r", encoding="utf-8") as f:
                legacy_data = json.load(f)
                
            exams = legacy_data.get("exams", [])
            submissions = legacy_data.get("submissions", [])
            
            # Insert legacy exams
            for exam in exams:
                cursor.execute(
                    "INSERT OR REPLACE INTO exams (id, data) VALUES (?, ?)",
                    (exam["id"], json.dumps(exam, ensure_ascii=False))
                )
                
            # Insert legacy submissions
            for sub in submissions:
                cursor.execute(
                    "INSERT OR REPLACE INTO submissions (id, exam_id, data) VALUES (?, ?, ?)",
                    (sub["id"], sub.get("exam_id"), json.dumps(sub, ensure_ascii=False))
                )
                
            conn.commit()
            print(f"Successfully migrated {len(exams)} exams and {len(submissions)} submissions from legacy JSON db.")
            
            # Rename legacy db.json to db.json.bak to prevent double-migration
            backup_path = DB_FILE.with_suffix(".json.bak")
            DB_FILE.rename(backup_path)
            print(f"Legacy database renamed to {backup_path.name}")
        except Exception as e:
            print(f"Error during legacy database migration: {e}")
            
    conn.close()

# Initialize database on module load
init_db()

def load_db() -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    
    # Load exams
    cursor.execute("SELECT data FROM exams")
    exams = [json.loads(row[0]) for row in cursor.fetchall()]
    
    # Load submissions
    cursor.execute("SELECT data FROM submissions")
    submissions = [json.loads(row[0]) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "exams": exams,
        "submissions": submissions
    }

def save_db(data: Dict[str, Any]):
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("BEGIN TRANSACTION")
        
        # 1. Sync exams
        exams = data.get("exams", [])
        current_exam_ids = [exam["id"] for exam in exams if "id" in exam]
        
        if current_exam_ids:
            placeholders = ",".join("?" for _ in current_exam_ids)
            cursor.execute(f"DELETE FROM exams WHERE id NOT IN ({placeholders})", current_exam_ids)
        else:
            cursor.execute("DELETE FROM exams")
            
        for exam in exams:
            if "id" not in exam:
                continue
            cursor.execute(
                "INSERT OR REPLACE INTO exams (id, data) VALUES (?, ?)",
                (exam["id"], json.dumps(exam, ensure_ascii=False))
            )
            
        # 2. Sync submissions
        submissions = data.get("submissions", [])
        current_sub_ids = [sub["id"] for sub in submissions if "id" in sub]
        
        if current_sub_ids:
            placeholders = ",".join("?" for _ in current_sub_ids)
            cursor.execute(f"DELETE FROM submissions WHERE id NOT IN ({placeholders})", current_sub_ids)
        else:
            cursor.execute("DELETE FROM submissions")
            
        for sub in submissions:
            if "id" not in sub:
                continue
            cursor.execute(
                "INSERT OR REPLACE INTO submissions (id, exam_id, data) VALUES (?, ?, ?)",
                (sub["id"], sub.get("exam_id"), json.dumps(sub, ensure_ascii=False))
            )
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Transaction failed, changes rolled back: {e}")
        raise e
    finally:
        conn.close()
