function getTwitterAccountData() {
    const username = document.querySelector('div[data-testid="UserName"] span')?.innerText;
    const followers = document.querySelector('a[href$="/followers"] span')?.innerText;
    const verified = !!document.querySelector('svg[aria-label="Verified account"]');
    const creationDate = 'Not Available';

    return {
        platform: 'X (Twitter)',
        username,
        followers,
        verified,
        creationDate,
        url: window.location.href
    };
}

function getFacebookAccountData() {
    const username = document.querySelector('h1')?.innerText;
    const followers = document.querySelector('div[data-pagelet="ProfileFollowers"] span')?.innerText;
    const verified = !!document.querySelector('svg[aria-label="Verified"]');
    const creationDate = 'Not Available';

    return {
        platform: 'Facebook',
        username,
        followers,
        verified,
        creationDate,
        url: window.location.href
    };
}

function getTweetContent() {
    const article = document.querySelector("article");
    if (!article) return "";
    const langDiv = article.querySelector("div[lang]");
    return langDiv ? langDiv.innerText.trim() : "";
}

setTimeout(() => {
    const isTwitter = window.location.href.includes('twitter.com') || window.location.href.includes('x.com');
    const accountData = isTwitter ? getTwitterAccountData() : getFacebookAccountData();

    chrome.runtime.sendMessage({ type: 'accountData', data: accountData });
    console.log('📌 Account data sent to background.js:', accountData);

    if (isTwitter && window.location.href.includes("/status/")) {
        const tweetText = getTweetContent();
        const postTime = document.querySelector("time")?.getAttribute("datetime") || new Date().toISOString();

        const postToClassify = {
            text: tweetText,
            url: window.location.href,
            author: accountData.username,
            post_time: postTime,
            platform: "X (Twitter)"
        };

        chrome.runtime.sendMessage({
            type: "postToClassify",
            data: postToClassify
        });

        console.log("🚀 Sent tweet content for classification:", postToClassify);
    }
}, 3000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "extractTweetData") {
        const tweetText = getTweetContent();
        const accountData = getTwitterAccountData();
        const postTime = document.querySelector("time")?.getAttribute("datetime") || new Date().toISOString();

        console.log("📥 extractTweetData called");
        console.log("📄 Tweet text:", tweetText);
        console.log("👤 Author:", accountData.username);
        console.log("🕒 Post time:", postTime);

        sendResponse({
            text: tweetText,
            author: accountData.username || "Unknown",
            post_time: postTime
        });

        return true;
    }
});
