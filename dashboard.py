import pandas as pd
import streamlit as st
import os
import json
from datetime import datetime

st.set_page_config(page_title="Groq Classification Dashboard", layout="wide")
st.title("📊 Political Post Classification using LLaMA 3 (Groq API)")

def load_reports(directory):
    records = []
    for folder in os.listdir(directory):
        info_path = os.path.join(directory, folder, "info.json")
        if os.path.isfile(info_path):
            with open(info_path, encoding="utf-8") as f:
                try:
                    data = json.load(f)
                    base = data.get("report_data", {})
                    base["timestamp"] = data.get("timestamp")
                    base["classification"] = data.get("classification", "N/A")
                    base["confidence"] = data.get("confidence", None)
                    records.append(base)
                except Exception as e:
                    st.warning(f"❌ Failed to load {info_path}: {e}")
    return records

reports = load_reports("reports")

if reports:
    df = pd.DataFrame(reports)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"])

    st.success(f"✅ Loaded {len(df)} reports")

    min_date = df["timestamp"].min().date() if not df["timestamp"].isna().all() else None
    max_date = df["timestamp"].max().date() if not df["timestamp"].isna().all() else None

    if min_date and max_date:
        selected_range = st.date_input("📅 Select Date Range:", [min_date, max_date])
        df = df[(df["timestamp"].dt.date >= selected_range[0]) & (df["timestamp"].dt.date <= selected_range[1])]

        st.subheader("🧾 Classification Table")
        st.dataframe(df[[
            "timestamp", "Post or Account Link", "classification", "confidence"
        ]])

        st.subheader("📊 Classification Distribution")
        st.bar_chart(df["classification"].value_counts())
    else:
        st.warning("📅 No valid timestamps found to build date range.")
else:
    st.warning("🚫 No valid report data found in 'reports' folder.")
