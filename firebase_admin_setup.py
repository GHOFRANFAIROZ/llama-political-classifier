import os
import json
import logging
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("firebase-setup")

logger.info("[FIREBASE INIT] start")

if not firebase_admin._apps:
    firebase_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

    if firebase_json:
        logger.info("[FIREBASE INIT] using FIREBASE_SERVICE_ACCOUNT_JSON from env")
        try:
            cred_dict = json.loads(firebase_json)
            logger.info(
                "[FIREBASE INIT] parsed service account json project_id=%s client_email=%s",
                cred_dict.get("project_id"),
                cred_dict.get("client_email"),
            )
            cred = credentials.Certificate(cred_dict)
        except Exception as e:
            logger.exception("[FIREBASE INIT] invalid FIREBASE_SERVICE_ACCOUNT_JSON: %s", e)
            raise
    else:
        logger.warning("[FIREBASE INIT] env not found, falling back to firebase_key.json")
        cred = credentials.Certificate("firebase_key.json")

    logger.info("[FIREBASE INIT] before initialize_app()")
    firebase_admin.initialize_app(cred)
    logger.info("[FIREBASE INIT] initialize_app() done")
else:
    logger.info("[FIREBASE INIT] app already initialized")

logger.info("[FIREBASE INIT] before firestore.client()")
db = firestore.client()
logger.info("[FIREBASE INIT] firestore.client() done")