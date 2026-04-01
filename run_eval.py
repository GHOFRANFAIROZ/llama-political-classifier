import csv
import time
import requests

API_BASE = "https://anti-hate-api.mangowave-59e53001.germanywestcentral.azurecontainerapps.io"
ENDPOINT = f"{API_BASE}/classify_v2"

DATA = [
    # --- Call for Violence ---
    ("لازم نحرقهم كلهم ونخلص من شرهم، الدم بالدم يا شباب", "Call for Violence"),
    ("الحل الوحيد هو الرصاص، اقتلوهم وين ما شفتوهم", "Call for Violence"),
    ("ما رح نرتاح إلا لما نمسح هالحارة عن بكرة أبيها", "Call for Violence"),
    ("الموت للخونة، لازم نعلق مشانقهم بالساحات", "Call for Violence"),
    ("اجمعوا حالكم واهجموا عليهم ببيوتهم، لا ترحموا حدا", "Call for Violence"),

    # --- Sectarian Incitement ---
    ("هادول الطائفة نجس ولازم يتطهر البلد منهم", "Sectarian Incitement"),
    ("كل عمرهم غدارين، لا توثق بحدا من ملتهم", "Sectarian Incitement"),
    ("الله يلعن هالجماعة، هنن سبب خراب البلد من قرون", "Sectarian Incitement"),
    ("لا تخلطوا معهم، هدول ولاد متعة وكفار", "Sectarian Incitement"),
    ("أصلاً معروف عنهم إنهم بيبيعوا حالهم للغريب، خيانة بدمهم", "Sectarian Incitement"),

    # --- Spreading False Information ---
    ("سمعت إنه الحكومة رح تقطع الانترنت عن كل البلد بكرا نهائياً", "Spreading False Information"),
    ("لقوا مواد سامة عم يحطوها بالخبز بالمناطق المحررة", "Spreading False Information"),
    ("في اتفاق سري لبيع المحافظة لدولة أجنبية، الخبر مؤكد 100%", "Spreading False Information"),
    ("اللقاحات الجديدة عم تسبب عقم، ديروا بالكم تاخدوها", "Spreading False Information"),
    ("البنك المركزي رح يعلن إفلاسه بكرا الصبح، اسحبوا مصرياتكم", "Spreading False Information"),

    # --- Politically Charged but Not Harmful ---
    ("الوضع الاقتصادي سيء جداً والحكومة فاشلة بإدارة الأزمة", "Politically Charged but Not Harmful"),
    ("نحن نطالب بانتخابات نزيهة وتغيير الدستور فوراً", "Politically Charged but Not Harmful"),
    ("القرارات الوزارية الأخيرة دمرت الطبقة الوسطى تماماً", "Politically Charged but Not Harmful"),
    ("أنا ضد سياسة الرئيس الخارجية، لازم نفتح حوار مع الجميع", "Politically Charged but Not Harmful"),
    ("المعارضة كمان إلها أخطاء ومو كل شي بيعملوه صح", "Politically Charged but Not Harmful"),

    # --- Neutral / Other حسب القاعدة الجديدة ---
    ("صباح الخير يا جماعة، كيف كان يومكم؟", "Other"),
    ("اليوم الجو حلو كتير بالشام، بيجنن للمشي", "Neutral"),
    ("شو رأيكم بمباراة الكلاسيكو مبارح؟", "Other"),
    ("ممكن طريقة عمل الكبة اللبنية؟", "Other"),
    ("يا ريت الكل يلتزم بقوانين السير لسلامتكم", "Neutral"),

    ("عرض خاص لفترة محدودة، اشتري قطعة واحصل على الثانية مجاناً", "Other"),
    ("رابط لتحميل التطبيق، اضغط هنا", "Other"),
    ("شكراً لقبول الإضافة", "Other"),
    ("مطلوب موظفين للعمل براتب مغري، تواصل خاص", "Other"),
    ("تم النسخ", "Other"),

    # --- Gray Area ---
    ("الكهربا اجت ساعة وحدة بس اليوم، الله يعين العالم", "Neutral"),
    ("كل مرة بيوعدونا بحل أزمة الكهربا وما عم نشوف شي، ملينا وعود", "Politically Charged but Not Harmful"),
    ("الدولار اليوم صار بـ 15 ألف، الأسعار رح تشعل نار", "Neutral"),
    ("تجار الأزمة هنن السبب برفع الدولار، عم يمصوا دمنا", "Politically Charged but Not Harmful"),
    ("تم افتتاح طريق المتحلق الجنوبي بعد الصيانة", "Neutral"),
    ("فتحوا الطريق بس مشان يمرقوا سيارات المسؤولين، ونحنا علقانين بالزحمة", "Politically Charged but Not Harmful"),
    ("سوريا رح تضل هيك طالما الفساد نخر عضم المؤسسات", "Politically Charged but Not Harmful"),

    ("المؤامرة الكونية هي السبب الوحيد لكل شي صار بالبلد من 2011", "Politically Charged but Not Harmful"),
    ("في غواصات أجنبية هي اللي ضربت الساحل وسببت الزلزال، مو طبيعي", "Spreading False Information"),
    ("الوضع بمخيمات الشمال مأساوي والناس عم تموت من البرد", "Politically Charged but Not Harmful"),
    ("الفيديو اللي انتشر مبارح عن المخيمات هاد تصوير بآستديوهات برا البلد، كذب", "Spreading False Information"),
    ("الحكومة هي اللي دبرت التفجير مشان تلصقه بالمعارضة", "Politically Charged but Not Harmful"),
    ("سمعت تسجيل صوتي مسرب بيقول إنو رح يبيعوا حلب لتركيا الشهر الجاي", "Spreading False Information"),
    ("شوفوا هالفيديو كيف الجيش عم يقصف المدنيين اليوم [رابط فيديو من 2015]", "Spreading False Information"),

    ("أهل هاديك المنطقة طول عمرهم معروفين، الغدر بدمهم ما بيتغيروا", "Sectarian Incitement"),
    ("سكان المنطقة الفلانية وقوفهم مع النظام/المعارضة هو اللي دمر البلد", "Politically Charged but Not Harmful"),
    ("ما بيجينا البلا غير من اللي نزلوا علينا من الجبال، خربوا الشام", "Sectarian Incitement"),
    ("سياسة التغيير الديمغرافي اللي عم تصير رح تغير وجه سوريا للأبد", "Politically Charged but Not Harmful"),
    ("لا تتوقع الخير من حدا تربايته حقد ولطميات، هدول عقلهم مغسول", "Sectarian Incitement"),
    ("الأحزاب الدينية هي سبب تخلفنا، لازم نفصل الدين عن السياسة", "Politically Charged but Not Harmful"),
]

def call_api(text):
    r = requests.post(ENDPOINT, json={"text": text}, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
    rows = []

    for i, (text, expected) in enumerate(DATA, start=1):
        try:
            out = call_api(text)
            pred = out.get("label")
            conf = out.get("confidence_score")
            reason = out.get("reason", "")
            ok = pred == expected

            rows.append({
                "id": i,
                "expected": expected,
                "predicted": pred,
                "confidence": conf,
                "ok": ok,
                "text": text,
                "reason": reason
            })
        except Exception as e:
            rows.append({
                "id": i,
                "expected": expected,
                "predicted": "ERROR",
                "confidence": "",
                "ok": False,
                "text": text,
                "reason": str(e)
            })

        time.sleep(0.25)

    with open("eval_results.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "expected", "predicted", "confidence", "ok", "text", "reason"]
        )
        writer.writeheader()
        writer.writerows(rows)

    total = len(rows)
    correct = sum(1 for r in rows if r["ok"])
    print(f"Done. Correct: {correct}/{total} = {correct/total:.1%}")
    print("Saved: eval_results.csv")

if __name__ == "__main__":
    main()
