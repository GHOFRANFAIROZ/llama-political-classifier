import firebase_admin
from firebase_admin import credentials, firestore

# تحميل مفتاح الخدمة
cred = credentials.Certificate("firebase_key.json")

# تشغيل Firebase Admin SDK
firebase_admin.initialize_app(cred)

# Firestore client الحقيقي
db = firestore.client()