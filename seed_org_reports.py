import argparse
import random
import re
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import firestore

import firebase_admin_setup  # noqa: F401


PLATFORMS = ["facebook", "twitter", "youtube", "telegram", "tiktok"]
STATUSES = ["new", "reviewed"]
LANGUAGES = ["ar"]
COUNTRIES = ["SY"]
REGIONS = ["Damascus", "Aleppo", "Homs", "Idlib", "Daraa"]

HATE_LABEL_IDS = [
    "CALL_FOR_VIOLENCE",
    "SECTARIAN_RELIGIOUS_INCITEMENT",
    "HATE_SPEECH_GROUP",
    "POLITICAL_VIOLENCE_INCITEMENT",
    "WAR_CRIMES_DENIAL_JUSTIFICATION",
]

NON_HATE_LABEL_IDS = [
    "TOXIC_PERSONAL_ATTACK",
    "NEUTRAL_OTHER",
]

HATE_SAMPLES = [
    {
        "text": "يجب طرد هؤلاء الناس من البلد لأنهم لا يستحقون العيش بيننا",
        "label_id": "HATE_SPEECH_GROUP",
        "reason_ar": "النص يهاجم جماعة كاملة ويجردها من حقها في العيش داخل المجتمع.",
    },
    {
        "text": "هذه الفئة خطر على المجتمع ويجب التخلص منهم",
        "label_id": "CALL_FOR_VIOLENCE",
        "reason_ar": "النص يتضمن تحريضًا مباشرًا على الإقصاء والأذى ضد فئة مستهدفة.",
    },
    {
        "text": "كل من ينتمي إلى هذه الجماعة خائن وعدو",
        "label_id": "HATE_SPEECH_GROUP",
        "reason_ar": "النص يعمم وصفًا عدائيًا ومهينًا على جماعة كاملة.",
    },
    {
        "text": "لا مكان لهؤلاء بيننا ويجب إقصاؤهم بالقوة",
        "label_id": "CALL_FOR_VIOLENCE",
        "reason_ar": "النص يدعو إلى استخدام القوة ضد جماعة مستهدفة.",
    },
    {
        "text": "هذه الطائفة سبب خراب البلد ويجب محاسبتهم جميعًا",
        "label_id": "SECTARIAN_RELIGIOUS_INCITEMENT",
        "reason_ar": "النص يحرض ضد طائفة دينية أو مذهبية بشكل جمعي.",
    },
    {
        "text": "يجب إسكات هذه المجموعة ومنعهم من الظهور",
        "label_id": "HATE_SPEECH_GROUP",
        "reason_ar": "النص يستهدف جماعة كاملة بالدعوة إلى القمع والإقصاء.",
    },
    {
        "text": "تبرير استهداف المدنيين من هذه الفئة أمر مشروع",
        "label_id": "WAR_CRIMES_DENIAL_JUSTIFICATION",
        "reason_ar": "النص يبرر الأذى واسع النطاق ضد فئة مدنية.",
    },
    {
        "text": "يجب ضرب أنصار هذا التيار السياسي في الشارع",
        "label_id": "POLITICAL_VIOLENCE_INCITEMENT",
        "reason_ar": "النص يحرض على العنف ضد فئة بسبب انتمائها السياسي.",
    },
]

OFFENSIVE_SAMPLES = [
    {
        "text": "هذا الكلام مقرف ومستفز جدًا",
        "label_id": "TOXIC_PERSONAL_ATTACK",
        "reason_ar": "النص يتضمن إساءة شخصية ولهجة عدائية دون استهداف جماعة محمية كاملة.",
    },
    {
        "text": "أنتم جماعة فاشلة ولا تفهمون شيئًا",
        "label_id": "TOXIC_PERSONAL_ATTACK",
        "reason_ar": "النص هجومي ومهين لكنه أقرب إلى الإهانة الشخصية منه إلى خطاب كراهية صريح.",
    },
    {
        "text": "هذا المحتوى مليء بالإهانة والتحقير",
        "label_id": "TOXIC_PERSONAL_ATTACK",
        "reason_ar": "النص يحمل طابعًا مهينًا ومحتقرًا.",
    },
    {
        "text": "صاحب هذا المنشور شخص حقير",
        "label_id": "TOXIC_PERSONAL_ATTACK",
        "reason_ar": "النص يهاجم شخصًا بشكل مباشر ومهين.",
    },
    {
        "text": "كلام كله سب وشتم وتحريض",
        "label_id": "TOXIC_PERSONAL_ATTACK",
        "reason_ar": "النص عدائي ومسيء لكنه ليس مصنفًا كخطاب كراهية جماعي صريح.",
    },
]

NEUTRAL_SAMPLES = [
    {
        "text": "ناقشنا اليوم أثر الخطاب الإعلامي على المجتمع",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص وصفي وتحليلي ولا يتضمن تحريضًا أو استهدافًا عدائيًا مباشرًا.",
    },
    {
        "text": "هذا منشور إخباري عن تطورات الأوضاع في المنطقة",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص إخباري عام ولا يحتوي على إساءة أو تحريض.",
    },
    {
        "text": "يجب تعزيز خطاب التماسك المجتمعي ونبذ الكراهية",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص يدعو إلى الحد من الكراهية ولا يروج لها.",
    },
    {
        "text": "تم نشر تقرير جديد حول خطاب الكراهية على المنصات الرقمية",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص يتحدث عن الظاهرة بشكل وصفي ولا يتبنى خطابًا محرضًا.",
    },
    {
        "text": "هذه مداخلة تحليلية تناقش أثر المحتوى المتوتر على الجمهور",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص تحليلي وغير تحريضي.",
    },
    {
        "text": "نتابع اليوم مؤشرات التفاعل على عدد من المنصات",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص عام ومحايد.",
    },
    {
        "text": "هذا محتوى عام لا يحتوي على تحريض مباشر",
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "النص لا يتضمن خطاب كراهية أو تحريضًا مباشرًا.",
    },
]

TARGET_GROUPS = [
    "طائفة دينية",
    "مجموعة إثنية",
    "نازحون",
    "لاجئون",
    "نشطاء",
    "إعلاميون",
    "أقلية اجتماعية",
    "مجتمع محلي",
]

AUTHORS = [
    "anon_001",
    "anon_002",
    "anon_003",
    "observer_01",
    "monitor_07",
    "user_test_1",
]

LABEL_META = {
    "CALL_FOR_VIOLENCE": {
        "label_en": "Call for Violence",
        "label_ar": "دعوة أو تحريض على العنف",
        "classification": "hate",
        "severity": "high",
        "confidence_range": (0.88, 0.99),
    },
    "SECTARIAN_RELIGIOUS_INCITEMENT": {
        "label_en": "Sectarian / Religious Incitement",
        "label_ar": "تحريض طائفي أو ديني",
        "classification": "hate",
        "severity": "high",
        "confidence_range": (0.86, 0.98),
    },
    "HATE_SPEECH_GROUP": {
        "label_en": "Hate Speech Against a Group",
        "label_ar": "خطاب كراهية ضد جماعة",
        "classification": "hate",
        "severity": "high",
        "confidence_range": (0.85, 0.98),
    },
    "POLITICAL_VIOLENCE_INCITEMENT": {
        "label_en": "Political Violence Incitement",
        "label_ar": "تحريض على العنف السياسي",
        "classification": "hate",
        "severity": "high",
        "confidence_range": (0.84, 0.97),
    },
    "WAR_CRIMES_DENIAL_JUSTIFICATION": {
        "label_en": "War Crimes Denial / Justification",
        "label_ar": "تبرير أو إنكار أذى واسع",
        "classification": "hate",
        "severity": "high",
        "confidence_range": (0.84, 0.97),
    },
    "TOXIC_PERSONAL_ATTACK": {
        "label_en": "Toxic Personal Attack",
        "label_ar": "هجوم شخصي سام",
        "classification": "offensive",
        "severity": "medium",
        "confidence_range": (0.68, 0.89),
    },
    "NEUTRAL_OTHER": {
        "label_en": "Neutral / Other",
        "label_ar": "محايد / غير ذلك",
        "classification": "neutral",
        "severity": "low",
        "confidence_range": (0.82, 0.97),
    },
}


def get_db():
    if not firebase_admin._apps:
        raise RuntimeError(
            "Firebase Admin is not initialized. "
            "Check firebase_admin_setup.py and ensure it initializes the default app."
        )
    return firestore.client()


def random_timestamp_within_days(days_back: int = 14) -> datetime:
    now = datetime.now(timezone.utc)
    delta_days = random.randint(0, days_back)
    delta_hours = random.randint(0, 23)
    delta_minutes = random.randint(0, 59)
    return now - timedelta(days=delta_days, hours=delta_hours, minutes=delta_minutes)


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    parts = re.findall(r"[\u0600-\u06FFa-zA-Z0-9_]+", text.lower())
    out = []
    seen = set()
    for p in parts:
        if len(p) < 3:
            continue
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out[:20]


def choose_report_sample():
    r = random.random()
    if r < 0.45:
        return random.choice(HATE_SAMPLES)
    if r < 0.70:
        return random.choice(OFFENSIVE_SAMPLES)
    return random.choice(NEUTRAL_SAMPLES)


def confidence_for(label_id: str) -> float:
    low, high = LABEL_META[label_id]["confidence_range"]
    return round(random.uniform(low, high), 3)


def build_report(org_id: str, idx: int) -> dict:
    sample = choose_report_sample()
    label_id = sample["label_id"]
    text = sample["text"]
    reason_ar = sample["reason_ar"]

    meta = LABEL_META[label_id]
    classification = meta["classification"]
    created_at = random_timestamp_within_days(14)
    confidence = confidence_for(label_id)
    low_confidence = confidence < 0.70
    target_group = random.choice(TARGET_GROUPS)
    platform = random.choice(PLATFORMS)

    report_id = f"seed-{org_id}-{idx:03d}"
    searchable_tokens = tokenize(text)

    is_hate = label_id in HATE_LABEL_IDS
    is_offensive = label_id == "TOXIC_PERSONAL_ATTACK"

    return {
        "report_id": report_id,
        "org_id": org_id,
        "organization_id": org_id,
        "scope": "org",
        "source_mode": "organization",
        "source": platform,
        "platform": platform,
        "text": text,
        "content": text,
        "raw_text": text,
        "normalized_text": text.lower(),
        "searchable_text": f"{text} {reason_ar}".strip(),
        "searchable_tokens": searchable_tokens,
        "language": random.choice(LANGUAGES),
        "country": random.choice(COUNTRIES),
        "region": random.choice(REGIONS),
        "author": random.choice(AUTHORS),
        "author_id": random.choice(AUTHORS),
        "target_group": target_group,
        "label_id": label_id,
        "label_en": meta["label_en"],
        "label_ar": meta["label_ar"],
        "classification": classification,
        "label": classification,
        "predicted_label": classification,
        "reason_ar": reason_ar,
        "confidence": confidence,
        "confidence_score": confidence,
        "model_confidence": confidence,
        "is_hate": is_hate,
        "is_hate_speech": is_hate,
        "is_offensive": is_offensive,
        "severity": meta["severity"],
        "low_confidence": low_confidence,
        "needs_review": low_confidence or is_offensive,
        "review_recommended": low_confidence or is_offensive,
        "fallback_used": False,
        "parse_status": "ok",
        "classification_status": "ok" if not low_confidence else "needs_review",
        "verified": False,
        "status": random.choice(STATUSES),
        "created_at": created_at,
        "timestamp": created_at,
        "submitted_at": created_at,
        "updated_at": created_at,
        "post_time": created_at.isoformat(),
        "tags": [platform, classification, target_group],
        "seeded": True,
        "seed_batch": "org_dashboard_test_v2",
    }


def delete_existing_seeded_reports(org_id: str):
    db = get_db()
    collection_name = f"reports_{org_id}"
    print(f"Deleting existing seeded reports from {collection_name} ...")

    docs = list(
        db.collection(collection_name)
        .where("seeded", "==", True)
        .stream()
    )

    if not docs:
        print("No existing seeded reports found.")
        return

    deleted = 0
    batch = db.batch()

    for doc in docs:
        batch.delete(doc.reference)
        deleted += 1

        if deleted % 300 == 0:
            batch.commit()
            batch = db.batch()

    batch.commit()
    print(f"Deleted {deleted} seeded reports.")


def seed_reports(org_id: str, count: int, replace_seeded: bool = True):
    db = get_db()
    collection_name = f"reports_{org_id}"

    if replace_seeded:
        delete_existing_seeded_reports(org_id)

    print(f"Seeding {count} reports into collection: {collection_name}")

    batch = db.batch()
    written = 0

    for i in range(count):
        data = build_report(org_id, i + 1)
        doc_ref = db.collection(collection_name).document()
        batch.set(doc_ref, data)
        written += 1

        if written % 400 == 0:
            batch.commit()
            batch = db.batch()
            print(f"Committed {written} reports so far...")

    batch.commit()
    print(f"Done. Inserted {written} reports into {collection_name}")


def main():
    parser = argparse.ArgumentParser(description="Seed realistic org reports into Firestore.")
    parser.add_argument("--org-id", required=True, help="Organization ID used in reports_<org_id>")
    parser.add_argument("--count", type=int, default=25, help="Number of reports to insert")
    parser.add_argument(
        "--keep-old-seeded",
        action="store_true",
        help="Keep previously seeded reports instead of deleting them first",
    )
    args = parser.parse_args()

    seed_reports(
        org_id=args.org_id,
        count=args.count,
        replace_seeded=not args.keep_old_seeded,
    )


if __name__ == "__main__":
    main()