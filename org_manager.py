# org_manager.py
import secrets
import unicodedata
import re
from firebase_admin import firestore
from firebase_admin_setup import db

class OrgManager:
    def __init__(self):
        self.db = db
        self.orgs_collection = self.db.collection("organizations")

    # -----------------------------------------
    # Normalize org_name → stable org_id
    # -----------------------------------------
    def normalize_name(self, name: str) -> str:
        name = name.strip().lower()

        # Remove diacritics (harakat/accent)
        name = "".join(
            c
            for c in unicodedata.normalize("NFD", name)
            if unicodedata.category(c) != "Mn"
        )

        # Replace spaces with underscores
        name = name.replace(" ", "_")

        # Keep Arabic, English, digits, underscore
        name = re.sub(r"[^a-zA-Z0-9_\u0600-\u06FF]", "", name)

        return name

    # -----------------------------------------
    # Slug for dashboard URLs
    # -----------------------------------------
    def make_slug(self, name: str) -> str:
        """
        Create a URL-friendly slug from display name.
        Uses normalize_name, then converts '_' → '-'.
        """
        base = self.normalize_name(name)
        slug = base.replace("_", "-")
        return slug

    # -----------------------------------------
    # Check if organization exists
    # -----------------------------------------
    def org_exists(self, org_id: str) -> bool:
        return self.orgs_collection.document(org_id).get().exists

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

        self.orgs_collection.document(org_id).set(metadata)
        return metadata

    # -----------------------------------------
    # Entry point: get or auto-create
    # -----------------------------------------
    def get_or_create_org(self, org_name: str):
        org_id = self.normalize_name(org_name)
        doc_ref = self.orgs_collection.document(org_id)
        doc = doc_ref.get()

        # Existing org?
        if doc.exists:
            data = doc.to_dict() or {}
            # Ensure slug exists
            if not data.get("slug"):
                display_name = data.get("display_name") or org_name
                slug = self.make_slug(display_name)
                data["slug"] = slug
                doc_ref.update({"slug": slug})
            return data

        # New organization → Firestore only
        return self.create_organization(org_id, org_name)

    # -----------------------------------------
    # List all organizations (for dashboard)
    # -----------------------------------------
    def list_orgs(self):
        orgs = []
        for doc in self.orgs_collection.stream():
            data = doc.to_dict() or {}

            # Ensure org_id
            if not data.get("org_id"):
                data["org_id"] = doc.id

            # Ensure display_name
            if not data.get("display_name"):
                data["display_name"] = data["org_id"]

            # Ensure slug
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
        return orgs