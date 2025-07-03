document.addEventListener("DOMContentLoaded", function () {
    const classifyBtn = document.getElementById("classifyBtn");
    const postText = document.getElementById("postText");
    const resultDiv = document.getElementById("result");

    classifyBtn.addEventListener("click", async function () {
        const input = postText.value.trim();

        if (!input) {
            resultDiv.textContent = "Please enter a tweet URL or post text.";
            return;
        }

        resultDiv.textContent = "Classifying...";

        if (input.startsWith("http")) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "extractTweetData", url: input }, async function (response) {
                    if (chrome.runtime.lastError || !response || !response.text) {
                        if (response && response.error && response.error.includes("private")) {
                            resultDiv.textContent = "❌ التغريدة من حساب خاص (private) ولا يمكن استخراجها.";
                        } else if (response && response.error && response.error.includes("empty")) {
                            resultDiv.textContent = "⚠️ التغريدة لا تحتوي على نص يمكن تحليله.";
                        } else {
                            resultDiv.textContent = "⚠️ لم نتمكن من استخراج محتوى التغريدة. تأكدي من فتح الرابط مباشرة في تبويب نشط.";
                        }
                        return;
                    }

                    try {
                        const classifyResponse = await fetch("http://127.0.0.1:5000/classify", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                text: response.text,
                                author: response.author,
                                post_time: response.post_time,
                                url: input
                            })
                        });

                        const data = await classifyResponse.json();
                        resultDiv.textContent = `Result: ${data.label}`;
                    } catch (error) {
                        console.error("Error:", error);
                        resultDiv.textContent = "Error during classification.";
                    }
                });
            });
        } else {
            try {
                const response = await fetch("http://127.0.0.1:5000/classify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: input })
                });

                const data = await response.json();
                resultDiv.textContent = `Result: ${data.label}`;
            } catch (error) {
                console.error("Error:", error);
                resultDiv.textContent = "Error classifying the post.";
            }
        }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "classificationResult") {
            resultDiv.textContent = `Auto Result: ${message.label}`;
        }
    });
});
