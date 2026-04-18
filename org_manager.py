# org_manager.py
import secrets
import unicodedata
import re
import time
import logging
from firebase_admin import firestore
from firebase_admin_setup import db

logger = logging.getLogger("org-manager")


class OrgManager:
    def __init__(self):
        self.db = db
        self.orgs_collection = self.db.collection("organizations")
        logger.info("[ORG MANAGER] initialized collection=organizations")

    # -----------------------------------------
    # Normalize org_name → stable org_id
    # -----------------------------------------
    def normalize_name(self, name: str) -> str:
        name = name.strip().lower()

        name = "".join(
            c
            for c in unicodedata.normalize("NFD", name)
            if unicodedata.category(c) != "Mn"
        )

        name = name.replace(" ", "_")
        name = re.sub(r"[^a-zA-Z0-9_\u0600-\u06FF]", "", name)

        return name

    # -----------------------------------------
    # Slug for dashboard URLs
    # -----------------------------------------
    def make_slug(self, name: str) -> str:
        base = self.normalize_name(name)
        slug = base.replace("_", "-")
        return slug

    # -----------------------------------------
    # Check if organization exists
    # -----------------------------------------
    def org_exists(self, org_id: str) -> bool:
        logger.info("[ORG EXISTS] org_id=%s before get()", org_id)
        exists = self.orgs_collection.document(org_id).get().exists
        logger.info("[ORG EXISTS] org_id=%s exists=%s", org_id, exists)
        return exists

    # -----------------------------------------
    # Create full organization (Firestore ONLY)
    # -----------------------------------------
    def create_organization(self, org_id: str, display_name: str):
        slug = self.make_slug(display_name)

        token = secrets.token_hex(32)
        metadata = {
            "org_id": org_id,
            "display_name": display_name,
            "slug": slug,
            "plan": "Free",
            "org_token": token,
            "created_at": firestore.SERVER_TIMESTAMP,
        }

        logger.info("[CREATE ORG] org_id=%s before set()", org_id)
        self.orgs_collection.document(org_id).set(metadata)
        logger.info("[CREATE ORG] org_id=%s set() done", org_id)
        return metadata

    # -----------------------------------------
    # Entry point: get or auto-create
    # -----------------------------------------
    def get_or_create_org(self, org_name: str):
        org_id = self.normalize_name(org_name)
        doc_ref = self.orgs_collection.document(org_id)

        logger.info("[GET OR CREATE ORG] org_name=%s org_id=%s before get()", org_name, org_id)
        doc = doc_ref.get()
        logger.info("[GET OR CREATE ORG] org_id=%s get() done exists=%s", org_id, doc.exists)

        if doc.exists:
            data = doc.to_dict() or {}
            if not data.get("slug"):
                display_name = data.get("display_name") or org_name
                slug = self.make_slug(display_name)
                data["slug"] = slug
                logger.info("[GET OR CREATE ORG] org_id=%s missing slug -> update()", org_id)
                doc_ref.update({"slug": slug})
                logger.info("[GET OR CREATE ORG] org_id=%s slug update done", org_id)
            return data

        return self.create_organization(org_id, org_name)

    # -----------------------------------------
    # List all organizations (for dashboard)
    # -----------------------------------------
    def list_orgs(self):
        started = time.time()
        logger.info("[LIST ORGS] start")

        orgs = []
        stream = self.orgs_collection.stream()
        logger.info("[LIST ORGS] stream() opened")

        count = 0
        for doc in stream:
            count += 1
            if count == 1:
                logger.info("[LIST ORGS] first document received id=%s", doc.id)

            data = doc.to_dict() or {}

            if not data.get("org_id"):
                data["org_id"] = doc.id

            if not data.get("display_name"):
                data["display_name"] = data["org_id"]

            if not data.get("slug"):
                data["slug"] = self.make_slug(data["display_name"])

            orgs.append(
                {
                    "org_id": data["org_id"],
                    "display_name": data["display_name"],
                    "slug": data.get("slug"),
                    "plan": data.get("plan"),
                    "country": data.get("country"),
                }
            )

        duration_ms = int((time.time() - started) * 1000)
        logger.info("[LIST ORGS] done count=%s duration_ms=%s", count, duration_ms)
        return orgs