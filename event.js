// ==========================================
// LIVE EVENTS — Cloudflare Worker থেকে ম্যাচ আনা
// ==========================================
const LIVE_EVENTS_API = "https://streamzx.mdmominulislam5600.workers.dev";
let currentEventsFilter = "all";

function todayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split("T")[0];
}

function buildEventsQuery(sportKey, filter) {
    return `?sport=${sportKey}&filter=${filter}`;
}

const TEAM_SPORTS = {
    football: { emoji: "⚽", label: "Football" },
    wwe: { emoji: "🤼", label: "WWE" },
    hockey: { emoji: "🏒", label: "Hockey" },
    basketball: { emoji: "🏀", label: "Basketball" },
    rugby: { emoji: "🏉", label: "Rugby" }
};

let currentSport = "all";

const FILTER_LABELS = {
    all: "☰ All",
    live: "🔴 Live",
    today: "🕐 Today's",
    upcoming: "📅 Upcoming",
    ended: "✅ Ended"
};
let sportTabCounts = {};
let sportBadgeCounts = {};

function updateSportIconBadges() {
    const tabsWrap = document.getElementById("sportTabs");
    if (!tabsWrap) return;
    tabsWrap.querySelectorAll("button").forEach(btn => {
        const key = btn.dataset.sport;
        const count = sportBadgeCounts[key];
        const circle = btn.querySelector(".sport-icon-circle");
        if (!circle) return;
        let badge = circle.querySelector(".sport-badge");
        if (count == null || count === 0) {
            if (badge) badge.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "sport-badge";
            badge.style.cssText = "position:absolute; top:-4px; right:-4px; background:var(--primary, #ff2a4b); color:#fff; font-size:10px; font-weight:bold; border-radius:10px; min-width:16px; height:16px; display:flex; align-items:center; justify-content:center; padding:0 3px; line-height:1;";
            circle.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
    });
}

function filterLabelWithCount(key) {
    const base = FILTER_LABELS[key];
    return sportTabCounts[key] != null ? `${base} (${sportTabCounts[key]})` : base;
}

function renderLiveEventsUI() {
    if (!channelList) return;

    // আইকন সারিটা যাতে ক্লিক করার পর আবার শুরুতে "লাফ" দিয়ে ফিরে না যায়,
    // তার জন্য আগের স্ক্রল পজিশন মনে রাখা হচ্ছে
    const prevSportTabs = document.getElementById("sportTabs");
    const prevScrollLeft = prevSportTabs ? prevSportTabs.scrollLeft : 0;

    const wrap = document.createElement("div");
    wrap.style.cssText = "grid-column:1/-1;";
    wrap.innerHTML = `
        <div id="sportTabs" style="display:flex; gap:16px; padding:8px 4px 16px; overflow-x:auto;">
            ${[
                ["all", "☰", "All"],
                ["cricket", "🏏", "Cricket"],
                ["football", "⚽", "Football"],
                ["wwe", "🤼", "WWE"],
                ["hockey", "🏒", "Hockey"],
                ["basketball", "🏀", "Basketball"],
                ["rugby", "🏉", "Rugby"]
            ].map(([key, icon, label]) => `
                <button data-sport="${key}" style="flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:4px; background:transparent; border:none;">
                    <span class="sport-icon-circle" style="position:relative; width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; border:2px solid ${currentSport === key ? "var(--primary, #ff2a4b)" : "rgba(128,128,128,0.3)"}; background:${currentSport === key ? "rgba(255,42,75,0.1)" : "transparent"};">${icon}</span>
                    <span style="font-size:11px; color:${currentSport === key ? "var(--primary, #ff2a4b)" : "var(--text-muted, #888)"}; font-weight:${currentSport === key ? "bold" : "normal"};">${label}</span>
                </button>
            `).join("")}
        </div>
        <div id="eventsFilterTabs" style="display:flex; gap:8px; overflow-x:auto; padding:4px 2px 14px;">
            ${["all", "live", "today", "upcoming", "ended"].map(key => `
                <button data-filter="${key}" style="flex-shrink:0; padding:8px 16px; border-radius:20px; border:1px solid var(--primary, #ff2a4b); background:${currentEventsFilter === key ? "var(--primary, #ff2a4b)" : "transparent"}; color:${currentEventsFilter === key ? "#fff" : "var(--primary, #ff2a4b)"}; font-size:13px; white-space:nowrap;">${filterLabelWithCount(key)}</button>
            `).join("")}
        </div>
        <div id="eventsListContainer"></div>
    `;
    channelList.innerHTML = "";
    channelList.appendChild(wrap);

    const newSportTabs = document.getElementById("sportTabs");
    if (newSportTabs && prevScrollLeft) {
        newSportTabs.scrollLeft = prevScrollLeft;
    }
    updateSportIconBadges();

    wrap.querySelectorAll("#sportTabs button").forEach(btn => {
        btn.addEventListener("click", () => {
            currentSport = btn.dataset.sport;
            sportTabCounts = {}; // নতুন স্পোর্টে আগের কাউন্ট যেন না দেখায়
            renderLiveEventsUI();
            startLiveEventsRefresh();
            updateSportTabCounts(currentSport);
        });
    });

    wrap.querySelectorAll("#eventsFilterTabs button").forEach(btn => {
        btn.addEventListener("click", () => {
            currentEventsFilter = btn.dataset.filter;
            renderLiveEventsUI();
            startLiveEventsRefresh();
        });
    });

    loadLiveEvents();
}

// নির্দিষ্ট একটা স্পোর্ট বেছে নিলে (যেমন শুধু Cricket, বা শুধু Football),
// ফিল্টার ট্যাবগুলোতে Sportzfy-এর মতো সংখ্যা দেখানোর জন্য একবার বিস্তৃত ডেটা এনে
// Live/Today's/Upcoming/All-এর কাউন্ট হিসাব করা হয়। "All" (সব স্পোর্ট একসাথে)
// মোডে এটা দেখানো হয় না, কারণ প্রতিটা স্পোর্টের জন্য আলাদা কাউন্ট করতে গেলে
// অনেক বেশি API কল লাগবে।
async function updateSportTabCounts(sportKey) {
    if (sportKey === "all") return;

    try {
        let rawMatches = [];
        if (sportKey === "cricket") {
            const res = await fetch(LIVE_EVENTS_API + "?sport=cricket");
            const data = await res.json();
            rawMatches = (data && data.data) || [];
        } else {
            const res = await fetch(LIVE_EVENTS_API + buildEventsQuery(sportKey, "all"));
            const data = await res.json();
            rawMatches = (data && data.matches) || [];
        }

        // এর মধ্যে ইউজার অন্য স্পোর্টে চলে গেলে পুরনো কাউন্ট যেন না বসে
        if (currentSport !== sportKey) return;

        const now = new Date();
        const todayStr = todayISO(0);
        let counts;

        if (sportKey === "cricket") {
            counts = {
                live: rawMatches.filter(isGenuinelyLiveCricketMatch).length,
                today: rawMatches.filter(m => (m.date || "").startsWith(todayStr)).length,
                upcoming: rawMatches.filter(m => !m.matchStarted && new Date(m.dateTimeGMT) > now).length,
                all: rawMatches.filter(m => !m.matchEnded).length
            };
        } else {
            counts = {
                live: rawMatches.filter(m => m.status === "IN_PLAY").length,
                today: rawMatches.filter(m => new Date(m.utcDate).toDateString() === now.toDateString()).length,
                upcoming: rawMatches.filter(m => m.status === "SCHEDULED" && new Date(m.utcDate) > now).length,
                all: rawMatches.filter(m => m.status !== "FINISHED").length
            };
        }

        sportTabCounts = counts;

        // পুরো UI আবার না বানিয়ে, শুধু ফিল্টার বাটনগুলোর লেখা আপডেট করা হচ্ছে
        const tabsWrap = document.getElementById("eventsFilterTabs");
        if (!tabsWrap) return;
        tabsWrap.querySelectorAll("button").forEach(btn => {
            const key = btn.dataset.filter;
            btn.textContent = filterLabelWithCount(key);
        });
    } catch (err) {
        // কাউন্ট আনতে ব্যর্থ হলে চুপচাপ থাকবে — প্লেইন লেবেলই দেখাবে, অ্যাপ ভাঙবে না
    }
}

// ==========================================
// লিগ → চ্যানেল ম্যাপিং (নির্দিষ্ট লিগের জন্য, সবচেয়ে বেশি অগ্রাধিকার)
// চাইলে নির্দিষ্ট কোনো লিগ কোন চ্যানেলে দেখাও সেটা এখানে বসাতে পারো —
// কিন্তু এটা খালি রাখলেও অ্যাপ স্বয়ংক্রিয়ভাবে চ্যানেল বেছে নিবে (নিচে দেখো)
// ==========================================
const LEAGUE_TO_CHANNEL_MAP = {
    // "premier league": "T Sports",
    // "la liga": "Bein Sports",
};

// ==========================================
// কোন চ্যানেলে সাধারণত কোন স্পোর্ট দেখানো হয় — এটা তুমি নিজে জানিয়েছ
// key = channels.json-এর চ্যানেল নামের অংশ (ছোট হাতের অক্ষরে)
// value = স্পোর্ট কী-গুলোর অ্যারে (football/cricket/basketball/hockey/rugby/wwe)
// ==========================================
const CHANNEL_SPORTS_TAGS = {
    "gazi tv": ["cricket"],
    "t sports": ["cricket"],
    "a sports hd": ["cricket"],
    "ptv sports hd": ["cricket"],
    "bein sports direct hd": ["football", "basketball", "tennis", "motorsport", "rugby"],
    "ten cricket": ["cricket"],
    "star sports 1 hd": ["football", "cricket", "kabaddi"],
    "star sports 1 hindi": ["football", "cricket", "kabaddi"],
    "star sports 2": ["football", "cricket", "kabaddi"],
    "willow hd": ["cricket"],
    "eurosport hd": ["tennis", "kabaddi"],
    // নতুন যোগ হওয়া চ্যানেল (PDF থেকে) — শুধু তোমার দেওয়া তালিকায়
    // স্পষ্টভাবে থাকা মিলগুলোই বসানো হয়েছে
    "eurosport 1": ["tennis", "kabaddi"],
    "eurosport 2": ["tennis", "kabaddi"],
    "dazn": ["football", "basketball", "tennis", "motorsport", "hockey", "rugby"],
    "espn": ["football", "cricket", "basketball", "tennis", "motorsport", "wwe", "hockey", "rugby"],
    "sky sports cricket": ["cricket"],
    "sky sports football": ["football"],
    "sky sports mix": ["football"],
    "sky sports tennis": ["tennis"],
    "sky sports f1": ["motorsport"],
    "sky sports epl": ["football"], // চ্যানেলের নাম থেকেই স্পষ্ট (EPL = ফুটবল)
    "football world cup 2026 fast": ["football"], // নাম থেকেই স্পষ্ট
    "dd sports": ["kabaddi"],
    "tnt sports": ["football", "basketball", "tennis", "wwe", "hockey", "rugby"],
    "bein sports 1 hd": ["football", "basketball", "tennis", "motorsport", "rugby"],
    "bein sports 3 hd": ["football", "basketball", "tennis", "motorsport", "rugby"],
    "bein sports 4 hd": ["football", "basketball", "tennis", "motorsport", "rugby"],
    "bein sports 5 hd": ["football", "basketball", "tennis", "motorsport", "rugby"],
    // Akash Go ব্যাচ থেকে — নাম দেখে সাধারণ/মিশ্র স্পোর্টস কনটেন্ট মনে হচ্ছে,
    // নির্দিষ্ট কোনো একটা স্পোর্ট না, তাই সব সক্রিয় স্পোর্টের fallback হিসেবে রাখা হলো
    "sports range": ["football", "cricket", "basketball", "hockey", "rugby"],
    "sports legends": ["football", "cricket", "basketball", "hockey", "rugby"],
    // নিচের চ্যানেলগুলো (Ziggo Sport, Trace Sport, Sky Sports Action/Golf/Racing,
    // GO 3 Sport, Star Sports Khel, Sport 1/2) তোমার দেওয়া কোনো তালিকাতেই
    // ছিল না, তাই অনুমান করে ট্যাগ বসানো হয়নি — এগুলো এখন সাধারণ
    // "Sports" ক্যাটাগরি fallback দিয়ে চলবে
};

function getChannelSportTags(channel) {
    const nameLower = String(channel.name || "").toLowerCase();
    const matchedKey = Object.keys(CHANNEL_SPORTS_TAGS).find(key => nameLower.includes(key));
    return matchedKey ? CHANNEL_SPORTS_TAGS[matchedKey] : null;
}

function findChannelForLeague(leagueName, sportKey, matchIdentifier) {
    const leagueLower = String(leagueName || "").toLowerCase();
    const matchedLeagueKey = Object.keys(LEAGUE_TO_CHANNEL_MAP).find(key => leagueLower.includes(key));

    if (matchedLeagueKey) {
        const patternLower = LEAGUE_TO_CHANNEL_MAP[matchedLeagueKey].toLowerCase();
        const found = channels.find(c => String(c.name || "").toLowerCase().includes(patternLower));
        if (found) return found;
    }

    // "Sports" ক্যাটাগরির চ্যানেলগুলোর মধ্যে খোঁজা হচ্ছে
    const sportsChannels = channels.filter(c => String(c.category || "").toLowerCase().includes("sport"));
    if (sportsChannels.length === 0) return null;

    const hashSource = String(matchIdentifier || leagueName || "").toLowerCase();
    let hash = 0;
    for (let i = 0; i < hashSource.length; i++) {
        hash = (hash * 31 + hashSource.charCodeAt(i)) >>> 0;
    }

    if (sportKey) {
        // প্রথম অগ্রাধিকার: তুমি নিজে যেসব চ্যানেলে এই স্পোর্ট ট্যাগ করেছ —
        // এখানে ক্যাটাগরি যাই হোক না কেন (যেমন "Akash Go"-এর Sports Range/
        // Sports Legends), ট্যাগ থাকলেই বিবেচনা করা হয়
        const taggedChannels = channels.filter(c => {
            const tags = getChannelSportTags(c);
            return tags && tags.includes(sportKey);
        });
        if (taggedChannels.length > 0) {
            return taggedChannels[hash % taggedChannels.length];
        }

        // ট্যাগ না থাকলে, চ্যানেলের নামেই স্পোর্টের কিওয়ার্ড আছে কিনা দেখা হচ্ছে
        const keywordMatch = sportsChannels.find(c => String(c.name || "").toLowerCase().includes(String(sportKey).toLowerCase()));
        if (keywordMatch) return keywordMatch;
    }

    // নির্দিষ্ট মিল না পেলে, "Sports" ক্যাটাগরির যেকোনো একটা চ্যানেল
    // স্বয়ংক্রিয়ভাবে যুক্ত করে দেওয়া হয় — একই ম্যাচ সবসময় একই চ্যানেলে থাকে
    return sportsChannels[hash % sportsChannels.length];
}

function handleMatchCardClick(leagueName, sportKey, matchIdentifier) {
    const matchedChannel = findChannelForLeague(leagueName, sportKey, matchIdentifier);
    if (matchedChannel) {
        playChannelWithAd(matchedChannel);
    } else {
        alert("এই ম্যাচের জন্য এখনো কোনো চ্যানেল যুক্ত করা হয়নি।");
    }
}

// ম্যাচ কার্ডে দেখানোর জন্য চ্যানেল-ব্যাজের HTML — চ্যানেলের আসল নাম
// দেখানো হয় না (ইচ্ছাকৃতভাবে), শুধু বোঝানো হয় যে দেখার একটা চ্যানেল আছে
function channelBadgeHtml(leagueName, sportKey, matchIdentifier) {
    const matchedChannel = findChannelForLeague(leagueName, sportKey, matchIdentifier);
    if (!matchedChannel) return "";
    return `<div style="margin-top:6px; font-size:10px; color:var(--primary, #ff2a4b); display:flex; align-items:center; justify-content:center; gap:4px;"><i class="fa-solid fa-tv"></i> Watch Live</div>`;
}


let liveEventsRequestId = 0;

async function loadLiveEvents(silent = false) {
    const listEl = document.getElementById("eventsListContainer");
    if (!listEl) return;

    const requestId = ++liveEventsRequestId;

    if (!silent) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-muted, #888);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:32px; margin-bottom:15px; display:block;"></i>
                <div>লোড হচ্ছে...</div>
            </div>
        `;
    }

    // নতুন ডেটা আগে একটা অদৃশ্য কন্টেইনারে তৈরি হবে,
    // যাতে রিফ্রেশের সময় স্ক্রিনে খালি/স্পিনার ফ্ল্যাশ না করে
    // এবং পুরনো কার্ডের সাথে ডুপ্লিকেট হয়ে না জমে
    const tempContainer = document.createElement("div");

    if (currentSport === "cricket") {
        await loadCricketEvents(tempContainer, false);
    } else if (currentSport === "all") {
        // সব স্পোর্ট একসাথে (parallel) লোড হবে গতির জন্য,
        // কিন্তু দেখানোর ক্রম (football, cricket, তারপর বাকিগুলো) ঠিক রাখা হয়
        const order = ["football", "cricket", ...Object.keys(TEAM_SPORTS).filter(k => k !== "football")];
        const sections = {};
        await Promise.all(order.map(async key => {
            const sectionContainer = document.createElement("div");
            if (key === "cricket") {
                await loadCricketEvents(sectionContainer, true);
            } else {
                await loadTeamSportEvents(sectionContainer, true, key);
            }
            sections[key] = sectionContainer;
        }));
        order.forEach(key => {
            const sec = sections[key];
            while (sec.firstChild) {
                tempContainer.appendChild(sec.firstChild);
            }
        });

        // যা ডেটা এমনিতেই আনা হলো, তা থেকেই "All" আইকনের ব্যাজ আর
        // বর্তমান ফিল্টার ট্যাবের কাউন্ট বসানো হচ্ছে — কোনো এক্সট্রা কল ছাড়াই
        const totalCount = order.reduce((sum, key) => sum + (sportBadgeCounts[key] || 0), 0);
        sportBadgeCounts.all = totalCount;
        sportTabCounts[currentEventsFilter] = totalCount;
        updateSportIconBadges();
        const filterBtn = document.querySelector(`#eventsFilterTabs button[data-filter="${currentEventsFilter}"]`);
        if (filterBtn) filterBtn.textContent = filterLabelWithCount(currentEventsFilter);
    } else if (TEAM_SPORTS[currentSport]) {
        await loadTeamSportEvents(tempContainer, false, currentSport);
    }

    addNoMatchesMessageIfEmpty(tempContainer);

    // এর মধ্যে ট্যাব/ফিল্টার বদলে নতুন রিকোয়েস্ট শুরু হয়ে থাকলে,
    // এই পুরনো রেসপন্স আর বসানো হবে না
    if (requestId !== liveEventsRequestId) return;

    const activeListEl = document.getElementById("eventsListContainer");
    if (!activeListEl) return;

    activeListEl.innerHTML = "";
    while (tempContainer.firstChild) {
        activeListEl.appendChild(tempContainer.firstChild);
    }
}

function addNoMatchesMessageIfEmpty(container) {
    if (container.children.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-muted, #888);">
                <i class="fa-solid fa-tower-broadcast" style="font-size:40px; margin-bottom:15px; display:block; color:var(--primary, #ff2a4b);"></i>
                <div>এই মুহূর্তে কোনো ম্যাচ নেই</div>
                <small>ম্যাচ শুরু হলে এখানেই দেখা যাবে।</small>
            </div>
        `;
    }
}

// ==========================================
// ইভেন্ট কার্ডের মডেল — লিগের নাম কার্ডের উপরে আলাদা bar-এ,
// মাঝখানে পালস করা লাইভ ডট + "Live", কোনো অতিরিক্ত টেক্সট/স্টার নেই,
// সবুজ বর্ডার — পুরো কার্ডটাই ক্লিকযোগ্য (চ্যানেল চালু করার জন্য)
// ==========================================
function buildEventCardHtml(opts) {
    const {
        homeName, awayName, homeLogo, awayLogo,
        homeScore, awayScore, statusLabel, isLive, isFinished
    } = opts;

    const showScores = homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined;

    return `
        <div style="border-radius:12px; padding:16px 12px; background:#131a2b; border:1px solid #16a34a;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="flex:1; text-align:center;">
                    <img src="${escapeHTML(homeLogo)}" alt="${escapeHTML(homeName)}" style="width:44px;height:44px;object-fit:contain; display:block; margin:0 auto 6px; border-radius:50%;">
                    <div style="font-size:12px; color:#fff; font-weight:600;">${escapeHTML(homeName)}</div>
                    ${showScores ? `<div style="margin-top:4px; font-size:15px; font-weight:bold; color:#fff;">${homeScore}</div>` : ""}
                </div>
                <div style="flex:0 0 64px; text-align:center;">
                    ${isLive
                        ? `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff3b3b; margin-bottom:4px; animation:pulseDot 1.2s infinite;"></span><div style="font-size:11px; color:#ff3b3b; font-weight:bold;">Live</div>`
                        : `<div style="font-size:10px; color:#9ca3af; line-height:1.4;">${statusLabel}</div>`
                    }
                </div>
                <div style="flex:1; text-align:center;">
                    <img src="${escapeHTML(awayLogo)}" alt="${escapeHTML(awayName)}" style="width:44px;height:44px;object-fit:contain; display:block; margin:0 auto 6px; border-radius:50%;">
                    <div style="font-size:12px; color:#fff; font-weight:600;">${escapeHTML(awayName)}</div>
                    ${showScores ? `<div style="margin-top:4px; font-size:15px; font-weight:bold; color:#fff;">${awayScore}</div>` : ""}
                </div>
            </div>
        </div>
    `;
}

async function loadTeamSportEvents(container, showSportLabel, sportKey) {
    const sportInfo = TEAM_SPORTS[sportKey] || { emoji: "🏆", label: sportKey };
    try {
        const res = await fetch(LIVE_EVENTS_API + buildEventsQuery(sportKey, currentEventsFilter));
        const data = await res.json();
        const rawMatches = (data && data.matches) || [];

        // সেফটি-চেক: status ফিল্ড কখনো দেরিতে আপডেট হয়,
        // তাই "Upcoming"-এ শুধু সেই ম্যাচগুলো রাখো যেগুলোর শুরুর সময় এখনো আসেনি।
        // "All"/"Today's"-এ শেষ হওয়া ম্যাচ বাদ দাও — সেটার জন্য আলাদা "Ended" ট্যাব আছে।
        const now = new Date();
        let matches = rawMatches;
        if (currentEventsFilter === "upcoming") {
            matches = rawMatches.filter(m => new Date(m.utcDate) > now);
        } else if (currentEventsFilter === "all" || currentEventsFilter === "today") {
            matches = rawMatches.filter(m => m.status !== "FINISHED");
        }

        sportBadgeCounts[sportKey] = matches.length;
        updateSportIconBadges();

        if (!matches.length) return;

        if (showSportLabel) {
            const sportHeader = document.createElement("div");
            sportHeader.style.cssText = "font-size:14px; font-weight:bold; margin:10px 0 6px; color:var(--text, inherit);";
            sportHeader.textContent = `${sportInfo.emoji} ${sportInfo.label}`;
            container.appendChild(sportHeader);
        }

        // লিগ অনুযায়ী গ্রুপ করা
        const byLeague = {};
        matches.forEach(m => {
            const league = m.competition?.name || sportInfo.label;
            if (!byLeague[league]) byLeague[league] = [];
            byLeague[league].push(m);
        });

        Object.keys(byLeague).forEach(league => {
            const leagueEmblem = byLeague[league][0].competition?.emblem || "";
            const leagueHeader = document.createElement("div");
            leagueHeader.style.cssText = "display:flex; align-items:center; justify-content:center; gap:8px; margin:14px 0 10px; padding:10px 14px; border-radius:10px; background:#0f1729; font-size:13px; color:#fff; font-weight:bold; text-align:center;";
            leagueHeader.innerHTML = `${leagueEmblem ? `<img src="${escapeHTML(leagueEmblem)}" style="width:18px;height:18px;object-fit:contain;">` : sportInfo.emoji} ${escapeHTML(sportInfo.label.toUpperCase())} || ${escapeHTML(league.toUpperCase())}`;
            container.appendChild(leagueHeader);

            byLeague[league].forEach(m => {
                const home = escapeHTML(m.homeTeam?.name || "Home");
                const away = escapeHTML(m.awayTeam?.name || "Away");
                const homeLogo = escapeHTML(m.homeTeam?.crest || "logo.png");
                const awayLogo = escapeHTML(m.awayTeam?.crest || "logo.png");

                const isLive = m.status === "IN_PLAY" || m.status === "PAUSED";
                const isFinished = m.status === "FINISHED";
                // কিছু স্পোর্টে স্কোর সরাসরি সংখ্যা না হয়ে জটিল অবজেক্ট হয়ে আসতে পারে —
                // তখন সরাসরি দেখালে "[object Object]" দেখাবে, তাই সংখ্যা কিনা যাচাই করা হচ্ছে
                const formatScore = v => (typeof v === "number" && !isNaN(v)) ? v : null;
                const homeScore = formatScore(m.score?.fullTime?.home);
                const awayScore = formatScore(m.score?.fullTime?.away);

                let statusLabel;
                if (isFinished) {
                    statusLabel = "Ended";
                } else if (!isLive) {
                    const dt = new Date(m.utcDate);
                    const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const dateStr = dt.toLocaleDateString([], { day: "2-digit", month: "short" });
                    statusLabel = `${dateStr}<br>${timeStr}`;
                }

                const row = document.createElement("div");
                row.style.cssText = "margin-bottom:10px; cursor:pointer;";
                row.addEventListener("click", () => handleMatchCardClick(league, sportKey, `${home} vs ${away}`));
                row.innerHTML = buildEventCardHtml({
                    homeName: home, awayName: away, homeLogo, awayLogo,
                    homeScore: (isLive || isFinished) ? (homeScore ?? "-") : null,
                    awayScore: (isLive || isFinished) ? (awayScore ?? "-") : null,
                    statusLabel, isLive, isFinished
                });
                container.appendChild(row);
            });
        });
    } catch (err) {
        const errDiv = document.createElement("div");
        errDiv.style.cssText = "text-align:center; padding:20px; color:var(--text-muted, #888);";
        errDiv.textContent = `${sportInfo.label}-এর ডেটা লোড করা যায়নি।`;
        container.appendChild(errDiv);
    }
}

// ক্রিকেট টিমের লোগো — CricketData.org অনেক সময় আসল লোগোর বদলে
// একটা জেনেরিক/নিম্নমানের প্লেসহোল্ডার ছবি পাঠায় (icon512.png বা তাদের
// নিজস্ব ব্র্যান্ডিং শিল্ড)। সেগুলো শনাক্ত করে আসল লোগোর মতোই একটা
// পরিষ্কার, সামঞ্জস্যপূর্ণ ফলব্যাক আইকন দেখানো হয়।
// CricAPI-তে মাঝেমধ্যে walkover/বাতিল হওয়া ম্যাচের matchEnded ফ্ল্যাগ
// ঠিকমতো আপডেট হয় না, ফলে সেটা চিরকাল "Live" দেখাতে থাকে। তাই সময়ও
// যাচাই করা হচ্ছে — নির্দিষ্ট সময়ের বেশি হলে matchEnded যাই থাকুক,
// আর "Live" ধরা হবে না।
function isGenuinelyLiveCricketMatch(m) {
    if (!m.matchStarted || m.matchEnded) return false;
    const matchDate = new Date(m.dateTimeGMT);
    if (isNaN(matchDate.getTime())) return true; // তারিখ না থাকলে যাচাই করা যাবে না, তাই বাদ দেওয়া হচ্ছে না
    const hoursSinceStart = (new Date() - matchDate) / 36e5;
    const isTestMatch = (m.matchType || "").toLowerCase() === "test";
    const maxHours = isTestMatch ? 24 * 6 : 24;
    return hoursSinceStart <= maxHours;
}

// ফুটবলের মতোই সাধারণ img ট্যাগ — শুধু লোগো URL না থাকলে অ্যাপের
// নিজস্ব ফলব্যাক ছবি ব্যবহার হবে, দুই স্পোর্টেই একই রকম দেখতে হবে
function renderCricketTeamLogo(teamInfo, teamName) {
    const img = (teamInfo && teamInfo.img) || "logo.png";
    return `<img src="${escapeHTML(img)}" alt="${escapeHTML(teamName)}" style="width:32px;height:32px;object-fit:contain; display:block; margin:0 auto 4px;">`;
}

// ==========================================
// ক্রিকেট — CricAPI (একই Worker দিয়ে, sport=cricket প্যারামিটারে)
// ==========================================
async function loadCricketEvents(container, showSportLabel) {
    try {
        const cricEndpoint = currentEventsFilter === "upcoming"
            ? "?sport=cricket&type=matches"
            : "?sport=cricket";
        const res = await fetch(LIVE_EVENTS_API + cricEndpoint);
        const data = await res.json();
        const rawMatches = (data && data.data) || [];

        const now = new Date();
        let matches = rawMatches;
        if (currentEventsFilter === "live") {
            matches = rawMatches.filter(isGenuinelyLiveCricketMatch);
        } else if (currentEventsFilter === "today") {
            const todayStr = todayISO(0);
            matches = rawMatches.filter(m => (m.date || "").startsWith(todayStr));
        } else if (currentEventsFilter === "upcoming") {
            matches = rawMatches.filter(m => !m.matchStarted && new Date(m.dateTimeGMT) > now);
        } else if (currentEventsFilter === "ended") {
            matches = rawMatches.filter(m => m.matchEnded || !isGenuinelyLiveCricketMatch(m) && m.matchStarted);
        } else if (currentEventsFilter === "all") {
            matches = rawMatches.filter(m => m.matchEnded ? false : (m.matchStarted ? isGenuinelyLiveCricketMatch(m) : true));
        }

        sportBadgeCounts.cricket = matches.length;
        updateSportIconBadges();

        if (!matches.length) {
            // combined ("all sport") মোডে খালি হলে কিছু বলার দরকার নেই —
            // overall "কোনো ম্যাচ নেই" মেসেজ addNoMatchesMessageIfEmpty দেখাবে
            if (!showSportLabel) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px 20px; color:var(--text-muted, #888);">
                        <i class="fa-solid fa-tower-broadcast" style="font-size:40px; margin-bottom:15px; display:block; color:var(--primary, #ff2a4b);"></i>
                        <div>এই মুহূর্তে কোনো ম্যাচ নেই</div>
                        <small>ম্যাচ শুরু হলে এখানেই দেখা যাবে।</small>
                    </div>
                `;
            }
            return;
        }

        if (showSportLabel) {
            const sportHeader = document.createElement("div");
            sportHeader.style.cssText = "font-size:14px; font-weight:bold; margin:10px 0 6px; color:var(--text, inherit);";
            sportHeader.textContent = "🏏 Cricket";
            container.appendChild(sportHeader);
        }

        // ম্যাচের আসল লিগ/সিরিজের নাম বের করা হচ্ছে (যেমন "Caribbean Premier
        // League 2026") — CricAPI-র "name" ফিল্ডের শেষ অংশ থেকে, matchType
        // (T20/ODI) দিয়ে গ্রুপ না করে
        function extractCricketLeagueName(m) {
            const parts = String(m.name || "").split(",");
            if (parts.length >= 2) {
                return parts[parts.length - 1].trim();
            }
            return (m.matchType || "Cricket").toUpperCase();
        }

        const byType = {};
        matches.forEach(m => {
            const league = extractCricketLeagueName(m);
            if (!byType[league]) byType[league] = [];
            byType[league].push(m);
        });

        Object.keys(byType).forEach(type => {
            const header = document.createElement("div");
            header.style.cssText = "display:flex; align-items:center; justify-content:center; gap:8px; margin:14px 0 10px; padding:10px 14px; border-radius:10px; background:#0f1729; font-size:13px; color:#fff; font-weight:bold; text-align:center;";
            header.innerHTML = `🏏 CRICKET || ${escapeHTML(type.toUpperCase())}`;
            container.appendChild(header);

            byType[type].forEach(m => {
                const team1Info = m.teamInfo && m.teamInfo[0];
                const team2Info = m.teamInfo && m.teamInfo[1];
                const team1 = (team1Info && team1Info.shortname) || (m.teams && m.teams[0]) || "Team 1";
                const team2 = (team2Info && team2Info.shortname) || (m.teams && m.teams[1]) || "Team 2";
                const team1Logo = (team1Info && team1Info.img) || "logo.png";
                const team2Logo = (team2Info && team2Info.img) || "logo.png";

                const isLive = isGenuinelyLiveCricketMatch(m);
                const isFinished = !isLive && (m.matchEnded || m.matchStarted);
                let statusLabel;
                if (isFinished) {
                    statusLabel = "Ended";
                } else if (!isLive) {
                    const dt = new Date(m.dateTimeGMT);
                    const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const dateStr = dt.toLocaleDateString([], { day: "2-digit", month: "short" });
                    statusLabel = `${dateStr}<br>${timeStr}`;
                }

                const row = document.createElement("div");
                row.style.cssText = "margin-bottom:10px; cursor:pointer;";
                row.addEventListener("click", () => handleMatchCardClick(type, "cricket", `${team1} vs ${team2}`));
                row.innerHTML = buildEventCardHtml({
                    homeName: team1, awayName: team2, homeLogo: team1Logo, awayLogo: team2Logo,
                    homeScore: null, awayScore: null,
                    statusLabel, isLive, isFinished
                });
                container.appendChild(row);
            });
        });
    } catch (err) {
        const errDiv = document.createElement("div");
        errDiv.style.cssText = "text-align:center; padding:20px; color:var(--text-muted, #888);";
        errDiv.textContent = "ক্রিকেটের ডেটা লোড করা যায়নি।";
        container.appendChild(errDiv);
    }
}

let liveEventsRefreshTimer = null;

function stopLiveEventsRefresh() {
    if (liveEventsRefreshTimer) {
        clearInterval(liveEventsRefreshTimer);
        liveEventsRefreshTimer = null;
    }
}

function startLiveEventsRefresh() {
    stopLiveEventsRefresh();
    // শুধু "Live" ফিল্টারেই বারবার রিফ্রেশ দরকার —
    // Today's/Upcoming/Ended-এর ডেটা মিনিটে মিনিটে বদলায় না,
    // তাই ওখানে বারবার কল করলে শুধু API কোটাই খরচ হবে
    if (currentEventsFilter !== "live") return;
    // "All"-এ একসাথে ১০টা স্পোর্ট লোড হয় — প্রতি ৩০ সেকেন্ডে সবগুলো
    // আবার রিফ্রেশ করা অনেক ভারী, তাই "All"-এ অটো-রিফ্রেশ বন্ধ রাখা হলো
    if (currentSport === "all") return;
    const interval = (typeof CONFIG !== "undefined" && CONFIG.REFRESH_INTERVAL) ? CONFIG.REFRESH_INTERVAL : 30000;
    liveEventsRefreshTimer = setInterval(() => loadLiveEvents(true), interval);
}
