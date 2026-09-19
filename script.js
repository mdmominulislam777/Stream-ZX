// ==========================================
// StreamZX - Script (With Modern Custom Overlay Controls & Auto-Hide PiP Space)
// ==========================================

let channels = [];
let currentCategory = "Sports";
let isInitialLoad = true;
let hls = null;

// Safe LocalStorage Parsing for Favorites
let favorites = [];
try {
    const storedFavs = localStorage.getItem("favChannels");
    favorites = storedFavs ? JSON.parse(storedFavs) : [];
    if (!Array.isArray(favorites)) favorites = [];
} catch (e) {
    favorites = [];
}

// Custom Playlists state
let customPlaylists = JSON.parse(localStorage.getItem("customPlaylists") || "[]");

// ==========================================
// MONETAG ADS CONFIG
// ==========================================
let firstChannelAdShown = false;
let isAdShowing = false;

// ==========================================
// DOM ELEMENTS
// ==========================================
let channelList;
let video;
let search;
let searchArea;
let playerContainer;
let currentChannelName;
let mainSectionTitle;
let categoryPage;
let settingsPage;

// Overlay Player Elements
let playerOverlay;
let lockOverlay;
let isLocked = false;
let overlayTimeout = null;
let currentAspectRatioIndex = 0;
const aspectRatios = ["contain", "cover", "fill"];

// ==========================================
// APP START
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Telegram WebApp Ready Check
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
    }

    // Main Elements
    channelList = document.getElementById("channelList");
    video = document.getElementById("video");
    search = document.getElementById("search");
    searchArea = document.getElementById("searchArea");
    playerContainer = document.getElementById("playerContainer");
    currentChannelName = document.getElementById("currentChannelName");
    mainSectionTitle = document.getElementById("mainSectionTitle");
    categoryPage = document.getElementById("categoryPage");
    settingsPage = document.getElementById("settingsPage");

    // Initialize Theme & Player Controls
    initTheme();
    initPlayerControls();

    // Splash Screen Auto-Timeout Safety
    setTimeout(() => {
        hideSplash();
    }, 2000);

    initApp();
});

// ==========================================
// INIT APP
// ==========================================
function initApp() {
    setupEventListeners();
    loadChannels();
}

// ==========================================
// CUSTOM PLAYER CONTROLS & PIP LISTENERS
// ==========================================
function initPlayerControls() {
    playerOverlay = document.getElementById("playerOverlay");
    lockOverlay = document.getElementById("lockOverlay");
    playerContainer = document.getElementById("playerContainer");

    const playPauseBtn = document.getElementById("playPauseBtn");
    const rewindBtn = document.getElementById("rewindBtn");
    const forwardBtn = document.getElementById("forwardBtn");
    const muteBtn = document.getElementById("muteBtn");
    const lockBtn = document.getElementById("lockBtn");
    const unlockBtn = document.getElementById("unlockBtn");
    
    // HTML-এর সাপেক্ষে ফিক্সড ID নামসমূহ:
    const aspectRatioBtn = document.getElementById("aspectBtn");
    const pipBtn = document.getElementById("pipPlayerBtn");
    const fullscreenBtn = document.getElementById("fullScreenBtn");
    const seekBar = document.getElementById("progressBar");
    const currentTimeEl = document.getElementById("currentTime");
    const durationEl = document.getElementById("durationTime");

    // PIP ENTRANCE & EXIT LISTENERS
    if (video) {
        video.addEventListener("enterpictureinpicture", () => {
            if (playerContainer) {
                playerContainer.style.display = "none";
            }
        });

        video.addEventListener("leavepictureinpicture", () => {
            if (playerContainer) {
                playerContainer.style.display = "block";
            }
        });
    }

    // Play / Pause Toggle
    if (playPauseBtn && video) {
        playPauseBtn.addEventListener("click", togglePlayPause);
        video.addEventListener("click", toggleOverlayVisibility);
    }

    // Rewind / Forward 10s
    if (rewindBtn && video) {
        rewindBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            video.currentTime = Math.max(0, video.currentTime - 10);
            resetOverlayTimeout();
        });
    }

    if (forwardBtn && video) {
        forwardBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
            resetOverlayTimeout();
        });
    }

    // Mute / Unmute
    if (muteBtn && video) {
        muteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            const icon = muteBtn.querySelector("i");
            if (icon) {
                icon.className = video.muted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
            }
            resetOverlayTimeout();
        });
    }

    // Screen Lock Toggle
    if (lockBtn) {
        lockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            isLocked = true;
            if (playerOverlay) playerOverlay.classList.add("hidden-overlay");
            if (lockOverlay) lockOverlay.classList.remove("hidden");
        });
    }

    if (unlockBtn) {
        unlockBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            isLocked = false;
            if (lockOverlay) lockOverlay.classList.add("hidden");
            if (playerOverlay) playerOverlay.classList.remove("hidden-overlay");
            resetOverlayTimeout();
        });
    }

    // Aspect Ratio Cycle
    if (aspectRatioBtn && video) {
        aspectRatioBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            currentAspectRatioIndex = (currentAspectRatioIndex + 1) % aspectRatios.length;
            video.style.objectFit = aspectRatios[currentAspectRatioIndex];
            resetOverlayTimeout();
        });
    }

    // Floating Picture-in-Picture Button
    if (pipBtn) {
        pipBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFloatingPlayer();
            resetOverlayTimeout();
        });
    }

    // Fullscreen Toggle
    if (fullscreenBtn && video) {
        fullscreenBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFullScreen();
            resetOverlayTimeout();
        });
    }

    // Progress Bar & Time Updates
    if (video) {
        video.addEventListener("timeupdate", () => {
            if (!video.duration) return;
            if (seekBar) {
                seekBar.value = (video.currentTime / video.duration) * 100;
            }
            if (currentTimeEl) currentTimeEl.textContent = formatTime(video.currentTime);
            if (durationEl) durationEl.textContent = formatTime(video.duration);
        });

        if (seekBar) {
            seekBar.addEventListener("input", (e) => {
                if (video.duration) {
                    video.currentTime = (e.target.value / 100) * video.duration;
                }
            });
        }

        video.addEventListener("play", updatePlayIcon);
        video.addEventListener("pause", updatePlayIcon);
    }
}

function togglePlayPause(e) {
    if (e) e.stopPropagation();
    if (!video) return;

    if (video.paused) {
        video.play().catch(err => console.log("Play error:", err));
    } else {
        video.pause();
    }
    resetOverlayTimeout();
}

function updatePlayIcon() {
    const playIcon = document.querySelector("#playPauseBtn i");
    if (playIcon) {
        playIcon.className = video.paused ? "fa-solid fa-play" : "fa-solid fa-pause";
    }
}

function toggleOverlayVisibility() {
    if (isLocked || !playerOverlay) return;

    if (playerOverlay.classList.contains("hidden-overlay")) {
        playerOverlay.classList.remove("hidden-overlay");
        resetOverlayTimeout();
    } else {
        playerOverlay.classList.add("hidden-overlay");
    }
}

function resetOverlayTimeout() {
    if (overlayTimeout) clearTimeout(overlayTimeout);
    if (!isLocked && playerOverlay) {
        playerOverlay.classList.remove("hidden-overlay");
        overlayTimeout = setTimeout(() => {
            if (video && !video.paused) {
                playerOverlay.classList.add("hidden-overlay");
            }
        }, 4000);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function toggleFullScreen() {
    const wrapper = document.querySelector(".video-player-wrapper") || video;
    if (!document.fullscreenElement) {
        if (wrapper.requestFullscreen) wrapper.requestFullscreen();
        else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        else if (wrapper.msRequestFullscreen) wrapper.msRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

// ==========================================
// THEME (DARK / LIGHT MODE) LOGIC
// ==========================================
function initTheme() {
    const themeToggle = document.getElementById("themeToggle");
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        if (themeToggle) themeToggle.checked = false;
    } else {
        document.body.classList.remove("light-mode");
        if (themeToggle) themeToggle.checked = true;
    }

    if (themeToggle) {
        themeToggle.addEventListener("change", () => {
            if (themeToggle.checked) {
                document.body.classList.remove("light-mode");
                localStorage.setItem("theme", "dark");
            } else {
                document.body.classList.add("light-mode");
                localStorage.setItem("theme", "light");
            }
        });
    }
}

// ==========================================
// SPLASH SCREEN CONTROL
// ==========================================
function hideSplash() {
    const splash = document.getElementById("splash");
    if (splash && !splash.classList.contains("hidden")) {
        splash.classList.add("hidden");
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {

    // --- SEARCH BUTTON TOGGLE ---
    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) {
        searchBtn.addEventListener("click", () => {
            if ((categoryPage && !categoryPage.classList.contains("hidden")) || 
                (settingsPage && !settingsPage.classList.contains("hidden"))) {
                return;
            }

            searchArea.classList.toggle("active");

            if (searchArea.classList.contains("active")) {
                search.focus();
            } else {
                search.value = "";
                renderChannels();
            }
        });
    }

    // --- PIP PLAYER BUTTON ---
    const pipPlayerBtn = document.getElementById("pipPlayerBtn");
    if (pipPlayerBtn) {
        pipPlayerBtn.addEventListener("click", toggleFloatingPlayer);
    }

    // --- FAVORITES HEADER BTN ---
    const favHeaderBtn = document.getElementById("favHeaderBtn");
    if (favHeaderBtn) {
        favHeaderBtn.addEventListener("click", () => {
            showNormalContent();
            currentCategory = "Favorites";
            updateSectionTitle();
            renderChannels();
            setActiveBottomNav(null);
        });
    }

    // --- REFRESH BUTTON ---
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            loadChannels();
        });
    }

    // --- SEARCH INPUT ---
    if (search) {
        search.addEventListener("input", () => {
            renderChannels();
        });
    }

    // --- CLOSE PLAYER BUTTON ---
    const closePlayerBtn = document.getElementById("closePlayerBtn");
    if (closePlayerBtn) {
        closePlayerBtn.addEventListener("click", closePlayer);
    }

    // ==========================================
    // BOTTOM NAVIGATION LISTENERS
    // ==========================================
    const liveEventBtn = document.getElementById("liveEventNav");
    const categoryNavBtn = document.getElementById("categoryNav");
    const sportsNavBtn = document.getElementById("sportsNav");
    const settingsNavBtn = document.getElementById("settingsNav");

    if (liveEventBtn) {
        liveEventBtn.addEventListener("click", () => {
            keepPlayerFloatingIfActive();
            setActiveBottomNav(liveEventBtn);
            hideCategoryPage();
            hideSettingsPage();
            currentCategory = "Live Event";

            const mainContent = document.querySelector(".main-content");
            if (mainContent) mainContent.style.display = "block";

            if (mainSectionTitle) mainSectionTitle.textContent = "🔴 Live Events";

            renderLiveEventsUI();
            startLiveEventsRefresh();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // ==========================================
    // LIVE EVENTS — এই সেকশনের সব কোড এখন আলাদা event.js ফাইলে আছে
    // (renderLiveEventsUI, loadLiveEvents, loadTeamSportEvents,
    // loadCricketEvents, startLiveEventsRefresh, stopLiveEventsRefresh,
    // findChannelForLeague, handleMatchCardClick ইত্যাদি — সব event.js-এ)
    // ==========================================


    if (categoryNavBtn) {
        categoryNavBtn.addEventListener("click", () => {
            keepPlayerFloatingIfActive();
            stopLiveEventsRefresh();
            setActiveBottomNav(categoryNavBtn);
            showCategoryPage();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    if (sportsNavBtn) {
        sportsNavBtn.addEventListener("click", () => {
            keepPlayerFloatingIfActive();
            stopLiveEventsRefresh();
            setActiveBottomNav(sportsNavBtn);
            hideCategoryPage();
            hideSettingsPage();
            showNormalContent();

            currentCategory = "Sports";
            updateSectionTitle();
            renderChannels();

            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    if (settingsNavBtn) {
        settingsNavBtn.addEventListener("click", () => {
            keepPlayerFloatingIfActive();
            stopLiveEventsRefresh();
            setActiveBottomNav(settingsNavBtn);
            showSettingsPage();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // --- CATEGORY GRID ITEMS ---
    document.querySelectorAll(".category-item").forEach(item => {
        item.addEventListener("click", () => {
            const selectedCategory = item.dataset.category;
            currentCategory = selectedCategory;

            hideCategoryPage();
            hideSettingsPage();
            showNormalContent();

            updateSectionTitle();
            renderChannels();

            if (selectedCategory === "Sports") {
                setActiveBottomNav(sportsNavBtn);
            } else {
                setActiveBottomNav(categoryNavBtn);
            }

            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });

    setupSettingsActions();
}

// ==========================================
// PLAYLIST MANAGER & SETTINGS LOGIC
// ==========================================
function setupSettingsActions() {
    const playlistItem = getSettingsItemByText("Playlists");
    const playlistModal = document.getElementById("playlistModal");
    const closePlaylistModal = document.getElementById("closePlaylistModal");
    const openAddPlaylistBtn = document.getElementById("openAddPlaylistBtn");
    const addPlaylistForm = document.getElementById("addPlaylistForm");
    const savePlaylistBtn = document.getElementById("savePlaylistBtn");

    if (playlistItem && playlistModal) {
        playlistItem.addEventListener("click", () => {
            playlistModal.classList.remove("hidden");
            renderPlaylists();
        });
    }

    if (closePlaylistModal) {
        closePlaylistModal.addEventListener("click", () => {
            playlistModal.classList.add("hidden");
        });
    }

    if (openAddPlaylistBtn) {
        openAddPlaylistBtn.addEventListener("click", () => {
            addPlaylistForm.classList.toggle("hidden");
        });
    }

    let uploadedFileContent = "";
    const playlistFileInput = document.getElementById("playlistFileInput");
    if (playlistFileInput) {
        playlistFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    uploadedFileContent = event.target.result;
                    alert(`Selected File: ${file.name}`);
                };
                reader.readAsText(file);
            }
        });
    }

    if (savePlaylistBtn) {
        savePlaylistBtn.addEventListener("click", async () => {
            const name = document.getElementById("playlistNameInput").value.trim() || "Custom Playlist";
            const url = document.getElementById("playlistUrlInput").value.trim();

            if (!url && !uploadedFileContent) {
                alert("Please enter a M3U URL or upload an M3U file!");
                return;
            }

            let parsedChannels = [];

            if (uploadedFileContent) {
                parsedChannels = parseM3UContent(uploadedFileContent);
            } else if (url) {
                try {
                    const res = await fetch(url);
                    const text = await res.text();
                    parsedChannels = parseM3UContent(text);
                } catch (err) {
                    parsedChannels = [{ id: Date.now(), name: name, category: "Custom", url: url, logo: "logo.png" }];
                }
            }

            if (parsedChannels.length === 0) {
                alert("No valid channels found in the Playlist!");
                return;
            }

            const newPL = {
                id: Date.now(),
                name: name,
                channels: parsedChannels
            };

            customPlaylists.push(newPL);
            localStorage.setItem("customPlaylists", JSON.stringify(customPlaylists));

            document.getElementById("playlistNameInput").value = "";
            document.getElementById("playlistUrlInput").value = "";
            uploadedFileContent = "";
            addPlaylistForm.classList.add("hidden");
            renderPlaylists();
        });
    }

    const networkStreamBtn = document.getElementById("settingsNetworkStreamBtn");
    if (networkStreamBtn) {
        networkStreamBtn.addEventListener("click", () => {
            const streamUrl = prompt("Enter Video or HLS (.m3u8) Stream URL:");
            if (streamUrl && streamUrl.trim() !== "") {
                playChannel({
                    name: "Network Stream",
                    url: streamUrl.trim(),
                    logo: "logo.png"
                });
            }
        });
    }

    const clearDataBtn = document.getElementById("settingsClearDataBtn");
    if (clearDataBtn) {
        clearDataBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all data and playlists?")) {
                localStorage.clear();
                location.reload();
            }
        });
    }

    const exitBtn = document.getElementById("settingsExitBtn");
    if (exitBtn) {
        exitBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to exit?")) {
                if (window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.close();
                } else if (window.navigator && window.navigator.app && window.navigator.app.exitApp) {
                    window.navigator.app.exitApp();
                } else {
                    window.close();
                }
            }
        });
    }

    // NOTICE MODAL LOGIC
    const noticeItem = document.getElementById("settingsNoticeBtn") || getSettingsItemByText("Notice");
    const noticeModal = document.getElementById("noticeModal");
    const closeNoticeModal = document.getElementById("closeNoticeModal");

    if (noticeItem && noticeModal) {
        noticeItem.addEventListener("click", () => {
            noticeModal.classList.remove("hidden");
            loadNoticeContent();
        });
    }

    if (closeNoticeModal) {
        closeNoticeModal.addEventListener("click", () => {
            noticeModal.classList.add("hidden");
        });
    }

    if (noticeModal) {
        noticeModal.addEventListener("click", (e) => {
            if (e.target === noticeModal) {
                noticeModal.classList.add("hidden");
            }
        });
    }

    // COPYRIGHT MODAL LOGIC
    const copyrightBtn = document.getElementById("settingsCopyrightBtn") || getSettingsItemByText("Copyright");
    const copyrightModal = document.getElementById("copyrightModal");
    const closeCopyrightModal = document.getElementById("closeCopyrightModal");

    if (copyrightBtn && copyrightModal) {
        copyrightBtn.addEventListener("click", () => {
            copyrightModal.classList.remove("hidden");
        });
    }

    if (closeCopyrightModal && copyrightModal) {
        closeCopyrightModal.addEventListener("click", () => {
            copyrightModal.classList.add("hidden");
        });
    }

    if (copyrightModal) {
        copyrightModal.addEventListener("click", (e) => {
            if (e.target === copyrightModal) copyrightModal.classList.add("hidden");
        });
    }

    // SHARE APP LOGIC
    const shareBtn = document.getElementById("settingsShareBtn") || getSettingsItemByText("Share Our App");
    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            const shareData = {
                title: "StreamZX - Live TV & Sports",
                text: "StreamZX অ্যাপ দিয়ে সরাসরি ফ্রিতে দেখুন সকল লাইভ স্পোর্টস ও টিভি চ্যানেল। অ্যাপটি এখনই ডাউনলোড করুন!",
                url: window.location.href
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.log("Sharing cancelled", err);
                }
            } else {
                navigator.clipboard.writeText(shareData.url);
                alert("App link copied to clipboard! Share it with your friends.");
            }
        });
    }

    // EMAIL CONTACT LOGIC
    const emailBtn = document.getElementById("settingsEmailBtn") || getSettingsItemByText("Email Us") || getSettingsItemByText("Email");
    if (emailBtn) {
        emailBtn.addEventListener("click", () => {
            const adminEmail = "support@streamzx.com";
            const subject = encodeURIComponent("StreamZX App Support / DMCA Request");
            const body = encodeURIComponent("Hello StreamZX Team,\n\nI want to inform/ask about:\n");

            window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
        });
    }
}

// ==========================================
// LOAD NOTICE CONTENT FUNCTION
// ==========================================
function loadNoticeContent() {
    const noticeBody = document.getElementById("noticeBody");
    if (!noticeBody) return;

    const noticeData = {
        title: "📢 StreamZX আপডেট ও ঘোষণা",
        date: new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' }),
        message: "আমাদের StreamZX অ্যাপে স্বাগতম! কোনো চ্যানেল চলতে সমস্যা হলে রিফ্রেশ বাটন ব্যবহার করুন। সর্বাধুনিক স্পোর্টস লিঙ্ক এবং আপডেট পাওয়ার জন্য আমাদের টেলিগ্রাম চ্যানেলে যুক্ত থাকুন।"
    };

    noticeBody.innerHTML = `
        <div class="notice-box" style="text-align: left;">
            <h4 style="margin-bottom: 6px; color: var(--primary, #ff2a4b); font-size: 16px;">${escapeHTML(noticeData.title)}</h4>
            <small style="color: var(--text-muted, #888); display: block; margin-bottom: 12px; font-size: 11px;">📅 তারিখ: ${escapeHTML(noticeData.date)}</small>
            <p style="font-size: 14px; line-height: 1.6; color: var(--text-primary);">${escapeHTML(noticeData.message)}</p>
        </div>
    `;
}

function renderPlaylists() {
    const container = document.getElementById("playlistContainer");
    if (!container) return;

    if (customPlaylists.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">No custom playlists added yet.</div>`;
        return;
    }

    container.innerHTML = "";
    customPlaylists.forEach((pl, index) => {
        const item = document.createElement("div");
        item.className = "playlist-item-card";
        item.innerHTML = `
            <div class="playlist-item-info">
                <i class="fa-solid fa-folder-play"></i>
                <div>
                    <strong>${escapeHTML(pl.name)}</strong>
                    <div style="font-size:11px; color:var(--text-muted);">${pl.channels.length} Channels</div>
                </div>
            </div>
            <div class="playlist-item-actions">
                <button class="play-pl-btn"><i class="fa-solid fa-play"></i> Load</button>
                <button class="del-pl-btn"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        item.querySelector(".play-pl-btn").addEventListener("click", () => {
            channels = pl.channels;
            currentCategory = pl.name;
            showNormalContent();
            if (mainSectionTitle) mainSectionTitle.textContent = "📁 " + pl.name;
            renderChannels();
            document.getElementById("playlistModal").classList.add("hidden");
            hideSettingsPage();
        });

        item.querySelector(".del-pl-btn").addEventListener("click", () => {
            if (confirm("Delete this playlist?")) {
                customPlaylists.splice(index, 1);
                localStorage.setItem("customPlaylists", JSON.stringify(customPlaylists));
                renderPlaylists();
            }
        });

        container.appendChild(item);
    });
}

function parseM3UContent(m3uData) {
    const lines = m3uData.split("\n");
    const parsedList = [];
    let currentChannel = {};

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line.startsWith("#EXTINF:")) {
            currentChannel = {};
            const nameParts = line.split(",");
            currentChannel.name = nameParts[nameParts.length - 1].trim() || "Channel";

            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            currentChannel.logo = logoMatch ? logoMatch[1] : "logo.png";

            const groupMatch = line.match(/group-title="([^"]+)"/);
            currentChannel.category = groupMatch ? groupMatch[1] : "Custom";
            currentChannel.id = "pl_" + Math.random().toString(36).substr(2, 9);
        } else if (line.length > 0 && !line.startsWith("#")) {
            currentChannel.url = line;
            if (currentChannel.name) {
                parsedList.push(currentChannel);
            }
            currentChannel = {};
        }
    }
    return parsedList;
}

function getSettingsItemByText(text) {
    const items = document.querySelectorAll('.settings-item span');
    for (let span of items) {
        if (span.textContent.trim().toLowerCase() === text.toLowerCase()) {
            return span.closest('.settings-item');
        }
    }
    return null;
}

// ==========================================
// PAGE CONTROLS
// ==========================================
function showCategoryPage() {
    if (categoryPage) categoryPage.classList.remove("hidden");
    hideSettingsPage();

    const mainContent = document.querySelector(".main-content");
    if (mainContent) mainContent.style.display = "none";
    if (searchArea) searchArea.classList.remove("active");
}

function hideCategoryPage() {
    if (categoryPage) categoryPage.classList.add("hidden");
}

function showSettingsPage() {
    if (settingsPage) settingsPage.classList.remove("hidden");
    hideCategoryPage();

    const mainContent = document.querySelector(".main-content");
    if (mainContent) mainContent.style.display = "none";
    if (searchArea) searchArea.classList.remove("active");
}

function hideSettingsPage() {
    if (settingsPage) settingsPage.classList.add("hidden");
}

function showNormalContent() {
    hideCategoryPage();
    hideSettingsPage();

    const mainContent = document.querySelector(".main-content");
    if (mainContent) mainContent.style.display = "block";
}

function setActiveBottomNav(activeButton) {
    document.querySelectorAll(".bottom-nav-btn").forEach(button => {
        button.classList.remove("active");
    });
    if (activeButton) {
        activeButton.classList.add("active");
    }
}

function updateSectionTitle() {
    const titles = {
        Sports: " Sports Channels",
        Entertainment: " Entertainment Channels",
        News: " News Channels",
        Movies: " Movies Channels",
        Islamic: " Islamic Channels",
        Kids: " Kids Channels",
        Music: " Music Channels",
        Favorites: " Favorite Channels"
    };

    if (mainSectionTitle) {
        mainSectionTitle.textContent = titles[currentCategory] || "📺 Channels";
    }
}

// ==========================================
// FETCH CHANNELS DATA
// ==========================================
async function loadChannels() {
    if (!channelList) return;

    channelList.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted, #888);">
            ⏳ Loading channels...
        </div>
    `;

    try {
        const response = await fetch("channels.json?t=" + Date.now(), { cache: "no-store" });

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
            channels = data;
        } else if (data && Array.isArray(data.channels)) {
            channels = data.channels;
        } else {
            channels = [];
        }

        if (isInitialLoad) {
            isInitialLoad = false;
            const liveEventBtn = document.getElementById("liveEventNav");
            if (liveEventBtn) {
                liveEventBtn.click();
            } else {
                renderChannels();
            }
        } else {
            if (currentCategory === "Live Event") {
                const liveEventBtn = document.getElementById("liveEventNav");
                if (liveEventBtn) liveEventBtn.click();
            } else {
                renderChannels();
            }
        }

    } catch (error) {
        console.error("Channel loading error:", error);

        channelList.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">
                ❌ Could not load channels.json
                <br>
                <small style="color:var(--text-muted, #888); display:block; margin-top:8px;">
                    ${escapeHTML(error.message)}
                </small>
            </div>
        `;
    } finally {
        hideSplash();
    }
}

// ==========================================
// CATEGORY MAPPING
// channels.json-এ থাকা যেকোনো raw category-কে আমাদের
// ৭টা fixed ট্যাবের (Sports/Entertainment/News/Movies/Islamic/Kids/Music)
// একটা বা একাধিকটার সাথে ম্যাপ করে। যেসব category কোনো ট্যাবের
// নামের সাথে মেলে না (Radio, Documentary, Religious ইত্যাদি),
// সেগুলো আগে কোনো ট্যাবেই দেখা যেত না — এখন সবচেয়ে কাছাকাছি
// ট্যাবে দেখাবে।
// ==========================================
const CATEGORY_MAP = {
    "Entertainment": ["Entertainment"],
    "Music": ["Music"],
    "Entertainment & Sports": ["Entertainment", "Sports"],
    "Sports": ["Sports"],
    "News": ["News"],
    "Kids": ["Kids"],
    "Music & Entertainment": ["Music", "Entertainment"],
    "International": ["News"],
    "Radio": ["Music"],
    "Islamic": ["Islamic"],
    "Documentary & Travel": ["Entertainment"],
    "Fashion & Lifestyle": ["Entertainment"],
    "Religious": ["Islamic"],
    "Movies": ["Movies"],
    "VOD Movies": ["Movies"],
    "Lifestyle & Food": ["Entertainment"],
    "Entertainment & News": ["Entertainment", "News"],
    "Documentary": ["Entertainment"],
    "News & International": ["News"]
};
const KNOWN_TABS = ["Sports", "Entertainment", "News", "Movies", "Islamic", "Kids", "Music", "Akash Go"];

function getDisplayCategories(rawCategory) {
    if (CATEGORY_MAP[rawCategory]) return CATEGORY_MAP[rawCategory];

    // channels.json-এ নতুন কোনো category যোগ হলে (আমাদের ম্যাপে নেই),
    // প্রথমে substring মিল খোঁজে, নাহলে Entertainment-এ ফেলে দেয়
    // যাতে কোনো চ্যানেল আর অদৃশ্য হয়ে না থাকে।
    const lower = String(rawCategory || "").toLowerCase();
    const matches = KNOWN_TABS.filter(tab => lower.includes(tab.toLowerCase()));
    return matches.length ? matches : ["Entertainment"];
}

const CATEGORY_LOGO_FILES = {
    Sports: "categorylogos/sports.png",
    Entertainment: "categorylogos/entertainment.png",
    News: "categorylogos/news.png",
    Movies: "categorylogos/movies.png",
    Islamic: "categorylogos/islamic.png",
    Kids: "categorylogos/kids.png",
    Music: "categorylogos/music.png"
};

function getFallbackLogo(channel) {
    const displayCats = getDisplayCategories(channel.category);
    return CATEGORY_LOGO_FILES[displayCats[0]] || "logo.png";
}

// ==========================================
// RENDER MAIN CHANNELS
// ==========================================
function renderChannels() {
    if (!channelList) return;

    channelList.innerHTML = "";
    const keyword = search ? search.value.toLowerCase().trim() : "";

    const filtered = channels.filter(channel => {
        const name = String(channel.name || "").toLowerCase();
        const nameMatch = name.includes(keyword);

        let categoryMatch = false;
        if (currentCategory === "Favorites") {
            categoryMatch = favorites.includes(channel.id);
        } else {
            categoryMatch = getDisplayCategories(channel.category).includes(currentCategory);
        }

        return nameMatch && categoryMatch;
    });

    if (!filtered.length) {
        channelList.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted, #888);">
                🔍 No channels found.
            </div>
        `;
        return;
    }

    filtered.forEach(channel => {
        const isFav = favorites.includes(channel.id);
        const card = document.createElement("div");
        card.className = "channel-card";

        const fallbackLogo = getFallbackLogo(channel);

        card.innerHTML = `
            <button class="fav-btn ${isFav ? "active" : ""}" title="Favorite">
                <i class="${isFav ? "fa-solid" : "fa-regular"} fa-star"></i>
            </button>
            <img src="${escapeHTML(channel.logo || fallbackLogo)}" alt="${escapeHTML(channel.name || "TV")}" onerror="this.onerror=null;this.src='${escapeHTML(fallbackLogo)}';">
            <h4>${escapeHTML(channel.name || "Unknown")}</h4>
        `;

        const favBtn = card.querySelector(".fav-btn");
        favBtn.addEventListener("click", event => {
            toggleFavorite(channel.id, event);
        });

        card.addEventListener("click", () => {
            playChannelWithAd(channel);
        });

        channelList.appendChild(card);
    });
}

// ==========================================
// TOGGLE FAVORITE
// ==========================================
function toggleFavorite(channelId, event) {
    if (event) event.stopPropagation();

    const index = favorites.indexOf(channelId);
    if (index === -1) {
        favorites.push(channelId);
    } else {
        favorites.splice(index, 1);
    }

    localStorage.setItem("favChannels", JSON.stringify(favorites));
    renderChannels();
}

// ==========================================
// ESCAPE HTML UTILITY
// ==========================================
function escapeHTML(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ==========================================
// MONETAG AD HANDLER
// ==========================================
function playChannelWithAd(channel) {
    if (!channel || !channel.url) return;

    if (firstChannelAdShown) {
        playChannel(channel);
        return;
    }

    if (typeof show_11580289 !== "function") {
        firstChannelAdShown = true;
        playChannel(channel);
        return;
    }

    if (isAdShowing) return;
    isAdShowing = true;

    try {
        const ad = show_11580289("pop");

        if (ad && typeof ad.then === "function") {
            ad.then(() => {
                firstChannelAdShown = true;
                isAdShowing = false;
                playChannel(channel);
            }).catch(() => {
                firstChannelAdShown = true;
                isAdShowing = false;
                playChannel(channel);
            });
        } else {
            firstChannelAdShown = true;
            isAdShowing = false;
            playChannel(channel);
        }
    } catch (error) {
        console.error("Monetag error:", error);
        firstChannelAdShown = true;
        isAdShowing = false;
        playChannel(channel);
    }
}

// ==========================================
// PLAY CHANNEL / STREAM
// ==========================================
// ==========================================
// একটা চ্যানেলের সার্ভার লিস্ট বের করা
// channels.json-এ "servers": [{name,url}, ...] থাকলে সেটাই ব্যবহার হবে,
// না থাকলে পুরনো "url" ফিল্ড দিয়ে একটামাত্র সার্ভার ধরে নেওয়া হয়
// ==========================================
function getChannelServers(channel) {
    if (channel && Array.isArray(channel.servers) && channel.servers.length > 0) {
        return channel.servers;
    }
    return [{ name: "Server 1", url: channel ? channel.url : "" }];
}

function renderServerSelector(channel, activeIndex) {
    const selectorEl = document.getElementById("serverSelector");
    if (!selectorEl) return;

    const servers = getChannelServers(channel);

    if (servers.length <= 1) {
        selectorEl.classList.add("hidden");
        selectorEl.innerHTML = "";
        return;
    }

    selectorEl.classList.remove("hidden");
    selectorEl.innerHTML = "";

    servers.forEach((server, idx) => {
        const btn = document.createElement("button");
        const isActive = idx === activeIndex;
        btn.textContent = server.name || `Server ${idx + 1}`;
        btn.style.cssText = `flex-shrink:0; padding:8px 16px; border-radius:8px; border:1px solid ${isActive ? "var(--primary, #ff2a4b)" : "rgba(255,255,255,0.2)"}; background:${isActive ? "var(--primary, #ff2a4b)" : "transparent"}; color:#fff; font-size:13px;`;
        btn.addEventListener("click", () => playChannel(channel, idx));
        selectorEl.appendChild(btn);
    });
}

function playChannel(channel, serverIndex = 0) {
    if (!channel) return;

    const servers = getChannelServers(channel);
    const selectedServer = servers[serverIndex] || servers[0];
    if (!selectedServer || !selectedServer.url) return;

    if (currentChannelName) currentChannelName.textContent = channel.name || "Live TV";
    if (playerContainer) {
        playerContainer.classList.remove("hidden");
        playerContainer.classList.remove("player-mini");
        playerContainer.style.left = "";
        playerContainer.style.top = "";
        playerContainer.style.right = "";
        playerContainer.style.bottom = "";
    }
    playerIsMinimized = false;
    const miniPlayPauseBtnEl = document.getElementById("miniPlayPauseBtn");
    if (miniPlayPauseBtnEl) miniPlayPauseBtnEl.innerHTML = '<i class="fa-solid fa-pause"></i>';

    renderServerSelector(channel, serverIndex);

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }

    const url = String(selectedServer.url).trim();

    if (typeof Hls !== "undefined" && Hls.isSupported() && (url.includes(".m3u8") || url.includes("m3u8"))) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (video) {
                video.play().catch(error => console.log("Autoplay blocked:", error));
            }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error("HLS error:", data);
        });
    } else if (video && video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.play().catch(error => console.log("Autoplay blocked:", error));
    } else if (video) {
        video.src = url;
        video.play().catch(error => console.log("Autoplay blocked:", error));
    }

    resetOverlayTimeout();

    try {
        localStorage.setItem("lastChannel", JSON.stringify(channel));
    } catch (e) {
        console.warn("Unable to save lastChannel", e);
    }
}

// ==========================================
// CLOSE PLAYER
// ==========================================
function closePlayer() {
    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
    }

    if (playerContainer) {
        playerContainer.classList.add("hidden");
        playerContainer.classList.remove("player-mini");
    }
    playerIsMinimized = false;

    const selectorEl = document.getElementById("serverSelector");
    if (selectorEl) {
        selectorEl.classList.add("hidden");
        selectorEl.innerHTML = "";
    }
}

// ==========================================
// মিনি/ফ্লোটিং প্লেয়ার — স্ক্রল করলে বা অন্য ট্যাবে গেলে
// প্লেয়ার হারিয়ে না গিয়ে ছোট popup আকারে দেখা যাবে
// ==========================================
let playerIsMinimized = false;

function isPlayerActive() {
    return playerContainer
        && !playerContainer.classList.contains("hidden")
        && video
        && !video.paused;
}

function minimizePlayer() {
    if (!playerContainer || playerIsMinimized) return;
    if (!isPlayerActive()) return;
    playerContainer.classList.add("player-mini");
    playerIsMinimized = true;
}

function restorePlayer() {
    if (!playerContainer || !playerIsMinimized) return;
    playerContainer.classList.remove("player-mini");
    playerContainer.style.left = "";
    playerContainer.style.top = "";
    playerContainer.style.right = "";
    playerContainer.style.bottom = "";
    playerIsMinimized = false;
}

// মিনি প্লেয়ারের নিজস্ব বাটন — Play/Pause, Expand (বড় করা), Close
const miniPlayPauseBtn = document.getElementById("miniPlayPauseBtn");
const miniExpandBtn = document.getElementById("miniExpandBtn");
const miniCloseBtn = document.getElementById("miniCloseBtn");

if (miniPlayPauseBtn) {
    miniPlayPauseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!video) return;
        if (video.paused) {
            video.play();
            miniPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            video.pause();
            miniPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    });
}

if (miniExpandBtn) {
    miniExpandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        restorePlayer();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

if (miniCloseBtn) {
    miniCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closePlayer();
    });
}

// মিনি প্লেয়ারে ট্যাপ করলে (বাটন ছাড়া অন্য জায়গায়) আবার বড় হয়ে যাবে —
// কিন্তু ড্র্যাগ করে সরানোর পর যেন ভুল করে বড় না হয়ে যায়, সেটাও খেয়াল রাখা হচ্ছে
let dragMoved = false;
if (playerContainer) {
    playerContainer.addEventListener("click", () => {
        if (playerIsMinimized && !dragMoved) {
            restorePlayer();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        dragMoved = false;
    });
}

// মিনি প্লেয়ার ড্র্যাগ করে স্ক্রিনের যেকোনো জায়গায় সরানো যাবে
(function enableMiniPlayerDrag() {
    if (!playerContainer) return;
    let dragging = false;
    let startX, startY, startLeft, startTop;

    function onPointerDown(e) {
        if (!playerIsMinimized) return;
        if (e.target.closest("button")) return; // বাটনে ক্লিক করলে ড্র্যাগ শুরু হবে না
        dragging = true;
        dragMoved = false;
        const rect = playerContainer.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        startY = (e.touches ? e.touches[0].clientY : e.clientY);
        playerContainer.style.right = "auto";
        playerContainer.style.bottom = "auto";
        playerContainer.style.left = startLeft + "px";
        playerContainer.style.top = startTop + "px";
    }

    function onPointerMove(e) {
        if (!dragging) return;
        const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragMoved = true;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        const maxLeft = window.innerWidth - playerContainer.offsetWidth;
        const maxTop = window.innerHeight - playerContainer.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        playerContainer.style.left = newLeft + "px";
        playerContainer.style.top = newTop + "px";
    }

    function onPointerUp() {
        dragging = false;
    }

    playerContainer.addEventListener("mousedown", onPointerDown);
    playerContainer.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("touchmove", onPointerMove, { passive: true });
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("touchend", onPointerUp);
})();

// স্ক্রল করলে প্লেয়ার ছোট হয়ে যাবে, উপরে ফিরে গেলে আবার বড়
window.addEventListener("scroll", () => {
    if (!isPlayerActive()) return;
    if (window.scrollY > 80) {
        minimizePlayer();
    } else {
        restorePlayer();
    }
});

// নিচের/উপরের যেকোনো ট্যাবে ক্লিক করলে, ভিডিও চলতে থাকলে
// সেটা মিনি-প্লেয়ার আকারে রয়ে যাবে (হারিয়ে যাবে না)
function keepPlayerFloatingIfActive() {
    if (isPlayerActive()) {
        minimizePlayer();
    }
}

// ==========================================
// FLOATING PLAYER (PICTURE-IN-PICTURE) LOGIC
// ==========================================
async function toggleFloatingPlayer() {
    const videoElement = document.getElementById("video");

    if (!videoElement) {
        alert("Video player not found!");
        return;
    }

    if (videoElement.paused || (!videoElement.src && !videoElement.srcObject)) {
        alert("Please play a channel first to use Floating Player!");
        return;
    }

    try {
        if (document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoElement.requestPictureInPicture();
            }
        } else {
            alert("Picture-in-Picture mode is not supported in this browser.");
        }
    } catch (error) {
        console.error("Floating Player Error:", error);
    }
}
